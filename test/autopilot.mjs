// An autopilot that plays through the platform's touch controls (the analog stick and the Jump button), reading its character from
// what the page publishes as presence and thinking with the bots' brain. Closed loop: it sees where it really is every frame.
import { generateTower, analyze } from '../game/tower.js';
import { makeWorld, makeBody, standingOn } from '../game/sim.js';
import { brainInput, makeBrain, SKILLS } from '../game/bots.js';
import { GRACE_S, lavaBase, lavaAt } from '../game/rules.js';

/** Plays the match through the platform's touch controls, reading its character from what the page publishes. */
export function autopilot(room, ow) {
  const st = { rid: null, world: null, an: null, brain: null, body: makeBody(0, 0), out: { x: 0, down: false, jump: false, tap: false }, wasHeld: false, owe: false };
  return (g) => {
    if (!g || g.phase !== 'play') {
      ow.controls.stick.x = 0;
      ow.controls.held.delete('jump');
      return;
    }
    if (st.rid !== g.rid) {
      const tower = generateTower(g.seed);
      st.rid = g.rid;
      st.world = makeWorld(tower, { floorUntil: GRACE_S });
      st.an = analyze(tower);
      st.brain = makeBrain(99, SKILLS.sharp);
    }
    const p = room.me.presence;
    if (!p || p.r !== g.round || p.s !== 0) {
      ow.controls.stick.x = 0;
      ow.controls.held.delete('jump');
      return;
    }
    const t = (room.matchNow() - g.t0) / 1000;
    const b = st.body;
    b.x = p.x;
    b.y = p.y;
    b.vx = p.vx;
    b.vy = p.vy;
    b.on = p.o;
    b.gi = p.o ? standingOn(st.world, p.x, p.y, t, 0.06) : -1;
    if (p.o && b.gi < 0) b.on = 0;
    b.coyote = b.on ? 0.1 : 0;
    b.face = p.f ? 1 : -1;
    b.maxY = p.m;
    brainInput(st.world, st.an, b, st.brain, t, lavaAt(lavaBase(g.lava), t, g.ff), st.out);
    ow.controls.stick.x = st.out.x;
    if (st.out.tap && st.wasHeld) {
      ow.controls.held.delete('jump'); // let go for a frame so the next press is a new press
      st.wasHeld = false;
      st.owe = true;
    } else if (st.out.jump || st.out.tap || st.owe) {
      ow.controls.held.add('jump');
      st.wasHeld = true;
      st.owe = false;
    } else {
      ow.controls.held.delete('jump');
      st.wasHeld = false;
    }
  };
}

