// The real main.js, run in node against a fake browser: title, PLAY, lobby, settings, countdown, a whole match played by an autopilot
// through the platform's touch controls, the podium, and back to the lobby. Anything undefined, thrown or not a number in the drawing and
// wiring code shows up here instead of in a player's browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, fakePlatform } from './fakedom.mjs';
import { createStubRoom, readG } from '../game/net.js';
import { autopilot } from './autopilot.mjs';
import { mulberry32 } from '../game/rules.js';

Math.random = mulberry32(2026);
const room = createStubRoom();
const { ow, log } = fakePlatform(room);
const dom = installFakeDom({ ow });
await import('../game/main.js');
const ui = await import('../game/ui.js');

const center = (h) => ({ clientX: h.x + h.w / 2, clientY: h.y + h.h / 2, pointerType: 'mouse' });
const click = (h) => dom.fire('pointerdown', center(h));
const seen = (text) => dom.stats.texts.includes(text);

test('the title: the name, one big PLAY button, nothing else to read', () => {
  dom.frames(40);
  assert.ok(ui.hits.play.on, 'a PLAY button');
  assert.ok(ui.hits.play.h >= 64, `a thumb-sized button (${ui.hits.play.h} px tall)`);
  assert.ok(seen('PLAY') && seen('LAVA') && seen('THE FLOOR IS'));
  assert.ok(!seen('ROUNDS'), 'no settings on the title');
  assert.deepEqual(log.orientation, ['landscape']);
  assert.equal(log.controls.at(-1), null, 'no touch controls on the title');
  assert.deepEqual(dom.problems, []);
});

test('PLAY starts the sound and the lobby: the arena, the settings, a five-word hint', () => {
  click(ui.hits.play);
  dom.frames(90);
  assert.ok(!ui.hits.play.on);
  assert.ok(dom.stats.audioNodes > 20, `music and sounds started (${dom.stats.audioNodes} nodes)`);
  const layout = log.controls.at(-1);
  assert.equal(layout.stick, 'analog');
  assert.deepEqual(layout.buttons, [{ id: 'jump', label: 'Jump', key: ' ' }]);
  assert.ok(seen('ROUNDS') && seen('LAVA') && seen('Climb! The floor is lava!'));
  assert.ok(ui.hits.rounds.on && ui.hits.lava.on, 'the host can tap the settings');
  assert.ok(ui.hits.rounds.h >= 56 && ui.hits.lava.h >= 56);
  assert.deepEqual(dom.problems, []);
});

test('in the lobby you can run and jump about; the host changes the settings with a tap', () => {
  const before = room.me.presence;
  assert.ok(before && before.r === 0, 'your character is published for the others');
  dom.fire('keydown', { code: 'ArrowRight', key: 'ArrowRight' });
  dom.frames(40);
  const run = room.me.presence;
  dom.fire('keyup', { code: 'ArrowRight' });
  assert.ok(run.x > before.x + 1 || run.x > 12, 'ran right');
  dom.fire('keydown', { code: 'Space', key: ' ' });
  let top = run.y;
  dom.frames(10, 16.7, () => (top = Math.max(top, room.me.presence.y)));
  dom.fire('keyup', { code: 'Space' });
  assert.ok(top > run.y + 1, `jumped (${top})`);
  dom.frames(60);
  assert.equal(room.settings.rounds, 3);
  click(ui.hits.rounds);
  dom.frames(3);
  assert.equal(room.settings.rounds, 5);
  click(ui.hits.rounds);
  click(ui.hits.rounds);
  dom.frames(3);
  assert.equal(room.settings.rounds, 3);
  click(ui.hits.lava);
  dom.frames(3);
  assert.equal(room.settings.lava, 'fast');
  click(ui.hits.lava);
  click(ui.hits.lava);
  dom.frames(3);
  assert.equal(room.settings.lava, 'normal');
  assert.deepEqual(dom.problems, []);
});

test('the countdown shows a huge 3, 2, 1, GO!', () => {
  dom.stats.texts.length = 0;
  assert.ok(ui.hits.start.on, 'the stand-alone page has its own START');
  click(ui.hits.start);
  dom.frames(200);
  for (const t of ['3', '2', '1', 'GO!']) assert.ok(seen(t), `${t} was drawn`);
  assert.equal(room.match.phase, 'playing');
  assert.deepEqual(dom.problems, []);
});

test('a whole three-round match: banner, shouts, climb, balloon, scoreboard, podium, and back to the lobby', () => {
  dom.stats.texts.length = 0;
  const drive = autopilot(room, ow);
  const phases = [];
  const rounds = new Set();
  let last = '';
  let ghostSeen = false;
  let bannerSeen = false;
  for (let i = 0; i < 60 * 60 * 14; i++) {
    drive(readG(room));
    dom.frames(1);
    const g = readG(room);
    if (g) {
      const key = `${g.round}:${g.phase}`;
      if (key !== last) {
        phases.push(key);
        last = key;
        rounds.add(g.round);
      }
      if (g.phase === 'banner' && dom.stats.texts.includes('REACH THE BALLOON!')) bannerSeen = true;
      if (room.me.presence?.s === 2) ghostSeen = true;
    }
    if (room.match.phase === 'lobby') break; // the host ended the match after the podium
  }
  assert.deepEqual(dom.problems, [], 'no bad numbers, no unbalanced save/restore in thousands of frames');
  assert.deepEqual([...rounds], [1, 2, 3]);
  for (let r = 1; r <= 3; r++) {
    const mine = phases.filter((p) => p.startsWith(`${r}:`)).map((p) => p.split(':')[1]);
    assert.deepEqual(mine.slice(0, 4), ['banner', 'play', 'fly', 'score'], `round ${r}: ${mine}`);
  }
  assert.ok(phases.includes('3:final'));
  assert.ok(bannerSeen, 'the goal in a few words');
  for (const t of ['THE FLOOR IS...', 'LAVA!', 'SAFE']) assert.ok(seen(t), `"${t}" was drawn`);
  assert.ok(seen('GHOST') || !ghostSeen);
  // the stats were saved once, and a lap of the podium was drawn
  assert.equal(log.saves.length, 1);
  const [key, stats] = log.saves[0];
  assert.equal(key, 'stats');
  assert.equal(stats.matches, 1);
  assert.ok(stats.wins === 0 || stats.wins === 1);
  assert.ok(stats.tops >= 0 && stats.tops <= 3);
});

test('after the match the lobby is back with the results card over it for a few seconds', () => {
  dom.frames(5);
  assert.equal(room.match.phase, 'lobby');
  assert.ok(ui.hits.rounds.on, 'the lobby again');
  assert.ok(dom.stats.texts.some((t) => t === 'HOT FEET' || t === 'SKY HIGH' || /^\d+$/.test(t)), 'the results are still showing');
  dom.frames(60 * 6);
  assert.deepEqual(dom.problems, []);
  // and another match can start straight away
  dom.stats.texts.length = 0;
  click(ui.hits.start);
  dom.frames(60 * 8);
  assert.equal(room.match.phase, 'playing');
  assert.ok(seen('REACH THE BALLOON!'));
  assert.deepEqual(dom.problems, []);
});
