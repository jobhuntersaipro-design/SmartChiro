"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { AlertTriangle, Loader2 } from "lucide-react";
import { FOCUS_FOV_DEG, focusView } from "@/lib/anatomy/camera";
import {
  ANATOMY_PARTS,
  MODEL_URLS,
  expansionFor,
  isPeeledAway,
  type AnatomyLayer,
  type AnatomyPart,
  type MuscleLayer,
} from "@/lib/anatomy/parts";
import { unitIdsOf, unitLabelOf } from "@/lib/anatomy/muscle-groups";
import { getModelProgress, getServerModelProgress, loadModel, subscribeModelProgress } from "./model-loader";

export interface FocusRequest {
  ids: string[];
  nonce: number;
  /** Optional preferred viewing direction (world space, from the target out to the camera). */
  direction?: [number, number, number];
}

interface AnatomyViewerProps {
  layer: AnatomyLayer;
  selectedIds: string[];
  hiddenGroups: Set<string>;
  isolate: boolean;
  showSkeletonUnderlay: boolean;
  focusRequest: FocusRequest | null;
  resetNonce: number;
  /** Muscles only: peel down to this layer (1 shows everything). */
  peelDepth: MuscleLayer;
  /** Muscles only: exploded-view amount, 0–1. */
  expansion: number;
  /** Muscle groups to expand; empty expands the whole body. */
  expandGroups: Set<string>;
  onPartClick: (id: string, options: PartClickOptions) => void;
}

export interface PartClickOptions {
  /** Shift / Cmd / Ctrl: add to or remove from the current selection. */
  additive: boolean;
  /** Alt: pick the single muscle instead of its whole clinical group. */
  single: boolean;
}

type Tone = "bone" | "disc" | "muscle" | "underlay";
type PartState = "base" | "hover" | "selected" | "ghost";
type MaterialSet = Record<Tone, Record<PartState, THREE.Material>>;
type MeshRegistry = Map<string, THREE.Mesh>;

const PART_LOOKUP: Record<AnatomyLayer, Map<string, AnatomyPart>> = {
  skeleton: new Map(ANATOMY_PARTS.skeleton.map((p) => [p.id, p])),
  muscles: new Map(ANATOMY_PARTS.muscles.map((p) => [p.id, p])),
};

const HOME_POSITION = [0, 0.95, 3.7] as const;
const HOME_TARGET = [0, 0.85, 0] as const;
const CLICK_DRAG_TOLERANCE_PX = 5;
const BRAND = "#635BFF";

function createMaterials(): MaterialSet {
  const tones: Record<Tone, () => THREE.MeshStandardMaterial> = {
    bone: () => new THREE.MeshStandardMaterial({ color: "#e8dcc6", roughness: 0.55, metalness: 0.02 }),
    disc: () => new THREE.MeshStandardMaterial({ color: "#8fb3c9", roughness: 0.4, metalness: 0 }),
    muscle: () =>
      new THREE.MeshPhysicalMaterial({
        color: "#a4302b",
        roughness: 0.42,
        clearcoat: 0.25,
        clearcoatRoughness: 0.5,
        sheen: 0.6,
        sheenColor: new THREE.Color("#ff9d8c"),
      }),
    underlay: () => new THREE.MeshStandardMaterial({ color: "#d9cdb6", roughness: 0.6 }),
  };

  const set = {} as MaterialSet;
  for (const tone of Object.keys(tones) as Tone[]) {
    const base = tones[tone]();
    const hover = base.clone();
    hover.emissive = new THREE.Color(BRAND);
    hover.emissiveIntensity = 0.35;
    const selected = base.clone();
    selected.color.lerp(new THREE.Color(BRAND), 0.55);
    selected.emissive = new THREE.Color(BRAND);
    selected.emissiveIntensity = 0.45;
    const ghost = base.clone();
    ghost.transparent = true;
    ghost.opacity = 0.08;
    ghost.depthWrite = false;
    set[tone] = { base, hover, selected, ghost };
  }
  return set;
}

