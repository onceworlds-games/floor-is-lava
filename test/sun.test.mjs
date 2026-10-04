import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SUN, SUN_YAW, sunOnScreen } from '../src/render/sun.js';

const here = (p) => new URL(`../src/render/${p}`, import.meta.url);
const eye = new THREE.Vector3(0, 12, 0);

test('the sun the keeper turns to is the one the sky and the sea draw', () => {
  for (const file of ['shaders.js', 'sky.js']) {
    const m = /vec3\(\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)[^\n]*\n?/.exec(readFileSync(here(file), 'utf8').split('\n').find((l) => /sunDir|SUN_DIR/.test(l) && /vec3\(\s*-?[\d.]+,/.test(l)));
    assert.ok(m, `${file} names the sun`);
    const v = new THREE.Vector3(+m[1], +m[2], +m[3]).normalize();
    assert.ok(v.distanceTo(SUN) < 1e-9, `${file} has the sun at ${v.toArray()}, the keeper turns to ${SUN.toArray()}`);
  }
});

test('turned to the sun at dawn, the keeper has it in the middle of the view, above the water', () => {
  for (const [w, h] of [[1920, 1080], [1280, 720], [844, 390]]) {
    const at = sunOnScreen(eye, SUN_YAW, 0, 62, w / h);
    assert.ok(at, 'in view');
    assert.ok(Math.abs(at.x - 0.5) < 1e-6, `centred across (${at.x})`);
    // The page that closes the night stands under it: the sun sits well above the middle, at any shape of screen.
    assert.ok(at.y > 0.3 && at.y < 0.45, `above the middle of the view at ${w}x${h} (${at.y.toFixed(3)})`);
  }
});

test('looking up puts the sun lower in the view, looking away loses it', () => {
  const level = sunOnScreen(eye, SUN_YAW, 0, 62, 16 / 9);
  const up = sunOnScreen(eye, SUN_YAW, 0.15, 62, 16 / 9);
  assert.ok(up.y > level.y + 0.1, 'lower when the keeper looks up');
  assert.equal(sunOnScreen(eye, SUN_YAW + Math.PI, 0, 62, 16 / 9), null, 'behind the keeper');
  assert.equal(sunOnScreen(eye, SUN_YAW + 1.2, 0, 62, 16 / 9), null, 'off to the side');
  for (const turn of [0.9, -0.9]) {
    const edge = sunOnScreen(eye, SUN_YAW + turn, 0, 62, 16 / 9);
    assert.ok(edge && (edge.x < 0 || edge.x > 1), 'just past the edge still counts: its glow reaches in');
  }
});
