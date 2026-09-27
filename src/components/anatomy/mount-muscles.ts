import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { PartCallout, PickHit } from "@/lib/anatomy/callout";
import { englishPartName } from "@/lib/anatomy/muscle-name";
import { bindStagePointer, calloutFrom } from "./stage-pointer";

const BLUE = new THREE.Color("#2f6fed");
const STAGE = 0xf7f7f8;
const MUSCLE = new THREE.Color("#c15c58");
const IVORY = new THREE.Color("#efe6d6");

export type AtlasView = "front" | "back" | "left" | "right";

const VIEW_DIR: Record<AtlasView, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.04, 1),
  back: new THREE.Vector3(0, 0.04, -1),
  left: new THREE.Vector3(1, 0.04, 0),
  right: new THREE.Vector3(-1, 0.04, 0),
};

export interface MuscleStage {
  frameView: (view: AtlasView) => void;
  dispose: () => void;
}

interface Entry {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  base: THREE.Color;
  kind: "muscle" | "bone";
  name: string;
}

function hashName(value: string): number {
  let n = 0;
  for (const ch of value) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  return n;
}

function muscleMaterial(name: string): THREE.MeshStandardMaterial {
  const color = MUSCLE.clone();
  const n = hashName(name);
  color.offsetHSL(((n % 9) - 4) * 0.008, 0.02, ((n % 7) - 3) * 0.02);
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.02,
  });
}

function boneMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: IVORY,
    roughness: 0.46,
    metalness: 0.02,
  });
}

function shadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, "rgba(40, 44, 52, 0.28)");
    grad.addColorStop(1, "rgba(40, 44, 52, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function framingDistance(size: THREE.Vector3, aspect: number, fovDeg: number) {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distV = (size.y * 0.5) / Math.tan(vFov / 2);
  const distH = (Math.max(size.x, size.z) * 0.55) / Math.tan(hFov / 2);
  return Math.max(distV, distH) * 1.12;
}