function toneFor(layer: AnatomyLayer, part: AnatomyPart | undefined): Tone {
  if (layer === "muscles") return "muscle";
  return part?.group === "discs" ? "disc" : "bone";
}

/** Lights the model with a procedural studio environment — no HDR download. */
function StudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const texture = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return env;
  }, [gl]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive object={texture} attach="environment" />;
}

interface ModelMesh {
  id: string;
  mesh: THREE.Mesh;
}

/** Starts downloading a layer's model ahead of time (e.g. on tab hover). */
export function preloadLayer(layer: AnatomyLayer) {
  void loadModel(MODEL_URLS[layer]);
}

function useModelMeshes(layer: AnatomyLayer): ModelMesh[] {
  const gltf = use(loadModel(MODEL_URLS[layer]));
  const scene = gltf?.scene;
  return useMemo(() => {
    const out: ModelMesh[] = [];
    if (!scene) return out;
    scene.updateMatrixWorld(true);
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        out.push({ id: (obj.userData.name as string | undefined) ?? obj.name, mesh: obj });
      }
    });
    return out;
  }, [scene]);
}

interface PartMeshProps {
  id: string;
  source: THREE.Mesh;
  material: THREE.Material;
  visible: boolean;
  interactive: boolean;
  registry?: MeshRegistry;
  offsetRegistry?: Map<string, THREE.Group>;
  onHover?: (id: string, event: ThreeEvent<PointerEvent>) => void;
  onHoverEnd?: (id: string) => void;
  onMove?: (event: ThreeEvent<PointerEvent>) => void;
  onSelect?: (id: string, event: ThreeEvent<MouseEvent>) => void;
}

function PartMesh({
  id,
  source,
  material,
  visible,
  interactive,
  registry,
  offsetRegistry,
  onHover,
  onHoverEnd,
  onMove,
  onSelect,
}: PartMeshProps) {
  const pickable = interactive && visible;
  return (
    <group
      ref={(group) => {
        if (!offsetRegistry) return;
        if (group) offsetRegistry.set(id, group);
        else offsetRegistry.delete(id);
      }}
    >
      <mesh
        ref={(mesh) => {
          if (!registry) return;
          if (mesh) registry.set(id, mesh);
          else registry.delete(id);
        }}
        geometry={source.geometry}
        matrixAutoUpdate={false}
        matrix={source.matrixWorld}
        material={material}
        visible={visible}
        raycast={pickable ? THREE.Mesh.prototype.raycast : () => undefined}
        onPointerOver={
          pickable
            ? (e) => {
                e.stopPropagation();
                onHover?.(id, e);
              }
            : undefined
        }
        onPointerOut={pickable ? () => onHoverEnd?.(id) : undefined}
        onPointerMove={pickable ? onMove : undefined}
        onClick={
          pickable
            ? (e) => {
                e.stopPropagation();
                onSelect?.(id, e);
              }
            : undefined
        }
      />
    </group>
  );
}

const EXPLODE_EASING = 9; // per second; higher settles faster

/**
 * Eases each muscle toward its exploded offset (`explode` vector × amount).
 * Runs inside the demand frameloop: it keeps requesting frames only while
 * something is still moving.
 */
function useExplodedView(layer: AnatomyLayer, amount: number, groups: Set<string> | undefined) {
  const offsets = useMemo(() => new Map<string, THREE.Group>(), []);
  const current = useRef(new Map<string, number>());
  const invalidate = useThree((state) => state.invalidate);
  const scope = useMemo(() => groups ?? new Set<string>(), [groups]);

  useEffect(() => invalidate(), [amount, scope, invalidate]);

  useFrame((_, delta) => {
    if (layer !== "muscles") return;
    const t = 1 - Math.exp(-delta * EXPLODE_EASING);
    let moving = false;
    for (const [id, group] of offsets) {
      const part = PART_LOOKUP.muscles.get(id);
      if (!part?.explode) continue;
      const target = expansionFor(part, amount, scope);
      let value = current.current.get(id) ?? 0;
      if (Math.abs(target - value) < 1e-3) value = target;
      else {
        value += (target - value) * t;
        moving = true;
      }
      current.current.set(id, value);
      group.position.set(part.explode[0] * value, part.explode[1] * value, part.explode[2] * value);
    }
    if (moving) invalidate();
  });

  return offsets;
}

