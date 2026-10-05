// Shared by the tests: whole rounds and matches played by bots only, with the pure rules, physics and bot code.
import { generateTower, analyze } from '../game/tower.js';
import { makeWorld } from '../game/sim.js';
import { BotRunner, botSpecs, SKILLS, skillFor } from '../game/bots.js';
import {
  PHYS,
  GRACE_S,
  ROUND_MAX_S,
  WORLD_W,
  lavaLevel,
  lavaBase,
  buildRoster,
  spawnX,
  roundSeed,
  newRecord,
  applySafe,
  applyOut,
  roundDone,
  roundOrder,
  roundPoints,
  finalRanking,
  places,
  resolved,
  mulberry32,
} from '../game/rules.js';

export const DT = PHYS.dt;

/** One round, everyone a bot, at 60 Hz. Returns what happened and anything that went wrong (NaN, outside the shaft). */
export function simulateRound({ seed, roster, lava = 'normal', skill }) {
  const tower = generateTower(seed);
  const world = makeWorld(tower, { floorUntil: GRACE_S });
  const an = analyze(tower);
  const base = lavaBase(lava);
  const specs = botSpecs(roster, seed, (i) => spawnX(i, roster.length), skill);
  const runner = new BotRunner(world, an, specs);
  const ids = roster.map((r) => r.id);
  const rec = newRecord();
  const problems = [];
  let steps = 0;
  let end = 0;
  const limit = Math.ceil((ROUND_MAX_S + GRACE_S) / DT);
  for (let k = 0; k < limit; k++) {
    const t = k * DT;
    const L = lavaLevel(base, t);
    const events = runner.step(t, DT, L);
    steps++;
    for (const e of events) {
      if (e.kind === 'safe') applySafe(rec, e.id);
      else applyOut(rec, e.id, e.h);
    }
    for (const bot of runner.bots) {
      const b = bot.body;
      if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) problems.push(`NaN for ${bot.id} at ${t.toFixed(2)}`);
      else if (b.x < -0.001 || b.x > WORLD_W + 0.001) problems.push(`${bot.id} outside the shaft at x=${b.x}`);
      else if (b.y < -8 || b.y > tower.goalY + 6) problems.push(`${bot.id} at y=${b.y}`);
    }
    if (roundDone(rec, ids)) {
      end = t;
      break;
    }
  }
  if (!end) end = ROUND_MAX_S + GRACE_S;
  for (const id of ids) if (!resolved(rec, id)) applyOut(rec, id, runner.byId(id)?.body.maxY ?? 0);
  return { rec, steps, end, problems, tower, ids };
}

/** A whole match of bots only: the same flow the host runs, minus the network. */
export function simulateMatch({ seed, rounds = 3, lava = 'normal', seats = 6, skill }) {
  const roster = buildRoster([], seed, seats);
  const ids = roster.map((r) => r.id);
  const scores = Object.fromEntries(ids.map((id) => [id, 0]));
  const firsts = {};
  const results = [];
  const problems = [];
  for (let n = 1; n <= rounds; n++) {
    const r = simulateRound({ seed: roundSeed(seed, n), roster, lava, skill });
    problems.push(...r.problems);
    const pts = roundPoints(r.rec, ids);
    for (const id of ids) scores[id] += pts[id];
    if (r.rec.safe[0]) firsts[r.rec.safe[0]] = (firsts[r.rec.safe[0]] ?? 0) + 1;
    results.push({ order: roundOrder(r.rec, ids), safe: r.rec.safe.length, end: r.end, pts });
  }
  const ranking = finalRanking(ids, scores, firsts);
  return { roster, ids, scores, firsts, ranking, places: places(ranking, scores, firsts), results, problems, rounds: results.length };
}

export { SKILLS, skillFor, mulberry32 };
