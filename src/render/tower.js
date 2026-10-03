// The lighthouse: exterior, the lamp room with its turning lens, the gallery, the watch room with the
// chart table, the cellar, and the stairwell between them. Everything is painted into vertex colours
// and lit by the shared world material.
import * as THREE from 'three';
import { worldMaterial, paint, LIGHT } from './shaders.js';
import { glowTexture } from './beam.js';

export const C = { cream: 0xe8dcc4, teal: 0x1f7f78, deep: 0x0e2234, brass: 0xb8832e, brassDark: 0x7a4f16, iron: 0x2a2f36, wood: 0x3a2614, stone: 0x3b3f44, stoneDark: 0x24282d, glass: 0x9fd9d2, amber: 0xf0a63a };

function box(w, h, d, hex, hexB) {
  return paint(new THREE.BoxGeometry(w, h, d), hex, hexB);
}
function cyl(rt, rb, h, seg, hex, hexB, open = false, thetaStart = 0, thetaLength = Math.PI * 2) {
  return paint(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, thetaStart, thetaLength), hex, hexB);
}

export class Tower {
  constructor(scene, site) {
    this.scene = scene;
    this.site = site;
    this.H = site.towerHeight;
    this.group = new THREE.Group();
    this.matFlat = worldMaterial({ flat: true });
    this.matSmooth = worldMaterial({ flat: false });
    this.matInside = worldMaterial({ flat: true, side: THREE.BackSide });
    this.matGlow = worldMaterial({ flat: false, emissive: 0.9 });
    this.lensRings = [];
    this.lensGroup = new THREE.Group();
    this.doorShake = 0;
    this.build();
    scene.add(this.group);
  }

  mesh(geo, mat = this.matFlat) {
    const m = new THREE.Mesh(geo, mat);
    this.group.add(m);
    return m;
  }