interface LayerModelProps {
  layer: AnatomyLayer;
  materials: MaterialSet;
  interactive: boolean;
  selected?: Set<string>;
  hoveredIds?: Set<string>;
  hiddenGroups?: Set<string>;
  isolate?: boolean;
  peelDepth?: MuscleLayer;
  expansion?: number;
  expandGroups?: Set<string>;
  registry?: MeshRegistry;
  onHover?: PartMeshProps["onHover"];
  onHoverEnd?: PartMeshProps["onHoverEnd"];
  onMove?: PartMeshProps["onMove"];
  onSelect?: PartMeshProps["onSelect"];
}

function LayerModel({
  layer,
  materials,
  interactive,
  selected,
  hoveredIds,
  hiddenGroups,
  isolate,
  peelDepth = 1,
  expansion = 0,
  expandGroups,
  registry,
  onHover,
  onHoverEnd,
  onMove,
  onSelect,
}: LayerModelProps) {
  const meshes = useModelMeshes(layer);
  const lookup = PART_LOOKUP[layer];
  const hasSelection = (selected?.size ?? 0) > 0;
  const offsets = useExplodedView(layer, expansion, expandGroups);

  return (
    <group>
      {meshes.map(({ id, mesh }) => {
        const part = lookup.get(id);
        const tone: Tone = interactive ? toneFor(layer, part) : "underlay";
        let state: PartState = "base";
        if (selected?.has(id)) state = "selected";
        else if (hoveredIds?.has(id)) state = "hover";
        else if (isolate && hasSelection) state = "ghost";
        const visible = !(part && (hiddenGroups?.has(part.group) || isPeeledAway(part, peelDepth)));
        return (
          <PartMesh
            key={id}
            id={id}
            source={mesh}
            material={materials[tone][state]}
            visible={visible}
            interactive={interactive && state !== "ghost"}
            registry={registry}
            offsetRegistry={offsets}
            onHover={onHover}
            onHoverEnd={onHoverEnd}
            onMove={onMove}
            onSelect={onSelect}
          />
        );
      })}
    </group>
  );
}

interface CameraRigProps {
  registry: MeshRegistry;
  focusRequest: FocusRequest | null;
  resetNonce: number;
  container: React.RefObject<HTMLDivElement | null>;
}

const { ACTION } = CameraControlsImpl;
const GHOST_OPACITY_CUTOFF = 0.2;

/** True when the ray hits any visible, non-ghosted mesh (including the non-interactive underlay). */
function rayHitsModel(raycaster: THREE.Raycaster, scene: THREE.Scene): boolean {
  const hits: THREE.Intersection[] = [];
  scene.traverseVisible((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material as THREE.Material;
    if (material.transparent && material.opacity < GHOST_OPACITY_CUTOFF) return;
    // Call the prototype directly: underlay meshes stub out their own raycast.
    THREE.Mesh.prototype.raycast.call(obj, raycaster, hits);
  });
  return hits.length > 0;
}

