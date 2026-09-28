import * as THREE from "three";

export const FOCUS_FOV_DEG = 30;

/**
 * Camera placement that frames `box` from the outside of the body: the view
 * direction runs from the body's vertical axis out through the part, so a
 * posterior muscle is viewed from behind and a lateral one from the side.
 */
export function focusView(
  box: THREE.Box3,
  cameraPosition: THREE.Vector3,
  currentTarget: THREE.Vector3,
): [number, number, number, number, number, number] {
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  const outward = new THREE.Vector3(center.x, 0, center.z);
  if (outward.length() < 0.03) {
    outward.set(cameraPosition.x - currentTarget.x, 0, cameraPosition.z - currentTarget.z);
  }
  if (outward.lengthSq() === 0) outward.set(0, 0, 1);
  outward.normalize();
  outward.y = 0.25;
  outward.normalize();
  const distance = Math.max(0.25, (radius / Math.sin(THREE.MathUtils.degToRad(FOCUS_FOV_DEG / 2))) * 1.15);
  const eye = center.clone().addScaledVector(outward, distance);
  return [eye.x, eye.y, eye.z, center.x, center.y, center.z];
}
