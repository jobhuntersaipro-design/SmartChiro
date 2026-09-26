import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PartCallout, PickHit } from "@/lib/anatomy/callout";
import { contextBody, fiberTexture, hashId, sheetGeometry } from "@/lib/anatomy/muscle-geometry";
import { muscleParts, type MusclePart } from "@/lib/anatomy/muscle-parts";
import { bindStagePointer, calloutFrom } from "./stage-pointer";

const RED = new THREE.Color("#af7b81");
const BLUE = new THREE.Color("#2f6fed");
const STAGE = 0xfcfcfe;

interface MuscleEntry {
  part: MusclePart;
  mat: THREE.MeshStandardMaterial;
  base: THREE.Color;
}

export interface MuscleStage {
  frameFront: () => void;
  dispose: () => void;
}

export function mountMuscles(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  onCallout: (callout: PartCallout | null) => void,
): MuscleStage {
  const parts = muscleParts();
  const byId = new Map(parts.map((part) => [part.id, part]));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(STAGE, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.9, 0);
  controls.minDistance = 1.45;
  controls.maxDistance = 4.2;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.enablePan = false;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 0.65;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xf3e4de, 0.95 * Math.PI));
  const key = new THREE.DirectionalLight(0xffffff, 1.35 * Math.PI);
  key.position.set(0.7, 1.8, 1.4);
  key.castShadow = true;
  const map = window.innerWidth < 800 ? 1024 : 2048;
  key.shadow.mapSize.set(map, map);
  key.shadow.bias = -0.0008;
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 6;
  key.shadow.camera.left = -1.4;
  key.shadow.camera.right = 1.4;
  key.shadow.camera.top = 1.6;
  key.shadow.camera.bottom = -0.4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff4ee, 0.55 * Math.PI);
  fill.position.set(-1.1, 0.8, -0.6);
  scene.add(fill);

  const fiber = fiberTexture();
  const entries = new Map<string, MuscleEntry>();
  for (const part of parts) {
    const geo = sheetGeometry(part);
    const mat = new THREE.MeshStandardMaterial({
      color: RED,
      map: fiber,
      roughness: 0.78,
      metalness: 0,
    });
    const shade = (hashId(part.id) % 7) - 3;
    mat.color = RED.clone().offsetHSL(0, 0, shade * 0.012);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.userData.partId = part.id;
    scene.add(mesh);
    entries.set(part.id, { part, mat, base: mat.color.clone() });
  }
  scene.add(contextBody(fiber));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.ShadowMaterial({ opacity: 0.18 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  floor.receiveShadow = true;
  scene.add(floor);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let selected: string | null = null;
  let hovered: string | null = null;

  function paint() {
    for (const [id, entry] of entries) {
      const on = id === selected;
      const hot = id === hovered && !on;
      entry.mat.color.copy(on ? BLUE : entry.base);
      entry.mat.emissive.set(on ? "#123a86" : hot ? "#6a3030" : "#000000");
      entry.mat.emissiveIntensity = on ? 0.22 : hot ? 0.18 : 0;
    }
  }

  function pick(event: PointerEvent): PickHit | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      const id = hit.object.userData.partId;
      if (typeof id !== "string") continue;
      const part = byId.get(id);
      if (!part) continue;
      return { id, name: part.english };
    }
    return null;
  }

  const unbind = bindStagePointer(canvas, pick, {
    onHover(hit, point) {
      hovered = hit?.id ?? null;
      paint();
      onCallout(calloutFrom(hit, point));
    },
    onTap(hit, point) {
      selected = hit?.id ?? null;
      hovered = hit?.id ?? null;
      paint();
      onCallout(calloutFrom(hit, point));
    },
  });

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

  let placed = false;
  function frameFront() {
    if (!fit()) return;
    camera.position.set(0, 0.95, 3.2);
    controls.target.set(0, 0.9, 0);
    controls.update();
    placed = true;
  }

  const observer = new ResizeObserver(() => {
    if (!placed) frameFront();
    else fit();
  });
  observer.observe(host);
  frameFront();

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
  host.dataset.ready = "muscles";

  return {
    frameFront,
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
      fiber.dispose();
      renderer.dispose();
    },
  };
}