function CameraRig({ registry, focusRequest, resetNonce, container }: CameraRigProps) {
  const controls = useRef<CameraControls>(null);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  // Like the X-ray viewer's hand tool: a drag that starts on the model rotates
  // it, a drag that starts on empty space moves (pans) the view.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function onPointerDown(e: PointerEvent) {
      const cc = controls.current;
      if (!cc || e.button !== 0 || e.target !== gl.domElement) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, cc.camera);
      const onModel = rayHitsModel(raycaster, scene);
      cc.mouseButtons.left = onModel ? ACTION.ROTATE : ACTION.TRUCK;
      cc.touches.one = onModel ? ACTION.TOUCH_ROTATE : ACTION.TOUCH_TRUCK;
      if (!onModel && el) el.style.cursor = "grabbing";
    }
    function onPointerUp() {
      if (el?.style.cursor === "grabbing") el.style.cursor = "";
    }

    // Capture phase on an ancestor so the action is set before camera-controls sees the event.
    el.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [container, gl, scene]);

  useEffect(() => {
    const cc = controls.current;
    if (!focusRequest || !cc) return;
    const box = new THREE.Box3();
    for (const id of focusRequest.ids) {
      const mesh = registry.get(id);
      if (mesh) box.expandByObject(mesh);
    }
    if (box.isEmpty()) return;
    const [x, y, z, tx, ty, tz] = focusView(
      box,
      cc.camera.position,
      cc.getTarget(new THREE.Vector3()),
      focusRequest.direction,
    );
    void cc.setLookAt(x, y, z, tx, ty, tz, true);
  }, [focusRequest, registry]);

  useEffect(() => {
    void controls.current?.setLookAt(...HOME_POSITION, ...HOME_TARGET, resetNonce > 0);
  }, [resetNonce]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={0.12}
      maxDistance={6}
      smoothTime={0.35}
      draggingSmoothTime={0.08}
    />
  );
}

function formatMb(bytes: number) {
  return (bytes / 1e6).toFixed(1);
}

function LoadingOverlay({ layer }: { layer: AnatomyLayer }) {
  const snapshot = useSyncExternalStore(subscribeModelProgress, getModelProgress, getServerModelProgress);
  const progress = snapshot[MODEL_URLS[layer]];
  if (progress?.failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/85">
        <AlertTriangle className="h-6 w-6 text-[#F5A623]" strokeWidth={1.5} />
        <span className="text-[14px]">Couldn&apos;t load the 3D model.</span>
        <button
          onClick={() => window.location.reload()}
          className="rounded-[4px] border border-white/20 bg-white/10 px-3 py-1 text-[13px] font-medium hover:bg-white/20"
        >
          Reload
        </button>
      </div>
    );
  }
  if (progress?.done) return null;
  const loaded = progress?.loaded ?? 0;
  const total = progress?.total ?? 0;
  const pct = total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
      <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} />
      <span className="text-[14px]">Loading high-resolution {layer === "muscles" ? "muscle" : "skeleton"} model…</span>
      <div className="h-1 w-56 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-[#635BFF] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[12px] text-white/60">
        {total > 0 ? `${formatMb(loaded)} / ${formatMb(total)} MB` : loaded > 0 ? `${formatMb(loaded)} MB` : "\u00a0"}
      </span>
    </div>
  );
}