  build() {
    const H = this.H;
    const gr = this.site.galleryRadius;
    // The rock it stands on, and the sea-washed base.
    this.mesh(cyl(7, 11, 3, 10, C.stoneDark, C.stone)).position.y = 0.4;
    this.mesh(cyl(5.6, 6.4, 4, 14, C.stone, C.stoneDark)).position.y = 3;
    // The tower: cream with a teal band, slightly tapered.
    this.mesh(cyl(4.0, 5.4, H - 6, 16, C.cream, C.cream)).position.y = 5 + (H - 6) / 2;
    const band = this.mesh(cyl(4.45, 4.75, 5, 16, C.teal, C.teal));
    band.position.y = H * 0.55;
    // The gallery: a ring floor, posts and a rail.
    const floor = this.mesh(paint(new THREE.RingGeometry(3.3, gr + 0.4, 24), C.iron, C.iron), this.matSmooth);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = H - 1.4;
    const under = this.mesh(cyl(gr + 0.4, 3.6, 0.5, 24, C.deep, C.deep));
    under.position.y = H - 1.7;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = this.mesh(box(0.08, 1.1, 0.08, C.brassDark, C.brass));
      p.position.set(Math.cos(a) * (gr + 0.2), H - 0.85, Math.sin(a) * (gr + 0.2));
    }
    const rail = this.mesh(paint(new THREE.TorusGeometry(gr + 0.2, 0.05, 6, 32), C.brass, C.brass), this.matSmooth);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = H - 0.2;
    // The lamp room: glass drum with brass mullions, a dark roof and a finial.
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 3.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: C.glass, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.y = H + 0.6;
    this.group.add(glass);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const m = this.mesh(box(0.06, 3.6, 0.06, C.brassDark, C.brass));
      m.position.set(Math.cos(a) * 3.25, H + 0.6, Math.sin(a) * 3.25);
    }
    const lampFloor = this.mesh(cyl(3.3, 3.5, 0.3, 24, C.iron, C.iron));
    lampFloor.position.y = H - 1.25;
    const roof = this.mesh(cyl(0.3, 3.9, 2.4, 12, C.deep, C.deep));
    roof.position.y = H + 3.6;
    const finial = this.mesh(paint(new THREE.SphereGeometry(0.35, 8, 6), C.brass), this.matSmooth);
    finial.position.y = H + 5;
    const innerRail = this.mesh(paint(new THREE.TorusGeometry(2.4, 0.04, 6, 32), C.brass, C.brass), this.matSmooth);
    innerRail.rotation.x = Math.PI / 2;
    innerRail.position.y = H - 0.2;
    // The lens: a brass pedestal, a glowing lamp, and five glass rings that turn.
    this.ped = this.mesh(cyl(0.4, 0.55, 1.0, 10, C.brassDark, C.brass));
    this.ped.position.y = H - 0.6;
    this.lamp = new THREE.Mesh(paint(new THREE.SphereGeometry(0.22, 10, 8), C.amber), this.matGlow);
    this.lamp.position.y = H + 0.35;
    this.group.add(this.lamp);
    this.lampSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lampSprite.scale.set(2.2, 2.2, 1);
    this.lampSprite.position.y = H + 0.35;
    this.group.add(this.lampSprite);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xdff4ee, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 5; i++) {
      const r = 0.42 + i * 0.07;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025 + i * 0.005, 5, 36), ringMat);
      ring.rotation.x = Math.PI / 2 + (i - 2) * 0.22;
      this.lensRings.push(ring);
      this.lensGroup.add(ring);
    }
    // The bull's-eye: a flat disc facing the beam, the bright heart of the lens.
    this.eye = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.eye.position.z = 0.7;
    this.lensGroup.add(this.eye);
    this.lensGroup.position.y = H + 0.35;
    this.group.add(this.lensGroup);
    // The inside of the tower: one wall in sections (the watch room's has a window toward the channel), floors at
    // the rooms, and a spiral of steps along the wall seen on the stairs.
    const wy = H - 6;
    const section = (y0, y1, start = 0, len = Math.PI * 2, hex = C.stone) => {
      const w = this.mesh(cyl(3.6, 3.6, y1 - y0, 20, hex, C.stoneDark, true, start, len), this.matInside);
      w.position.y = (y0 + y1) / 2;
      return w;
    };
    section(1.4, 5.3, 0, Math.PI * 2, 0x4a4f55);
    section(5.3, wy);
    section(wy, wy + 3.4, Math.PI * 0.9, Math.PI * 1.2, C.cream);
    section(wy + 3.4, H - 1.4);
    const stepGeo = box(1.1, 0.12, 0.5, C.iron, C.iron);
    const steps = new THREE.InstancedMesh(stepGeo, this.matFlat, 110);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 110; i++) {
      const t = i / 110;
      const a = t * Math.PI * 2 * 6;
      m4.makeRotationY(-a);
      m4.setPosition(Math.cos(a) * 3.0, 1.8 + t * (H - 4), Math.sin(a) * 3.0);
      steps.setMatrixAt(i, m4);
    }
    this.group.add(steps);
    // The watch room: floor, the chart table and the radio.
    this.mesh(cyl(3.6, 3.6, 0.3, 20, C.wood, C.wood)).position.y = wy;
    this.mesh(cyl(3.6, 3.6, 0.3, 20, C.wood, C.wood)).position.y = wy + 3.4;
    const sill = this.mesh(box(0.3, 0.2, 3.2, C.wood, C.wood));
    sill.position.set(3.6, wy + 1.05, 0);
    this.table = this.mesh(box(1.8, 0.08, 1.2, C.wood, C.wood));
    this.table.position.set(1.5, wy + 0.86, 0);
    this.mesh(box(1.6, 0.8, 1.0, C.wood, C.stoneDark)).position.set(1.5, wy + 0.42, 0);
    this.chartCanvas = document.createElement('canvas');
    this.chartCanvas.width = this.chartCanvas.height = 256;
    this.chartTex = new THREE.CanvasTexture(this.chartCanvas);
    this.chartTex.colorSpace = THREE.SRGBColorSpace;
    this.chartMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ map: this.chartTex }));
    this.chartMesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    this.chartMesh.position.set(1.5, wy + 0.91, 0);
    this.group.add(this.chartMesh);
    this.radio = this.mesh(box(0.5, 0.4, 0.7, C.brassDark, C.brass));
    this.radio.position.set(1.3, wy + 1.0, 1.5);
    this.mesh(box(0.6, 0.8, 0.9, C.wood, C.wood)).position.set(1.3, wy + 0.4, 1.5);
    this.needle = this.mesh(box(0.01, 0.18, 0.02, C.amber, C.amber), this.matGlow);
    this.needle.position.set(1.04, wy + 1.1, 1.5);
    this.hornLever = this.mesh(box(0.08, 0.7, 0.08, C.brass, C.brassDark));
    this.hornLever.position.set(0.6, wy + 1.4, 2.9);
    this.hornLever.rotation.x = -0.5;
    this.cat = new THREE.Group();
    this.cat.add(new THREE.Mesh(paint(new THREE.SphereGeometry(0.18, 8, 6), 0x3a2a24), this.matSmooth));
    const catHead = new THREE.Mesh(paint(new THREE.SphereGeometry(0.11, 8, 6), 0x3a2a24), this.matSmooth);
    catHead.position.set(0.18, 0.08, 0);
    this.cat.add(catHead);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(paint(new THREE.ConeGeometry(0.035, 0.08, 4), 0x3a2a24), this.matFlat);
      ear.position.set(0.2, 0.18, s * 0.06);
      this.cat.add(ear);
    }
    this.catCollar = new THREE.Mesh(paint(new THREE.TorusGeometry(0.09, 0.015, 4, 12), 0xd9432f), this.matSmooth);
    this.catCollar.position.set(0.14, 0.06, 0);
    this.catCollar.rotation.y = Math.PI / 2;
    this.cat.add(this.catCollar);
    this.cat.position.set(1.1, wy + 1.08, -0.4);
    this.cat.visible = false;
    this.group.add(this.cat);
    this.watchLamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    this.watchLamp.scale.set(3, 3, 1);
    this.watchLamp.position.set(0.6, wy + 2.9, 0);
    this.group.add(this.watchLamp);
    // The cellar: stone, the door to the east, barrels, cans, the crank and the flare crate.
    this.mesh(cyl(3.4, 3.4, 0.3, 16, C.stoneDark, C.stoneDark)).position.y = 1.4;
    this.mesh(cyl(3.6, 3.6, 0.3, 20, C.stoneDark, C.stoneDark)).position.y = 5.3;
    this.door = this.mesh(box(0.18, 2.6, 1.5, 0x6b4a2a, 0x8a6236));
    this.door.position.set(3.4, 2.85, 0);
    for (const y of [2.1, 3.7]) {
      const band = this.mesh(box(0.22, 0.12, 1.5, C.iron, C.iron));
      band.position.set(3.4, y, 0);
    }
    const frame = this.mesh(box(0.1, 3.0, 2.0, C.stoneDark, C.stone));
    frame.position.set(3.55, 3.05, 0);
    for (let i = 0; i < 3; i++) {
      const b = this.mesh(cyl(0.4, 0.4, 0.9, 10, C.wood, C.stoneDark));
      b.position.set(-2.2 + i * 0.9, 2.0, -2.2);
    }
    this.cans = [];
    for (let i = 0; i < 3; i++) {
      const can = this.mesh(cyl(0.18, 0.18, 0.5, 8, C.brassDark, C.brass));
      can.position.set(-2.4, 1.8, 1.4 + i * 0.5);
      this.cans.push(can);
    }
    this.crank = this.mesh(paint(new THREE.TorusGeometry(0.35, 0.04, 6, 16), C.iron, C.brass), this.matSmooth);
    this.crank.position.set(0.5, 2.9, -3.2);
    this.crate = this.mesh(box(0.7, 0.5, 0.5, 0x8a2a20, 0xd9432f));
    this.crate.position.set(2.0, 1.8, -2.4);
    this.cellarLamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    this.cellarLamp.scale.set(3, 3, 1);
    this.cellarLamp.position.set(2.2, 4.6, 0.8);
    this.group.add(this.cellarLamp);
    // The watch-room crank too (the hand crank lives at the watch room as well as the cellar).
    this.crank2 = this.mesh(paint(new THREE.TorusGeometry(0.3, 0.035, 6, 16), C.iron, C.brass), this.matSmooth);
    this.crank2.position.set(0.6, wy + 1.4, -3.0);
  }

  /** Camera anchors for the stations. */
  anchors() {
    const H = this.H;
    return {
      lantern: { y: H + 1.75, radius: -0.5, look: 'beam' },
      gallery: { y: H + 0.25, radius: this.site.galleryRadius - 0.5, look: 'beam' },
      watch: { y: H - 6 + 1.6, radius: 0, look: 'fixed', yaw: Math.PI * 0.5, pos: new THREE.Vector3(-0.5, 0, 0) },
      cellar: { y: 3.05, radius: 0, look: 'fixed', yaw: Math.PI * 0.5, pos: new THREE.Vector3(-0.6, 0, 0) },
    };
  }

  update(dt, beam, time, { lampOn = true, crankOn = false, hornOn = false, doorAttack = false, cat = false, collar = 'red', needle = 0, cansLeft = 1, crateTaken = false, housing = 'brass' } = {}) {
    // The lens turns with the beam in Spot, by itself in Sweep.
    const az = beam.mode === 'sweep' ? beam.sweepAz : beam.az;
    this.lensGroup.rotation.y = Math.PI - az;
    for (let i = 0; i < this.lensRings.length; i++) {
      const r = this.lensRings[i];
      r.rotation.z += dt * (0.3 + i * 0.12) * (lampOn ? 1 : 0.2);
    }
    const glow = lampOn ? 1 : 0.12;
    this.lampSprite.material.opacity = 0.5 * glow + 0.15 * Math.sin(time * 9) * glow;
    this.lampSprite.visible = LIGHT.uCamera.value.distanceTo(this.lampSprite.position) > 3.2;
    this.eye.material.opacity = 0.45 * glow;
    this.lensRings[0].material.opacity = 0.2 + 0.2 * glow;
    const cam = LIGHT.uCamera.value;
    if (cam.y < 5.5) LIGHT.uLamp.value.set(2.2, 4.6, 0.8, 3.2);
    else if (cam.y < this.H - 2) LIGHT.uLamp.value.set(0.6, this.H - 6 + 2.9, 0, 2.2);
    else LIGHT.uLamp.value.set(0, this.H + 0.35, 0, lampOn ? 1.1 : 0.2);
    const housingHex = housing === 'iron' ? C.iron : housing === 'teal' ? C.teal : housing === 'copper' ? 0xb0542a : C.brass;
    this.lamp.material.uniforms.uEmissive.value = lampOn ? 0.9 : 0.1;
    if (this.housingHex !== housingHex) {
      this.housingHex = housingHex;
      paint(this.ped.geometry, housingHex, housing === 'brass' ? C.brass : housingHex);
      this.ped.geometry.attributes.color.needsUpdate = true;
    }
    if (crankOn) {
      this.crank.rotation.z += dt * 6;
      this.crank2.rotation.x += dt * 6;
    }
    this.hornLever.rotation.x += ((hornOn ? 0.4 : -0.5) - this.hornLever.rotation.x) * Math.min(1, dt * 10);
    this.needle.rotation.z = -0.6 + needle * 1.2 + Math.sin(time * 17) * 0.05 * needle;
    if (doorAttack) this.doorShake = 1;
    this.doorShake = Math.max(0, this.doorShake - dt * 2);
    this.door.position.x = 3.4 + Math.sin(time * 40) * 0.06 * this.doorShake;
    this.door.position.y = 2.85;
    this.door.rotation.y = Math.sin(time * 33) * 0.04 * this.doorShake;
    this.cat.visible = cat;
    if (cat) {
      this.cat.scale.y = 1 + Math.sin(time * 1.6) * 0.03;
      const col = collar === 'teal' ? 0x35b6a6 : collar === 'amber' ? 0xf0a63a : collar === 'white' ? 0xe9e2d2 : 0xd9432f;
      if (this.collarHex !== col) {
        this.collarHex = col;
        paint(this.catCollar.geometry, col);
      }
    }
    for (let i = 0; i < this.cans.length; i++) this.cans[i].visible = i < cansLeft;
    this.crate.visible = !crateTaken;
  }
}
