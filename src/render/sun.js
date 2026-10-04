// The dawn sun: low in the east-south-east, the direction the sky and sea shaders put it in (render/sky.js,
// render/shaders.js). The keeper turns to it at dawn (view.js), and the page that closes the night keeps clear of it.
import * as THREE from 'three';

export const SUN = new THREE.Vector3(0.951, 0.118, -0.285).normalize();
/** The keeper's yaw when facing the sun (forward is (sin yaw, cos yaw)). */
export const SUN_YAW = Math.atan2(SUN.x, SUN.z);

const cam = new THREE.PerspectiveCamera();
const v = new THREE.Vector3();

/**
 * Where the sun appears from a spot looking along (yaw, pitch), with a vertical field of view of `fov` degrees at `aspect`:
 * { x, y } as fractions of the picture from its top left, or null when it is out of view (a little past the edge still counts,
 * its glow reaches in).
 */
export function sunOnScreen(pos, yaw, pitch, fov, aspect) {
  cam.fov = fov;
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  cam.position.copy(pos);
  const c = Math.cos(pitch);
  cam.lookAt(pos.x + Math.sin(yaw) * c, pos.y + Math.sin(pitch), pos.z + Math.cos(yaw) * c);
  cam.updateMatrixWorld();
  v.copy(SUN).multiplyScalar(1000).add(pos).project(cam);
  if (v.z >= 1 || Math.abs(v.x) > 1.25 || Math.abs(v.y) > 1.25) return null;
  return { x: v.x * 0.5 + 0.5, y: 0.5 - v.y * 0.5 };
}
