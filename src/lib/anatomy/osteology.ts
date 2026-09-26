import * as THREE from "three";


/**
 * Region map
 * ----------
 * The bundled AnatomyTOOL GLB stores midline bones plus the anatomical
 * right side only. Right-side node names end in ".r" (a few end in ".r.").
 * On load those meshes are mirrored across X to build the left side.
 * Every mesh is parented to one region group. Rest pose is the group's
 * identity position (geometry stays in model space). Exploded pose is
 * rest + an outward offset, lerped by the playback amount.
 *
 *   skull    cranium, face, mandible, teeth. Extra lift on Y.
 *   spine    C1–L5 and the sternum. Distance stays 0 so the column
 *            remains centered while the ribs fan away from it.
 *   ribsL    left ribs and costal cartilages.
 *   ribsR    right ribs and costal cartilages.
 *   pelvis   both hip bones, sacrum, and coccyx, as one unit.
 *   armL/R   clavicle, scapula, humerus, radius, ulna.
 *   handL/R  carpals, metacarpals, finger phalanges.
 *   legL/R   femur, patella, tibia, fibula.
 *   footL/R  tarsals, metatarsals, toe phalanges.
 *
 * Offsets are the direction from the spine center to each group's
 * centroid, with vertical motion damped, then scaled by REGION_DISTANCE
 * (metres). Retune those values and SKULL_LIFT / RIB_FORWARD after
 * swapping public/models/skeleton.glb. Keep spine at 0.
 *
 * If a replacement GLB already contains both sides, remove the ".r"
 * suffix or the right side will be mirrored into a duplicate left side.
 */
export const REGION_DISTANCE = {
  skull: 0.02,
  spine: 0,
  ribsL: 0.1,
  ribsR: 0.1,
  pelvis: 0.07,
  armL: 0.13,
  armR: 0.13,
  handL: 0.22,
  handR: 0.22,
  legL: 0.08,
  legR: 0.08,
  footL: 0.14,
  footR: 0.14,
}

export const SKULL_LIFT = 0.16
export const RIB_FORWARD = 0.028
const VERTICAL_DAMP = 0.32

type RegionId = keyof typeof REGION_DISTANCE;
type RegionGroups = Record<RegionId, THREE.Group>;
type RegionCounts = Partial<Record<RegionId, number>>;

const REGION_IDS = Object.keys(REGION_DISTANCE) as RegionId[];

const HAND_KEYS = [
  'metacarpal',
  'scaphoid',
  'lunate',
  'triquetrum',
  'pisiform',
  'trapezium',
  'trapezoid',
  'capitate',
  'hamate',
  'sesamoid_bones_of_hand',
  'sesamoid bones of hand',
]
const FOOT_KEYS = [
  'calcaneus',
  'talus',
  'cuboid',
  'cuneiform',
  'navicular',
  'metatarsal',
  'sesamoid bones of foot',
]
const ARM_KEYS = ['clavicle', 'scapula', 'humerus', 'radius', 'ulna']
const LEG_KEYS = ['femur', 'tibia', 'fibula', 'patella']
const RIB_KEYS = ['rib', 'costal']
const PELVIS_KEYS = ['hip', 'sacrum', 'coccyx']
const SKULL_KEYS = [
  'frontal',
  'parietal',
  'occipital',
  'sphenoid',
  'ethmoid',
  'vomer',
  'mandible',
  'maxilla',
  'zygomatic',
  'temporal',
  'nasal',
  'lacrimal',
  'palatine',
  'concha',
  'tooth',
  'molar',
  'premolar',
  'canine',
  'incisor',
]
const SPINE_KEYS = ['atlas', 'axis', 'cervical', 'thoracic', 'lumbar', 'vertebra', 'sternum', 'manubrium']

const OPPOSITE: Partial<Record<RegionId, RegionId>> = {
  ribsR: 'ribsL',
  ribsL: 'ribsR',
  armR: 'armL',
  armL: 'armR',
  handR: 'handL',
  handL: 'handR',
  legR: 'legL',
  legL: 'legR',
  footR: 'footL',
  footL: 'footR',
}

const T_ORBIT_END = 1.2
const T_EXPLODE_END = 3.8
const T_HOLD_END = 4.8
const T_RETURN_END = 7.8
export const DURATION = T_RETURN_END
export const ORBIT_WINDOW = T_ORBIT_END
export const ORBIT_SWEEP = 0.42

function includesAny(name: string, keys: readonly string[]): boolean {
  return keys.some((key) => name.includes(key))
}

export function boneName(mesh: THREE.Mesh): string {
  return mesh.userData?.name || mesh.name || ''
}

export function isRightSideName(name: string): boolean {
  return /\.r\b/i.test(name) || /\.r\.$/i.test(name)
}

export function regionForName(name: string): RegionId | null {
  const n = name.toLowerCase()
  const footPhalanx = n.includes('phalanx') && n.includes('foot')
  const finger = n.includes('phalanx') && !n.includes('foot')
  let base = null
  if (finger || includesAny(n, HAND_KEYS)) base = 'hand'
  else if (footPhalanx || includesAny(n, FOOT_KEYS)) base = 'foot'
  else if (includesAny(n, ARM_KEYS)) base = 'arm'
  else if (includesAny(n, LEG_KEYS)) base = 'leg'
  else if (includesAny(n, RIB_KEYS)) base = 'ribs'
  else if (includesAny(n, PELVIS_KEYS)) base = 'pelvis'
  else if (includesAny(n, SKULL_KEYS)) base = 'skull'
  else if (includesAny(n, SPINE_KEYS)) base = 'spine'

  if (!base) return null
  if (base === 'pelvis' || base === 'skull' || base === 'spine') return base
  const side = isRightSideName(name) ? "R" : "L"
  return `${base}${side}` as RegionId
}

