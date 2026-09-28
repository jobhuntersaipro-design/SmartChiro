"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, useGLTF, useProgress } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Loader2 } from "lucide-react";
import { FOCUS_FOV_DEG, focusView } from "@/lib/anatomy/camera";
import { ANATOMY_PARTS, MODEL_URLS, type AnatomyLayer, type AnatomyPart } from "@/lib/anatomy/parts";

export interface FocusRequest {
  ids: string[];
  nonce: number;
}

interface AnatomyViewerProps {
  layer: AnatomyLayer;
  selectedIds: string[];
  hiddenGroups: Set<string>;
  isolate: boolean;
  showSkeletonUnderlay: boolean;
  focusRequest: FocusRequest | null;
  resetNonce: number;
  onPartClick: (id: string, additive: boolean) => void;
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

function useModelMeshes(layer: AnatomyLayer): ModelMesh[] {
  const { scene } = useGLTF(MODEL_URLS[layer], false, true);
  return useMemo(() => {
    const out: ModelMesh[] = [];
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
  onHover,
  onHoverEnd,
  onMove,
  onSelect,
}: PartMeshProps) {
  const pickable = interactive && visible;
  return (
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
  );
}

interface LayerModelProps {
  layer: AnatomyLayer;
  materials: MaterialSet;
  interactive: boolean;
  selected?: Set<string>;
  hovered?: string | null;
  hiddenGroups?: Set<string>;
  isolate?: boolean;
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
  hovered,
  hiddenGroups,
  isolate,
  registry,
  onHover,
  onHoverEnd,
  onMove,
  onSelect,
}: LayerModelProps) {
  const meshes = useModelMeshes(layer);
  const lookup = PART_LOOKUP[layer];
  const hasSelection = (selected?.size ?? 0) > 0;

  return (
    <group>
      {meshes.map(({ id, mesh }) => {
        const part = lookup.get(id);
        const tone: Tone = interactive ? toneFor(layer, part) : "underlay";
        let state: PartState = "base";
        if (selected?.has(id)) state = "selected";
        else if (hovered === id) state = "hover";
        else if (isolate && hasSelection) state = "ghost";
        const visible = !(part && hiddenGroups?.has(part.group));
        return (
          <PartMesh
            key={id}
            id={id}
            source={mesh}
            material={materials[tone][state]}
            visible={visible}
            interactive={interactive && state !== "ghost"}
            registry={registry}
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
}

function CameraRig({ registry, focusRequest, resetNonce }: CameraRigProps) {
  const controls = useRef<CameraControls>(null);

  useEffect(() => {
    const cc = controls.current;
    if (!focusRequest || !cc) return;
    const box = new THREE.Box3();
    for (const id of focusRequest.ids) {
      const mesh = registry.get(id);
      if (mesh) box.expandByObject(mesh);
    }
    if (box.isEmpty()) return;
    const [x, y, z, tx, ty, tz] = focusView(box, cc.camera.position, cc.getTarget(new THREE.Vector3()));
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

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
      <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} />
      <span className="text-[14px]">Loading 3D model… {Math.round(progress)}%</span>
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
  onPartClick,
}: AnatomyViewerProps) {
  const materials = useMemo(() => createMaterials(), []);
  const registry = useMemo<MeshRegistry>(() => new Map(), []);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hoveredPart = hovered ? PART_LOOKUP[layer].get(hovered) : undefined;

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
  }

  function setCursor(pointer: boolean) {
    if (containerRef.current) containerRef.current.style.cursor = pointer ? "pointer" : "";
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
    onPartClick(id, native.shiftKey || native.metaKey || native.ctrlKey);
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,#2a3157_0%,#1A1F36_55%,#10132a_100%)]"
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
            hovered={hovered}
            hiddenGroups={hiddenGroups}
            isolate={isolate}
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
        <CameraRig registry={registry} focusRequest={focusRequest} resetNonce={resetNonce} />
      </Canvas>

      <div
        ref={tooltipRef}
        className={`pointer-events-none absolute left-0 top-0 z-10 rounded-[4px] bg-[#0A2540]/90 px-2 py-1 text-[13px] text-white shadow-md transition-opacity ${
          hoveredPart ? "opacity-100" : "opacity-0"
        }`}
      >
        {hoveredPart?.label}
      </div>

      <LoadingOverlay />
    </div>
  );
}

useGLTF.preload(MODEL_URLS.skeleton, false, true);