export default function AnatomyViewer({
  layer,
  selectedIds,
  hiddenGroups,
  isolate,
  showSkeletonUnderlay,
  focusRequest,
  resetNonce,
  peelDepth,
  expansion,
  expandGroups,
  onPartClick,
}: AnatomyViewerProps) {
  const materials = useMemo(() => createMaterials(), []);
  const registry = useMemo<MeshRegistry>(() => new Map(), []);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoverSingle, setHoverSingle] = useState(false);
  const hoveredRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hoveredPart = hovered ? PART_LOOKUP[layer].get(hovered) : undefined;
  const hoveredUnit = useMemo(() => (hovered ? unitIdsOf(layer, hovered) : []), [hovered, layer]);
  const hoveredIds = useMemo(
    () => new Set(hovered && hoverSingle ? [hovered] : hoveredUnit),
    [hovered, hoverSingle, hoveredUnit],
  );
  const showGroupLabel = hoveredPart && !hoverSingle && hoveredUnit.length > 1;

  useEffect(() => {
    return () => {
      for (const tone of Object.values(materials)) {
        for (const material of Object.values(tone)) material.dispose();
      }
    };
  }, [materials]);

  function moveTooltip(event: ThreeEvent<PointerEvent>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !tooltipRef.current) return;
    const x = event.nativeEvent.clientX - rect.left + 14;
    const y = event.nativeEvent.clientY - rect.top + 14;
    tooltipRef.current.style.transform = `translate(${x}px, ${y}px)`;
    setHoverSingle(event.nativeEvent.altKey);
  }

  function setCursor(pointer: boolean) {
    const el = containerRef.current;
    // Leave the "grabbing" cursor alone while an empty-space pan is in progress.
    if (el && el.style.cursor !== "grabbing") el.style.cursor = pointer ? "pointer" : "";
  }

  function handleHover(id: string, event: ThreeEvent<PointerEvent>) {
    hoveredRef.current = id;
    setHovered(id);
    setCursor(true);
    moveTooltip(event);
  }

  // Pointer-out on the previous part can arrive after pointer-over on the next
  // one, so only clear when the part leaving is still the hovered one.
  function handleHoverEnd(id: string) {
    if (hoveredRef.current !== id) return;
    hoveredRef.current = null;
    setHovered(null);
    setCursor(false);
  }

  function handleSelect(id: string, event: ThreeEvent<MouseEvent>) {
    if (event.delta > CLICK_DRAG_TOLERANCE_PX) return;
    const native = event.nativeEvent;
    onPartClick(id, { additive: native.shiftKey || native.metaKey || native.ctrlKey, single: native.altKey });
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab overflow-hidden bg-[radial-gradient(ellipse_at_center,#2a3157_0%,#1A1F36_55%,#10132a_100%)]"
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [...HOME_POSITION], fov: FOCUS_FOV_DEG, near: 0.01, far: 50 }}
        gl={{ antialias: true, alpha: true }}
        scene={{ environmentIntensity: 0.55 }}
        onPointerLeave={() => {
          if (hoveredRef.current) handleHoverEnd(hoveredRef.current);
        }}
      >
        <StudioEnvironment />
        <ambientLight intensity={0.25} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
        <directionalLight position={[-3, 2, -2.5]} intensity={0.7} color="#b9c4ff" />
        <Suspense fallback={null}>
          <LayerModel
            key={layer}
            layer={layer}
            materials={materials}
            interactive
            selected={selected}
            hoveredIds={hoveredIds}
            hiddenGroups={hiddenGroups}
            isolate={isolate}
            peelDepth={peelDepth}
            expansion={expansion}
            expandGroups={expandGroups}
            registry={registry}
            onHover={handleHover}
            onHoverEnd={handleHoverEnd}
            onMove={moveTooltip}
            onSelect={handleSelect}
          />
          {layer === "muscles" && showSkeletonUnderlay && (
            <LayerModel layer="skeleton" materials={materials} interactive={false} />
          )}
        </Suspense>
        <CameraRig
          registry={registry}
          focusRequest={focusRequest}
          resetNonce={resetNonce}
          container={containerRef}
        />
      </Canvas>

      <div
        ref={tooltipRef}
        className={`pointer-events-none absolute left-0 top-0 z-10 rounded-[4px] bg-[#0A2540]/90 px-2 py-1 text-[13px] text-white shadow-md ${
          hoveredPart ? "opacity-100" : "opacity-0"
        }`}
      >
        {showGroupLabel ? (
          <>
            <div className="font-medium">{unitLabelOf(layer, hoveredPart.id)}</div>
            <div className="text-[12px] text-white/65">{hoveredPart.label} · Alt+click for this muscle only</div>
          </>
        ) : (
          hoveredPart?.label
        )}
      </div>

      <LoadingOverlay layer={layer} />
    </div>
  );
}

preloadLayer("skeleton");
