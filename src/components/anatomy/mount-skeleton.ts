import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { PartCallout, PickHit } from "@/lib/anatomy/callout";
import { englishBoneName } from "@/lib/anatomy/bone-name";
import { applyExplode, boneName, buildRegions, computeOffsets } from "@/lib/anatomy/osteology";
import { bindStagePointer, calloutFrom } from "./stage-pointer";

const IVORY = 0xe6d9c4;
const TOOTH = 0xf4efe4;
const CREAM = 0xf3e6c8;

export interface SkeletonStage {
  frameFront: () => void;
  setAmount: (amount: number) => void;
  dispose: () => void;
}

function upgradeMaterial(source: THREE.Material, meshName: string): THREE.MeshPhysicalMaterial {
  const named = source as THREE.MeshStandardMaterial;
  const label = `${meshName} ${source.name || ""}`.toLowerCase();
  const cartilage = label.includes("cart");
  const tooth = /tooth|molar|premolar|canine|incisor/.test(label);
  const normalScale = named.normalScale?.isVector2
    ? named.normalScale.clone()
    : new THREE.Vector2(1, 1);
  return new THREE.MeshPhysicalMaterial({
    color: cartilage ? CREAM : tooth ? TOOTH : IVORY,
    roughness: cartilage ? 0.4 : 0.55,
    metalness: 0.02,
    normalMap: named.normalMap ?? null,
    normalScale,
    side: THREE.DoubleSide,
    sheen: cartilage ? 0.32 : 0.16,
    sheenRoughness: 0.62,
    sheenColor: new THREE.Color(cartilage ? 0xfff6e4 : 0xf0e4d0),
    clearcoat: cartilage ? 0.08 : 0.03,
    clearcoatRoughness: 0.7,
    envMapIntensity: 0.42,
  });
}

function styleMeshes(root: THREE.Object3D) {
  const seen = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = sources.map((material) => {
      const styled = upgradeMaterial(material, mesh.name);
      if (!seen.has(material)) {
        seen.add(material);
        material.dispose();
      }
      return styled;
    });
    mesh.material = next.length === 1 ? next[0] : next;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
}

function framingDistance(size: THREE.Vector3, aspect: number, fovDeg: number) {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distV = (size.y * 0.5) / Math.tan(vFov / 2);
  const distH = (Math.max(size.x, size.z) * 0.5) / Math.tan(hFov / 2);
  return Math.max(distV, distH) * 1.18;
}

function paintMesh(object: THREE.Object3D | null, on: boolean) {
  const mesh = object as THREE.Mesh | null;
  if (!mesh?.isMesh) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!("emissive" in mat)) continue;
    const physical = mat as THREE.MeshPhysicalMaterial;
    physical.emissive.set(on ? 0xc4a574 : 0x000000);
    physical.emissiveIntensity = on ? 0.55 : 0;
  }
}

export async function mountSkeleton(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  onCallout: (callout: PartCallout | null) => void,
  onProgress: (value: number) => void,
): Promise<SkeletonStage> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.setClearColor(0x0c0e12, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0e12);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xc9d2dc, 0x16181d, 0.42);
  const key = new THREE.DirectionalLight(0xfff1dd, 3.5);
  const fill = new THREE.DirectionalLight(0xd5e2f2, 0.85);
  const rim = new THREE.DirectionalLight(0xf7f4ee, 2.7);
  scene.add(hemi, key, fill, rim, key.target, fill.target, rim.target);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 80);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.zoomSpeed = 0.65;
  controls.rotateSpeed = 0.75;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI - 0.12;

  const draco = new DRACOLoader();
  draco.setDecoderPath("/anatomy/draco/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync("/anatomy/skeleton.glb", (event) => {
    if (event.total) onProgress(event.loaded / event.total);
    else onProgress(0.35);
  });
  draco.dispose();

  styleMeshes(gltf.scene);
  const { groups } = buildRegions(gltf.scene);
  const root = new THREE.Group();
  for (const group of Object.values(groups)) root.add(group);
  scene.add(root);
  root.updateMatrixWorld(true);
  const offsets = computeOffsets(groups);

  const labels = new Map<string, string>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const label = englishBoneName(boneName(mesh));
    if (!label) return;
    mesh.userData.boneLabel = label;
    labels.set(mesh.uuid, label);
  });

  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  controls.target.copy(sphere.center);
  controls.minDistance = sphere.radius * 1.06;
  controls.maxDistance = sphere.radius * 6.2;

  function placeLights() {
    const target = controls.target;
    key.position.set(target.x + 1.55, target.y + 1.85, target.z + 2.15);
    fill.position.set(target.x - 1.85, target.y + 0.55, target.z + 1.45);
    rim.position.set(target.x - 1.75, target.y + 1.55, target.z - 2.15);
    key.target.position.copy(target);
    fill.target.position.copy(target);
    rim.target.position.copy(target);
  }

  let userAimed = false;
  controls.addEventListener("start", () => {
    userAimed = true;
  });

  function fit() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 2 || height < 2) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, width < 800 ? 1.25 : 1.5);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.near = 0.02;
    camera.far = Math.max(80, sphere.radius * 24);
    camera.updateProjectionMatrix();
    return true;
  }

  function frameFront() {
    if (!fit()) return;
    userAimed = false;
    const dist = framingDistance(size, camera.aspect, camera.fov);
    const clamped = Math.min(controls.maxDistance, Math.max(controls.minDistance, dist));
    controls.target.copy(sphere.center);
    camera.position.set(sphere.center.x, sphere.center.y + size.y * 0.02, sphere.center.z + clamped);
    placeLights();
    controls.update();
  }

  function resize() {
    if (!fit()) return;
    if (!userAimed) frameFront();
    else placeLights();
  }

  let hot: THREE.Object3D | null = null;
  function mark(object: THREE.Object3D | null) {
    if (hot === object) return;
    paintMesh(hot, false);
    hot = object;
    paintMesh(hot, true);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(event: PointerEvent): PickHit | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(root, true);
    for (const hit of hits) {
      const name = labels.get(hit.object.uuid);
      if (name) return { id: hit.object.uuid, name };
    }
    return null;
  }

  const unbind = bindStagePointer(canvas, pick, {
    onHover(hit, point) {
      mark(hit ? scene.getObjectByProperty("uuid", hit.id) ?? null : null);
      onCallout(calloutFrom(hit, point));
    },
    onTap(hit, point) {
      mark(hit ? scene.getObjectByProperty("uuid", hit.id) ?? null : null);
      onCallout(calloutFrom(hit, point));
    },
  });

  const observer = new ResizeObserver(() => resize());
  observer.observe(host);
  applyExplode(groups, offsets, 0);
  frameFront();
  renderer.compile(scene, camera);

  let frameId = 0;
  function frame() {
    if (host.clientWidth > 2 && host.clientHeight > 2) {
      controls.update();
      renderer.render(scene, camera);
      host.dataset.azimuth = camera.position.x.toFixed(3);
    }
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
  host.dataset.ready = "skeleton";

  return {
    frameFront,
    setAmount(amount: number) {
      applyExplode(groups, offsets, amount);
    },
    dispose() {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      unbind();
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) mat.dispose();
      });
      env.dispose();
      renderer.dispose();
    },
  };
}