function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function sampleAmount(time: number): number {
  if (time <= T_ORBIT_END) return 0
  if (time <= T_EXPLODE_END) {
    return easeInOut((time - T_ORBIT_END) / (T_EXPLODE_END - T_ORBIT_END))
  }
  if (time <= T_HOLD_END) return 1
  if (time <= T_RETURN_END) {
    return 1 - easeInOut((time - T_HOLD_END) / (T_RETURN_END - T_HOLD_END))
  }
  return 0
}

export function createTimeline() {
  let time = 0
  let playing = false
  let override: number | null = null

  return {
    get playing() {
      return playing
    },
    get time() {
      return time
    },
    get duration() {
      return DURATION
    },
    get amount() {
      return override ?? sampleAmount(time)
    },
    get orbiting() {
      return playing && override == null && time < T_ORBIT_END
    },
    play() {
      if (override != null || time >= DURATION - 0.02) {
        time = 0
        override = null
      }
      playing = true
    },
    pause() {
      playing = false
    },
    restart() {
      time = 0
      override = null
      playing = true
    },
    setAmount(value: number) {
      playing = false
      override = Math.min(1, Math.max(0, value))
    },
    tick(dt: number) {
      if (playing && override == null) {
        time += dt
        if (time >= DURATION) {
          time = DURATION
          playing = false
        }
      }
      return {
        amount: this.amount,
        playing,
        orbiting: this.orbiting,
        time,
      }
    },
  }
}

function emptyGroups(): RegionGroups {
  const groups = {} as RegionGroups
  for (const id of REGION_IDS) {
    const group = new THREE.Group()
    group.name = id
    group.userData.restPosition = new THREE.Vector3()
    groups[id] = group
  }
  return groups
}

function placeMesh(mesh: THREE.Mesh, regionId: RegionId, groups: RegionGroups, counts: RegionCounts): void {
  const group = groups[regionId]
  if (!group) return
  mesh.removeFromParent()
  group.add(mesh)
  counts[regionId] = (counts[regionId] || 0) + 1
}

export function buildRegions(gltfScene: THREE.Object3D): { groups: RegionGroups; counts: RegionCounts } {
  const groups = emptyGroups()
  const counts: RegionCounts = {}
  const meshes: THREE.Mesh[] = []
  gltfScene.updateMatrixWorld(true)
  gltfScene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj)
  })

  for (const mesh of meshes) {
    const name = boneName(mesh)
    const region = regionForName(name)
    const resolved = region ?? 'spine'
    if (!region) console.warn('[osteology] unclassified bone, kept on spine:', name)
    placeMesh(mesh, resolved, groups, counts)

    if (!isRightSideName(name)) continue
    const left = mesh.clone()
    const leftName = name.replace(/\.r\.?$/i, ".l")
    left.name = leftName
    left.userData.name = leftName
    left.userData.mirrored = true
    left.scale.x = -1
    left.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone()
    const leftRegion = OPPOSITE[resolved] ?? resolved
    placeMesh(left, leftRegion, groups, counts)
  }

  return { groups, counts }
}

export function computeOffsets(groups: RegionGroups): Record<RegionId, THREE.Vector3> {
  const spine = groups.spine
  spine.updateWorldMatrix(true, true)
  const spineBox = new THREE.Box3().setFromObject(spine)
  const torso = spineBox.isEmpty()
    ? new THREE.Vector3(0, 1.1, 0)
    : spineBox.getCenter(new THREE.Vector3())

  const offsets = {} as Record<RegionId, THREE.Vector3>
  for (const id of REGION_IDS) {
    const group = groups[id]
    const offset = new THREE.Vector3()
    if (group.children.length === 0) {
      offsets[id] = offset
      continue
    }
    if (id !== 'spine' && REGION_DISTANCE[id] > 0) {
      const box = new THREE.Box3().setFromObject(group)
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3())
        const away = center.sub(torso)
        away.y *= VERTICAL_DAMP
        if (away.lengthSq() > 1e-8) {
          away.normalize().multiplyScalar(REGION_DISTANCE[id])
          offset.copy(away)
        }
      }
    }
    if (id === 'skull') offset.y += SKULL_LIFT
    if (id === 'ribsL' || id === 'ribsR') offset.z += RIB_FORWARD
    if (id === 'spine') offset.set(0, 0, 0)
    offsets[id] = offset
  }
  return offsets
}

export function applyExplode(groups: RegionGroups, offsets: Record<RegionId, THREE.Vector3>, amount: number): void {
  const t = Math.min(1, Math.max(0, amount))
  for (const id of REGION_IDS) {
    const group = groups[id]
    const rest = group.userData.restPosition
    group.position.copy(rest).addScaledVector(offsets[id], t)
  }
}

export function poseLabel(amount: number): string {
  if (amount < 0.08) return 'Skeleton'
  if (amount > 0.92) return 'Exploded'
  return 'Separating'
}