function bakeMesh(source: THREE.Mesh, kind: "muscle" | "bone"): THREE.Mesh {
  const name = source.name || source.parent?.name || kind;
  const geom = source.geometry.clone();
  source.updateWorldMatrix(true, false);
  geom.applyMatrix4(source.matrixWorld);
  geom.computeVertexNormals();
  const mat = kind === "bone" ? boneMaterial() : muscleMaterial(name);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function partStem(name: string): string {
  return name.replace(/_\d+$/, "").replace(/\.r$|\.l$|_r$|_l$/i, "");
}

function partSide(name: string): "r" | "l" | "" {
  const base = name.replace(/_\d+$/, "");
  if (/\.r$|_r$/i.test(base)) return "r";
  if (/\.l$|_l$/i.test(base)) return "l";
  return "";
}

function mirrorMesh(source: THREE.Mesh, to: "l" | "r"): THREE.Mesh {
  const geom = source.geometry.clone();
  geom.scale(-1, 1, 1);
  geom.computeVertexNormals();
  const mat = (source.material as THREE.MeshStandardMaterial).clone();
  const mesh = new THREE.Mesh(geom, mat);
  const token = to === "l" ? "_l" : "_r";
  mesh.name = source.name.replace(/(?:\.r|_r|\.l|_l)(?=(_\d+)?$)/i, token);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function mountMuscles(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  onCallout: (callout: PartCallout | null) => void,
  onReady: () => void,
  onError: (message: string) => void,
): MuscleStage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(STAGE, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 80);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 0.7;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe7e2dc, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(0.6, 1.6, 1.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff4ee, 0.45);
  fill.position.set(-1.2, 0.6, 0.4);
  scene.add(fill);

  const figure = new THREE.Group();
  scene.add(figure);
  const entries: Entry[] = [];
  const selected = new Set<string>();
  let hovered: string | null = null;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3(1, 1, 1);
  let placed = false;
  let disposed = false;
  let queued: AtlasView = "front";

  function paint() {
    for (const entry of entries) {
      const on = entry.kind === "muscle" && selected.has(entry.name);
      const hot = entry.name === hovered && !on;
      entry.mat.color.copy(on ? BLUE : entry.base);
      entry.mat.emissive.set(on ? "#2f6fed" : hot ? "#6a3030" : "#000000");
      entry.mat.emissiveIntensity = on ? 0.85 : hot ? 0.16 : 0;
    }
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  let tween: { from: THREE.Vector3; to: THREE.Vector3; start: number } | null = null;

  function placeCamera(view: AtlasView, animate: boolean) {
    if (!placed) return;
    const dir = VIEW_DIR[view].clone().normalize();
    const dist = framingDistance(size, camera.aspect || 1, camera.fov);
    const to = center.clone().add(dir.multiplyScalar(dist));
    controls.target.copy(center);
    if (!animate || reducedMotion()) {
      tween = null;
      camera.position.copy(to);
      controls.update();
      return;
    }
    tween = { from: camera.position.clone(), to, start: performance.now() };
  }

  function fit() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 2 || height < 2) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, width < 800 ? 1.25 : 1.75);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return true;
  }

  const draco = new DRACOLoader();
  draco.setDecoderPath("/anatomy/draco/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  function adopt(root: THREE.Object3D, kind: "muscle" | "bone") {
    root.updateMatrixWorld(true);
    const baked: THREE.Mesh[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.name) return;
      baked.push(bakeMesh(mesh, kind));
    });
    const stems = {
      l: new Set(baked.filter((mesh) => partSide(mesh.name) === "l").map((mesh) => partStem(mesh.name))),
      r: new Set(baked.filter((mesh) => partSide(mesh.name) === "r").map((mesh) => partStem(mesh.name))),
    };
    for (const mesh of baked) {
      figure.add(mesh);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      entries.push({ mesh, mat, base: mat.color.clone(), kind, name: mesh.name });
      const side = partSide(mesh.name);
      const missing = side === "r" ? "l" : side === "l" ? "r" : "";
      if (missing && !stems[missing].has(partStem(mesh.name))) {
        const twin = mirrorMesh(mesh, missing);
        figure.add(twin);
        const twinMat = twin.material as THREE.MeshStandardMaterial;
        entries.push({
          mesh: twin,
          mat: twinMat,
          base: twinMat.color.clone(),
          kind,
          name: twin.name,
        });
      }
    }
  }

  Promise.all([
    loader.loadAsync("/anatomy/ecorche-muscles.glb"),
    loader.loadAsync("/anatomy/ecorche-bones.glb"),
  ])
    .then(([muscles, bones]) => {
      if (disposed) return;
      adopt(muscles.scene, "muscle");
      adopt(bones.scene, "bone");
      const box = new THREE.Box3().setFromObject(figure);
      box.getCenter(center);
      box.getSize(size);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(Math.max(size.x, size.z) * 0.42, 48),
        new THREE.MeshBasicMaterial({
          map: shadowTexture(),
          transparent: true,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = box.min.y + 0.001;
      scene.add(shadow);
      controls.minDistance = size.y * 0.35;
      controls.maxDistance = size.y * 3.2;
      controls.minPolarAngle = 0.15;
      controls.maxPolarAngle = Math.PI * 0.92;
      placed = true;
      fit();
      placeCamera(queued, false);
      host.dataset.ready = "muscles";
      onReady();
    })
    .catch(() => {
      if (!disposed) onError("The muscle atlas did not load.");
    });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(event: PointerEvent): PickHit | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(figure.children, false);
    const hit = hits[0];
    if (!hit) return null;
    const entry = entries.find((item) => item.mesh === hit.object);
    if (!entry) return null;
    const label = englishPartName(entry.name);
    if (!label) return null;
    return { id: entry.name, name: label };
  }

  const unbind = bindStagePointer(canvas, pick, {
    onHover(hit, point) {
      hovered = hit?.id ?? null;
      paint();
      onCallout(calloutFrom(hit, point));
    },
    onTap(hit, point) {
      if (hit) {
        const entry = entries.find((item) => item.name === hit.id);
        if (entry?.kind === "muscle") {
          if (selected.has(hit.id)) selected.delete(hit.id);
          else selected.add(hit.id);
        }
        hovered = hit.id;
      }
      paint();
      onCallout(calloutFrom(hit, point));
    },
  });

  const observer = new ResizeObserver(() => {
    fit();
  });
  observer.observe(host);

  let frameId = 0;
  function frame() {
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.start) / 480);
      const eased = 1 - (1 - t) * (1 - t);
      camera.position.lerpVectors(tween.from, tween.to, eased);
      controls.target.copy(center);
      if (t >= 1) tween = null;
    }
    if (host.clientWidth > 2 && host.clientHeight > 2 && placed) {
      controls.update();
      renderer.render(scene, camera);
      host.dataset.azimuth = camera.position.x.toFixed(3);
    }
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  return {
    frameView(view) {
      queued = view;
      placeCamera(view, true);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      unbind();
      controls.dispose();
      draco.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const textured = mat as THREE.MeshStandardMaterial;
          textured.map?.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
