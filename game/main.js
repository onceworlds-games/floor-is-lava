// The Floor Is Lava: boot, the loop, the screens, and this page's own character.
//
// Flow: join the room at once; a title with one PLAY button over the live arena; a lobby that is the bottom of the tower (practice
// jumping); a 3-2-1-GO; rounds (banner, climb, balloon flies off, scoreboard); a podium; back to the lobby with the results still up.
// The match itself (who is safe, who burned, the scores) is the host page's record `g` in room state: see net.js.

import {
  PHYS,
  T,
  GRACE_S,
  SHOUT1_S,
  SHOUT2_S,
  WORLD_W,
  LOBBY_CEIL,
  MAX_PLAYERS,
  SETTINGS,
  ROUND_OPTIONS,
  LAVA_OPTIONS,
  PLAYER_COLORS,
  clamp,
  hashStr,
  spawnX,
  lavaAt,
  roundsOf,
  lavaOf,
  finalRanking,
  places,
  awards as pickAwards,
  ordinal,
} from './rules.js';
import { generateTower } from './tower.js';
import { makeWorld, makeBody, stepBody, stepGhost, reachedGoal, standingOn } from './sim.js';
import { Fx, makeVis, updateVis, popupLook, easeOutCubic } from './fx.js';
import { Sound } from './audio.js';
import { createInput } from './input.js';
import { createAvatars } from './avatars.js';
import { RoundCtx } from './round.js';
import { Host, readG, createStubRoom } from './net.js';
import { makeView, viewScale, drawWorldBack, drawGoalFront, drawLava, drawChar, label, FONT } from './draw.js';
import * as ui from './ui.js';

const params = new URLSearchParams(location.search);
if (params.has('poster')) {
  const { runPoster } = await import('./poster.js');
  await runPoster(params.get('poster'));
} else {
  await boot();
}

async function boot() {
  const ow = window.onceworlds ?? null;

  // ---------------------------------------------------------------- join at once, before anything heavy
  let room;
  try {
    if (!ow) throw new Error('no platform');
    room = await ow.rooms.join({ maxPlayers: MAX_PLAYERS, minPlayers: 1, lobby: 'bar', settings: SETTINGS });
  } catch (err) {
    console.warn('[floor-is-lava] no platform room: playing alone on this page', err);
    room = createStubRoom();
  }
  try {
    ow?.ui?.setOrientation('landscape');
  } catch {
    // desktop ignores it
  }

  // ---------------------------------------------------------------- setup
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const sound = new Sound();
  const fx = new Fx();
  const input = createInput(ow);
  const avatars = createAvatars(ow);
  const nowMs = () => (ow ? ow.now() : Date.now());
  const STEP = PHYS.dt;

  const view = makeView(); // the world, following the camera
  const resView = makeView(); // the podium
  let W = 0;
  let H = 0;
  let pr = 1;
  let S = 30;
  let u = 1;
  let animT = 0;

  function resize() {
    W = Math.max(200, innerWidth);
    H = Math.max(150, innerHeight);
    pr = ow?.settings ? ow.settings.pixelRatio(2) : Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * pr);
    canvas.height = Math.round(H * pr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    S = viewScale(W, H);
    u = ui.uiScale(W, H);
    view.W = resView.W = W;
    view.H = resView.H = H;
    view.S = S;
    view.ol = clamp(S * 0.1, 2.5, 4.5);
  }
  addEventListener('resize', resize);
  try {
    ow?.settings?.on('change', resize);
  } catch {
    // ignore
  }
  resize();
  try {
    document.fonts?.load(`40px ${FONT.split(',')[0]}`)?.catch?.(() => {});
  } catch {
    // the fallback font draws until it loads
  }

  // ---------------------------------------------------------------- the lobby arena: the bottom of the tower, no lava
  const lobbyWorld = makeWorld(generateTower(7, { lobby: true }));
  const lobbySpawn = () => 2 + ((hashStr(room.me.id) % 1000) / 1000) * 10;
  const lobbyBody = makeBody(lobbySpawn(), 0);
  const lobbyVis = new Map();
  let lobbyEnterT = 0; // when this player came into the arena (the YOU arrow shows for a few seconds)

  function lcg(seed) {
    let a = seed >>> 0;
    return () => {
      a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
      return a / 4294967296;
    };
  }
  // the title's arena is alive: a few hoppers running and jumping about
  const hoppers = Array.from({ length: 5 }, (_, i) => ({ body: makeBody(2 + i * 2.4, 0), rnd: lcg(1000 + i * 77), t: 0, dir: 0, jumpIn: -1, hold: 0, ci: (i * 3 + 1) % PLAYER_COLORS.length }));

  // ---------------------------------------------------------------- state
  let titleOpen = room.match.phase === 'lobby';
  let needTap = !titleOpen; // arrived mid-match: the first tap starts the sound
  let audioOn = false;
  let rc = null; // this page's round context
  let appliedControls = '?';
  let musicMode = '';
  let resultsUntil = 0;
  let resultsG = null;
  let lastFinalG = null;
  let finalFor = null;
  let finalTrack = '';
  let matchTops = 0;
  let stats = { matches: 0, wins: 0, tops: 0 };
  let lastCount = 99;
  let goPlayed = false;
  let scoreSoundFor = '';
  let acc = 0;
  let lastTs = 0;
  const cam = { bottom: -1, focus: 0, ready: false };
  const INP = { x: 0, my: 0, down: false, jump: false, tap: false };
  const nameCache = new Map();
  const visIn = { x: 0, y: 0, vx: 0, vy: 0, o: 1, s: 0 };

  if (ow) {
    ow.save
      .get('stats')
      .then((s) => {
        if (s && typeof s === 'object') stats = { matches: Number(s.matches) || 0, wins: Number(s.wins) || 0, tops: Number(s.tops) || 0 };
      })
      .catch(() => {});
  }
  const award = (id) => {
    try {
      ow?.badges?.award(id)?.catch?.(() => {});
    } catch {
      // guests and the stand-alone page earn nothing
    }
  };

  // ---------------------------------------------------------------- the host's page (rounds, scores, bots)
  const host = new Host(room, { nowMs, ctxFor: (g) => ctxFor(g) });

  function ctxFor(g) {
    if (!g) return null;
    if (!rc || rc.rid !== g.rid) {
      rc = new RoundCtx(g);
      rc.me = makeMe(g, rc);
      cam.ready = false;
      fx.clear();
      // a page that joins mid-round: those already safe or out are not news
      for (const id of g.safe) {
        rc.arrived.add(id);
        rc.visOf(id).safeT = animT - 2;
      }
      for (const id of Object.keys(g.out)) {
        rc.burned.add(id);
        const v = rc.visOf(id);
        v.hotT = animT - 5;
        v.ghosted = true;
      }
      if (g.phase === 'score' || g.phase === 'fly') rc.flags.melt = rc.flags.shout1 = rc.flags.shout2 = rc.flags.surge = true;
      if (room.state.b) rc.pushSnap(room.state.b);
    }
    return rc;
  }

  function makeMe(g, c) {
    const id = room.me.id;
    const i = c.index.get(id);
    if (i === undefined || room.spectating) return null;
    const body = makeBody(spawnX(i, g.roster.length), 0);
    const m = { id, body, st: 0, hot: 0, claim: null };
    // a reload in the middle of a round: carry on from where this player was
    const p = room.me.presence;
    if (p && typeof p === 'object' && p.r === g.round && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      body.x = clamp(p.x, PHYS.halfW, c.world.w - PHYS.halfW);
      body.y = Math.max(-3, p.y);
      body.maxY = Number.isFinite(p.m) ? p.m : body.y;
      if (p.s === 2) m.st = 2;
      else if (p.s === 1) m.st = 1;
    }
    if (g.safe.includes(id)) m.st = 1;
    else if (Object.prototype.hasOwnProperty.call(g.out, id)) m.st = 2;
    return m;
  }

  setInterval(() => host.tick(), 100);
  room.on('message', (d, from, at, mt) => host.onMessage(d, from, at, mt));
  room.on('state', (key, value) => {
    if (key === 'b' && rc) rc.pushSnap(value);
  });
  room.on('host', () => host.adopt());
  room.on('reconnect', () => host.adopt());
  room.on('starting', () => {
    if (titleOpen) leaveTitle();
    lastCount = 99;
    goPlayed = false;
  });
  room.on('matchstart', () => {
    if (titleOpen) leaveTitle();
    rc = null;
    fx.clear();
    resultsUntil = 0;
    matchTops = 0;
    finalFor = null;
    lastFinalG = null;
    if (!goPlayed) {
      goPlayed = true;
      sound.go();
    }
    host.adopt();
  });
  room.on('matchend', (match, previous) => {
    rc = null;
    fx.clear();
    resetLobbyBody();
    lobbyEnterT = animT;
    if (previous?.phase === 'playing' && lastFinalG && lastFinalG.mid === previous.id) {
      resultsG = lastFinalG;
      resultsUntil = performance.now() + T.resultsAfterMs;
    }
  });
  room.on('rename', (p) => nameCache.set(p.id, p.name));
  host.adopt();
  if (titleOpen) room.hideLobby();

  function leaveTitle() {
    titleOpen = false;
    needTap = !audioOn;
    lobbyEnterT = animT;
    try {
      room.hideLobby(false);
    } catch {
      // ignore
    }
  }

  function resetLobbyBody() {
    const b = lobbyBody;
    b.x = lobbySpawn();
    b.y = 0;
    b.vx = b.vy = 0;
    b.on = 0;
    b.gi = -1;
    b.maxY = 0;
  }

  // ---------------------------------------------------------------- taps and keys
  function unlockAudio() {
    sound.unlock();
    audioOn = sound.ready;
  }
  function playPressed() {
    unlockAudio();
    sound.pop();
    leaveTitle();
  }
  function cycleSetting(id, values) {
    const i = values.indexOf(room.settings[id]);
    sound.tap();
    room.setSetting(id, values[(i + 1) % values.length]);
  }
  addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (needTap && !titleOpen) {
      needTap = false;
      return;
    }
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
    const y = ((e.clientY - r.top) / Math.max(1, r.height)) * H;
    if (titleOpen) {
      if (ui.inHit(ui.hits.play, x, y)) playPressed();
      return;
    }
    if (room.match.phase !== 'lobby') return;
    if (room.stub && ui.inHit(ui.hits.start, x, y)) {
      sound.pop();
      room.startMatch();
    } else if (room.isHost && ui.inHit(ui.hits.rounds, x, y)) cycleSetting('rounds', ROUND_OPTIONS);
    else if (room.isHost && ui.inHit(ui.hits.lava, x, y)) cycleSetting('lava', LAVA_OPTIONS.map((o) => o.value));
  });
  addEventListener('keydown', (e) => {
    unlockAudio();
    if (needTap && !titleOpen) {
      needTap = false;
      return;
    }
    if (e.repeat) return;
    if (titleOpen && (e.code === 'Space' || e.code === 'Enter')) playPressed();
    else if (room.stub && room.match.phase === 'lobby' && !titleOpen && e.code === 'Enter') room.startMatch();
  });

  // ---------------------------------------------------------------- who is who
  function nameOf(id, entry) {
    if (entry?.bot) return String(entry.name ?? 'Bot').slice(0, 14);
    const p = room.players.get(id);
    if (p?.name) nameCache.set(id, String(p.name));
    return String(nameCache.get(id) ?? 'Player').slice(0, 14);
  }
  const colorOf = (id) => hashStr(id) % PLAYER_COLORS.length;

  // a pool of character descriptions for the renderer: nothing is allocated per frame
  const descPool = [];
  let descN = 0;
  function newDesc() {
    let d = descPool[descN];
    if (!d) d = descPool[descN] = {};
    descN++;
    d.x = 0;
    d.y = 0;
    d.ci = 0;
    d.bot = false;
    d.seed = 0;
    d.head = null;
    d.name = '';
    d.alpha = 1;
    d.sq = 0;
    d.face = 1;
    d.run = 0;
    d.o = 1;
    d.ghost = false;
    d.hot = false;
    d.you = false;
    d.ring = false;
    d.ready = false;
    d.readyPop = 1;
    d.scale = 1;
    return d;
  }
  function lobbyVisOf(id) {
    let v = lobbyVis.get(id);
    if (!v) {
      v = makeVis();
      lobbyVis.set(id, v);
    }
    return v;
  }
  function feed(v, x, y, vx, vy, o, s, dt, vol) {
    visIn.x = x;
    visIn.y = y;
    visIn.vx = vx;
    visIn.vy = vy;
    visIn.o = o;
    visIn.s = s;
    updateVis(v, visIn, dt, fx, sound, vol);
  }

  // ---------------------------------------------------------------- the round, from this page
  const roundTime = (g) => (room.matchNow() - g.t0) / 1000;

  function sendClaim(g, m) {
    if (!m.claim) return;
    m.claim.sentAt = performance.now();
    if (room.isHost) {
      if (m.claim.kind === 'safe') host.claimSafe(room.me.id, nowMs(), room.matchNow());
      else host.claimOut(room.me.id, m.claim.h);
    } else room.send({ t: m.claim.kind, rid: g.rid, h: m.claim.h }, { to: room.host });
  }

  function mySafe(g, c) {
    const m = c.me;
    m.st = 1;
    m.body.vx = m.body.vy = 0;
    m.claim = { kind: 'safe', h: 0, sentAt: 0 };
    sendClaim(g, m);
  }

  function myBurn(g, c) {
    const m = c.me;
    m.st = 2;
    m.hot = T.hotS;
    m.body.vx = m.body.vy = 0;
    m.body.on = 0;
    m.claim = { kind: 'lava', h: Math.round(m.body.maxY * 10) / 10, sentAt: 0 };
    sendClaim(g, m);
    fx.hitstop(80);
    fx.shake(0.55);
    fx.doFlash(0.45);
    sound.out(1);
  }

  function stepMe(g, c, tk) {
    const m = c.me;
    if (!m) return;
    const b = m.body;
    if (m.st === 0) {
      input.sample(INP);
      if (g.phase !== 'play') {
        INP.x = 0;
        INP.jump = false;
        INP.down = false;
        INP.tap = false;
      }
      stepBody(c.world, b, INP, STEP, tk, true);
      b.ev = 0;
      b.impact = 0;
      if (g.phase === 'play' && tk >= 0) {
        if (reachedGoal(c.world, b)) mySafe(g, c);
        else if (b.y < lavaAt(c.base, tk, g.ff)) myBurn(g, c);
      }
    } else if (m.st === 2) {
      if (m.hot > 0) m.hot -= STEP;
      else {
        input.sample(INP);
        stepGhost(c.world, b, INP, STEP, lavaAt(c.base, tk, g.ff));
      }
    }
  }

  function stepHopper(h, tk) {
    const b = h.body;
    h.t -= STEP;
    if (h.t <= 0) {
      h.t = 0.4 + h.rnd() * 1.1;
      const r = h.rnd();
      h.dir = r < 0.3 ? -1 : r < 0.6 ? 1 : 0;
      h.jumpIn = h.rnd() < 0.7 ? h.rnd() * 0.3 : -1;
    }
    INP.x = h.dir * 0.8;
    INP.down = b.y > 7.5 && b.on === 1;
    INP.tap = false;
    if (h.jumpIn >= 0) {
      h.jumpIn -= STEP;
      if (h.jumpIn < 0) {
        INP.tap = true;
        h.hold = 0.28;
      }
    }
    h.hold -= STEP;
    INP.jump = h.hold > 0;
    stepBody(lobbyWorld, b, INP, STEP, tk, true);
    b.ev = 0;
    b.impact = 0;
  }

  // ---------------------------------------------------------------- one frame of logic
  function simFrame(dt) {
    const mp = room.match.phase;
    const g = readG(room);
    const inRound = mp === 'playing' && g && g.phase !== 'final';
    const c = inRound ? ctxFor(g) : null;
    if (mp === 'playing' && g && g.phase === 'final') lastFinalG = g;

    // fixed 60 Hz steps; a hit-stop or a paused match freezes them
    acc = Math.min(acc + dt, 0.12);
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      acc -= STEP;
      steps++;
    }
    if (fx.freeze > 0 || (mp === 'playing' && !room.running)) steps = 0;

    if (c) {
      const tFrame = roundTime(g);
      for (let k = 0; k < steps; k++) {
        const tk = tFrame - (steps - 1 - k) * STEP;
        stepMe(g, c, tk);
        host.stepBots(tk);
      }
      afterRound(g, c, dt, tFrame);
      host.publishBots();
    } else if (mp !== 'playing') {
      const tl = nowMs() / 1000;
      for (let k = 0; k < steps; k++) {
        const tk = tl - (steps - 1 - k) * STEP;
        if (titleOpen) for (const h of hoppers) stepHopper(h, tk);
        else if (!room.spectating) {
          input.sample(INP);
          stepBody(lobbyWorld, lobbyBody, INP, STEP, tk, true);
          lobbyBody.ev = 0;
          lobbyBody.impact = 0;
        }
      }
    }
  }

  /** The record says what happened; this page's celebrations, shouts and warnings follow it. */
  function afterRound(g, c, dt, tFrame) {
    const m = c.me;
    const id = room.me.id;
    if (m) {
      const safe = g.safe.includes(id);
      const out = Object.prototype.hasOwnProperty.call(g.out, id);
      // the host may have missed my message (it changed hands): say it again
      if (m.claim && g.phase === 'play' && !safe && !out && performance.now() - m.claim.sentAt > 700) sendClaim(g, m);
      // the record wins over my page (a reload, a quiet page the lava passed)
      if (safe && m.st !== 1) {
        m.st = 1;
        m.body.vx = m.body.vy = 0;
      } else if (out && m.st === 0) {
        m.st = 2;
        m.hot = 0;
        m.body.on = 0;
      }
    }
    // the shouts and the melting floor, once each
    if (g.phase === 'play') {
      const f = c.flags;
      if (!f.shout1 && tFrame >= SHOUT1_S) {
        f.shout1 = true;
        sound.shout();
        fx.shake(0.15);
      }
      if (!f.shout2 && tFrame >= SHOUT2_S) {
        f.shout2 = true;
        sound.lavaShout();
        fx.shake(0.35);
      }
      if (!f.surge && g.ff >= 0 && tFrame >= g.ff) {
        f.surge = true;
        sound.lavaShout();
        fx.shake(0.3);
      }
      if (!f.melt && tFrame >= GRACE_S) {
        f.melt = true;
        sound.melt();
        fx.shake(0.6);
        fx.doFlash(0.35);
        for (let k = 0; k < c.world.w; k += 1.4) fx.sparks(k + 0.5, 0.3, 3, '#ffb43b', 4.5);
      }
    }
    // arrivals: a hop into the basket, confetti, a bell
    const goalP = c.world.platforms[c.world.goal];
    g.safe.forEach((sid, idx) => {
      if (c.arrived.has(sid)) return;
      c.arrived.add(sid);
      const mine = sid === id;
      c.visOf(sid).safeT = animT;
      fx.confetti(goalP.x, goalP.y + 1, mine ? 50 : 18, 4, 8);
      fx.ring(goalP.x, goalP.y + 0.5, 1.2, '#ffd23f', 0.5);
      const text = `${ordinal(idx + 1)}!`;
      fx.popup(goalP.x + ((idx % 3) - 1) * 1.1, goalP.y + 2.2 + (idx % 2) * 0.5, text, idx === 0 ? '#ffd23f' : '#ffffff', mine ? 46 : 32);
      sound.place(idx, mine ? 1 : 0.45);
      if (mine) {
        sound.safe();
        fx.hitstop(60);
        fx.shake(0.3);
        c.placePop.text = text;
        c.placePop.at = animT;
        matchTops++;
        if (idx === 0) award('first-up');
        const gap = g.sg[id];
        if (Number.isFinite(gap) && gap < 2) award('hot-feet');
        if (stats.tops + matchTops >= 10) award('climber');
      }
    });
    if ((g.phase === 'fly' || g.phase === 'score') && c.balloonT < 0) {
      c.balloonT = g.te;
      sound.whoosh();
    }
    if (g.phase === 'score' && scoreSoundFor !== g.rid) {
      scoreSoundFor = g.rid;
      sound.points();
    }
    // lava bubbles under the surface
    const L = lavaAt(c.base, tFrame, g.ff);
    if (L > cam.bottom - 1 && L < cam.bottom + H / S && fx.rnd() < dt * (fx.quality + 1) * 3.2) {
      fx.bubble(fx.r(0.4, c.world.w - 0.4), L - fx.r(0.4, 1.4), L);
      if (fx.rnd() < 0.18) sound.lavaPop(0.35);
    }
    // a warning beep when it is close behind you
    if (m && m.st === 0 && g.phase === 'play' && tFrame > GRACE_S) {
      const gap = m.body.y - L;
      if (gap < 3.2 && performance.now() > c.flags.warnAt) {
        c.flags.warnAt = performance.now() + 520 - clamp(1 - gap / 3.2, 0, 1) * 330;
        sound.warn(0.7);
      }
    }
  }

  // ---------------------------------------------------------------- the camera
  function camUpdate(dt, focusY, grounded, lavaY, snap, minB, maxB) {
    const Hv = H / S;
    if (!cam.ready || snap) {
      cam.focus = focusY;
      cam.bottom = focusY - Hv * 0.3;
      cam.ready = true;
    }
    // follow the piece you stand on; a jump moves the camera only when it goes past a margin
    if (grounded) cam.focus = focusY;
    else if (focusY > cam.focus + 2.5) cam.focus = focusY - 2.5;
    else if (focusY < cam.focus - 3.5) cam.focus = focusY + 3.5;
    let want = cam.focus - Hv * 0.3;
    const lv = lavaY - 0.9;
    if (Number.isFinite(lavaY) && lv < want && lv >= focusY - Hv * 0.68) want = lv; // keep the lava's surface in view when it is close
    want = clamp(want, focusY - Hv * 0.68, focusY - Hv * 0.14);
    want = clamp(want, minB, Math.max(minB, maxB - Hv));
    cam.bottom += (want - cam.bottom) * (1 - Math.exp(-dt * 7));
    if (snap) cam.bottom = want;
  }

  // ---------------------------------------------------------------- touch controls and music follow what is on screen
  const PLAY_CONTROLS = { stick: 'analog', buttons: [{ id: 'jump', label: 'Jump', key: ' ' }] };
  function syncControls(g) {
    const mp = room.match.phase;
    let want = 'none';
    if (!titleOpen && !needTap && !room.spectating) {
      if (mp === 'lobby' || mp === 'starting') want = 'play';
      else if (mp === 'playing' && g && (g.phase === 'banner' || g.phase === 'play') && rc?.me) want = 'play';
    }
    if (want === appliedControls) return;
    appliedControls = want;
    try {
      ow?.controls?.set(want === 'play' ? PLAY_CONTROLS : null);
    } catch {
      // ignore
    }
  }

  function syncMusic(g) {
    if (!audioOn) return;
    const mode = room.match.phase === 'playing' && g && (g.phase === 'banner' || g.phase === 'play' || g.phase === 'fly') ? 'play' : 'menu';
    if (mode === musicMode) return;
    musicMode = mode;
    sound.setMusic(mode);
  }

  // ---------------------------------------------------------------- drawing
  function setWorldView(world) {
    view.camX = world.w / 2;
    view.camY = cam.bottom;
    view.shx = fx.shakeX;
    view.shy = fx.shakeY;
  }

  function drawPopups() {
    for (const p of fx.pops) {
      const lk = popupLook(p, view);
      if (!lk) continue;
      ctx.globalAlpha = lk.alpha;
      label(ctx, p.text, lk.x, lk.y, p.size * lk.scale * Math.max(0.8, u), { fill: p.color });
    }
    ctx.globalAlpha = 1;
  }

  /** Where this page's own character is, for everyone else. */
  function publishMe(b, status, round) {
    const r2 = (v) => Math.round(v * 100) / 100;
    const r1 = (v) => Math.round(v * 10) / 10;
    room.setPresence({ x: r2(b.x), y: r2(b.y), vx: r1(b.vx), vy: r1(b.vy), o: b.on ? 1 : 0, f: b.face > 0 ? 1 : 0, s: status, m: r1(b.maxY), r: round });
  }

  // ---- the arena: the title, the lobby and the countdown
  const arena = [];
  function drawArena(dt, mp) {
    const tl = nowMs() / 1000;
    const me = !titleOpen && !room.spectating;
    camUpdate(dt, me ? lobbyBody.y : 2, me ? lobbyBody.on === 1 : true, NaN, false, -0.9, LOBBY_CEIL + 0.9);
    if (titleOpen) cam.bottom = -0.9;
    setWorldView(lobbyWorld);
    drawWorldBack(ctx, view, lobbyWorld, tl, animT);
    descN = 0;
    arena.length = 0;
    if (titleOpen) {
      hoppers.forEach((h, i) => {
        const b = h.body;
        const v = lobbyVisOf(`hopper${i}`);
        feed(v, b.x, b.y, b.vx, b.vy, b.on, 0, dt, 0);
        const d = newDesc();
        d.x = b.x;
        d.y = b.y;
        d.ci = h.ci;
        d.bot = true;
        d.seed = h.ci;
        d.face = b.face;
        d.o = b.on;
        d.sq = v.sq;
        d.run = v.run;
        arena.push(d);
      });
    } else {
      for (const p of room.players.values()) {
        const isMe = p.id === room.me.id;
        let x;
        let y;
        let vx;
        let vy;
        let on;
        let face;
        if (isMe) {
          if (room.spectating) continue;
          x = lobbyBody.x;
          y = lobbyBody.y;
          vx = lobbyBody.vx;
          vy = lobbyBody.vy;
          on = lobbyBody.on;
          face = lobbyBody.face;
        } else {
          const raw = p.presence;
          if (!raw || typeof raw !== 'object' || raw.r !== 0 || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue;
          const sm = room.presenceAt(p.id, { snap: 6 }) ?? raw;
          x = clamp(Number(sm.x) || 0, 0, WORLD_W);
          y = clamp(Number(sm.y) || 0, -1, LOBBY_CEIL);
          vx = Number(sm.vx) || 0;
          vy = Number(sm.vy) || 0;
          on = raw.o ? 1 : 0;
          face = raw.f ? 1 : -1;
        }
        const v = lobbyVisOf(p.id);
        feed(v, x, y, vx, vy, on, 0, dt, isMe ? 1 : 0.35);
        if (p.ready && !v.ready) v.readyT = animT;
        v.ready = p.ready ? 1 : 0;
        const d = newDesc();
        d.x = x;
        d.y = y;
        d.ci = colorOf(p.id);
        d.seed = d.ci;
        d.head = avatars.get(p.id);
        d.name = nameOf(p.id);
        d.alpha = p.connected === false ? 0.5 : 1;
        d.sq = v.sq;
        d.face = face;
        d.run = v.run;
        d.o = on;
        d.you = isMe && animT - lobbyEnterT < 3;
        d.ring = isMe;
        d.ready = Boolean(p.ready);
        d.readyPop = clamp((animT - v.readyT) / 0.35, 0, 1);
        arena.push(d);
      }
      arena.sort((a, b) => (a.ring ? 1 : 0) - (b.ring ? 1 : 0)); // me on top
      if (!room.spectating && mp !== 'playing') publishMe(lobbyBody, 0, 0);
    }
    for (const d of arena) drawChar(ctx, view, d, animT);
    fx.draw(ctx, view);
    drawPopups();
  }

  // ---- a round
  const scratch = { x: 0, y: 0, vx: 0, vy: 0, o: 1, s: 0, f: 1, m: 0 };

  /** Where and how a roster member is now: fills `scratch`. */
  function charState(c, g, r, i, out) {
    const id = r.id;
    if (c.me && id === room.me.id) {
      const b = c.me.body;
      out.x = b.x;
      out.y = b.y;
      out.vx = b.vx;
      out.vy = b.vy;
      out.o = b.on ? 1 : 0;
      out.s = c.me.st;
      out.f = b.face;
      out.m = b.maxY;
      return;
    }
    if (r.bot) {
      const bot = room.isHost && c.runner ? c.runner.byId(id) : null;
      if (bot) {
        const b = bot.body;
        out.x = b.x;
        out.y = b.y;
        out.vx = b.vx;
        out.vy = b.vy;
        out.o = b.on ? 1 : 0;
        out.s = bot.st;
        out.f = b.face;
        out.m = b.maxY;
        return;
      }
      if (c.sampleBot(c.botIds.indexOf(id), room.matchNow() - 130, out)) {
        out.m = out.y;
        return;
      }
    } else {
      const raw = room.players.get(id)?.presence;
      if (raw && typeof raw === 'object' && raw.r === g.round && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
        const sm = room.presenceAt(id, { snap: 6 }) ?? raw;
        out.x = clamp(Number(sm.x) || 0, 0, c.world.w);
        out.y = clamp(Number(sm.y) || 0, -6, c.world.goalY + 12);
        out.vx = Number(sm.vx) || 0;
        out.vy = Number(sm.vy) || 0;
        out.o = raw.o ? 1 : 0;
        out.s = raw.s === 1 || raw.s === 2 ? raw.s : 0;
        out.f = raw.f ? 1 : -1;
        out.m = Number(raw.m) || 0;
        return;
      }
    }
    // nothing yet: waiting on the floor at their spot
    out.x = spawnX(i, g.roster.length);
    out.y = 0;
    out.vx = out.vy = 0;
    out.o = 1;
    out.s = 0;
    out.f = 1;
    out.m = 0;
  }

  const alive = [];
  const basket = [];
  const ghosts = [];
  const barEntries = [];

  /** How far the balloon has risen: it waits a moment after the round ends, then goes. */
  function balloonDy(g) {
    if (g.phase === 'fly' || g.phase === 'score' || g.phase === 'final') {
      const f = (room.matchNow() - g.te) / 1000 - 0.4;
      return f > 0 ? Math.min(160, f * f * 6) : 0;
    }
    return 0;
  }

  function drawRound(g, c, dt) {
    const world = c.world;
    const tk = roundTime(g);
    const L = lavaAt(c.base, tk, g.ff);
    const dy = balloonDy(g);
    const goalP = world.platforms[world.goal];
    const myId = room.me.id;
    const m = c.me;

    descN = 0;
    alive.length = ghosts.length = basket.length = barEntries.length = 0;
    let leaderY = -Infinity;
    let leaderOn = true;
    let left = 0;
    g.roster.forEach((r, i) => {
      charState(c, g, r, i, scratch);
      const id = r.id;
      const vis = c.visOf(id);
      const slot = g.safe.indexOf(id);
      const isSafe = slot >= 0;
      const status = isSafe ? 1 : scratch.s === 2 ? 2 : 0;
      if (status === 0) left++;
      // burned: smoke, flames, "HOT!", then a hop, then a puff as it turns into a ghost
      if (status === 2 && !c.burned.has(id)) {
        c.burned.add(id);
        vis.hotT = animT;
        fx.smoke(scratch.x, scratch.y + 0.3, 8);
        fx.flames(scratch.x, scratch.y, 6);
        fx.popup(scratch.x, scratch.y + 1.6, 'HOT!', '#ff8a1f', 38);
        fx.ring(scratch.x, scratch.y + 0.4, 0.8, '#ff8a1f', 0.4);
        if (id !== myId) sound.out(0.4);
      }
      const hotAge = vis.hotT >= 0 ? animT - vis.hotT : 99;
      const hot = status === 2 && hotAge < T.hotS;
      if (status === 2 && !hot && !vis.ghosted) {
        vis.ghosted = true;
        fx.smoke(scratch.x, scratch.y + 0.5, 6);
        if (id === myId) sound.ghost(1);
      }
      feed(vis, scratch.x, scratch.y, scratch.vx, scratch.vy, scratch.o, status === 0 ? 0 : 1, dt, id === myId ? 1 : 0.3);
      // a pillow wobbles under anyone's feet, not only mine
      if (status === 0 && id !== myId && scratch.o) {
        const si = standingOn(world, scratch.x, scratch.y, tk, 0.12);
        if (si >= 0 && world.platforms[si].kind === 'crumble' && world.ct[si] < 0 && tk >= 0) {
          world.ct[si] = tk;
          sound.crumble(0.4);
        }
      }
      const d = newDesc();
      d.ci = r.c;
      d.bot = Boolean(r.bot);
      d.seed = hashStr(id) % 6;
      d.head = r.bot ? null : avatars.get(id);
      d.name = nameOf(id, r);
      d.face = scratch.f;
      d.run = vis.run;
      d.o = scratch.o;
      d.sq = vis.sq;
      d.ring = id === myId;
      d.you = id === myId && status === 0 && tk < 3;
      const pl = room.players.get(id);
      d.alpha = !r.bot && pl && pl.connected === false ? 0.5 : 1;
      if (isSafe) {
        // hop into the basket and cheer
        const row = Math.floor(slot / 4);
        const col = slot % 4;
        const bx = goalP.x - 1.05 + col * 0.7 + (row % 2) * 0.3;
        const by = goalP.y - 0.4 + row * 0.42 + dy;
        const f = vis.safeT >= 0 ? clamp((animT - vis.safeT) / 0.5, 0, 1) : 1;
        if (f < 1) {
          const k = easeOutCubic(f);
          d.x = scratch.x + (bx - scratch.x) * k;
          d.y = scratch.y + (by - scratch.y) * k + Math.sin(f * Math.PI) * 1.4;
          d.o = 0;
          d.sq = 0.1;
        } else {
          d.x = bx;
          d.y = by + Math.abs(Math.sin(animT * 6 + slot * 1.3)) * 0.2;
          d.o = 1;
          d.sq = 0;
        }
        d.scale = 0.82;
        d.ring = false;
        basket.push(d);
      } else if (status === 2) {
        d.x = scratch.x;
        d.ring = false;
        if (hot) {
          d.y = scratch.y + Math.abs(Math.sin(hotAge * 11)) * 0.4;
          d.hot = true;
          d.o = 0;
          d.sq = 0;
          alive.push(d);
        } else {
          d.y = scratch.y;
          d.ghost = true;
          d.alpha *= 0.6;
          ghosts.push(d);
        }
      } else {
        d.x = scratch.x;
        d.y = scratch.y;
        alive.push(d);
        if (id !== myId && scratch.y > leaderY) {
          leaderY = scratch.y;
          leaderOn = Boolean(scratch.o);
        }
      }
      barEntries.push({ ci: r.c, y: status === 2 && scratch.m > 0 ? scratch.m : scratch.y, st: status, me: id === myId });
    });

    // the camera: on me while I climb, else on whoever is highest (or the balloon as it leaves)
    let focus;
    let grounded = true;
    if (g.phase === 'fly' || g.phase === 'score') focus = goalP.y + Math.min(dy, 60) * 0.5 - 1;
    else if (m && m.st !== 1) {
      focus = m.body.y;
      grounded = m.st === 2 || m.body.on === 1;
    } else if (leaderY > -Infinity) {
      focus = leaderY;
      grounded = leaderOn;
    } else focus = goalP.y - 2;
    const snap = c.camSnap;
    c.camSnap = false;
    camUpdate(dt, focus, grounded, L, snap, -4.6, world.goalY + 8);

    setWorldView(world);
    drawWorldBack(ctx, view, world, tk, animT, dy);
    for (const d of alive) drawChar(ctx, view, d, animT);
    for (const d of basket) drawChar(ctx, view, d, animT);
    drawGoalFront(ctx, view, world, animT, dy);
    drawLava(ctx, view, L, animT);
    for (const d of ghosts) drawChar(ctx, view, d, animT);
    fx.draw(ctx, view);
    drawPopups();

    // ---- screen-space overlays
    if (m && m.st === 0 && g.phase === 'play') ui.drawWarnEdge(ctx, W, H, m.body.y - L, animT, fx.reduced);
    if (g.phase === 'banner') {
      const age = (room.matchNow() - (g.until - T.bannerMs)) / 1000;
      ui.drawBanner(ctx, W, H, u, 'REACH THE BALLOON!', g.round, g.n, age, fx.reduced);
    }
    if (g.phase === 'play' || g.phase === 'banner') {
      ui.drawShout(ctx, W, H, u, tk, fx.reduced);
      if (g.round === 1 && room.matchNow() < 700) ui.drawCountdown(ctx, W, H, u, 'GO!', room.matchNow() / 700, fx.reduced);
      if (g.ff >= 0) ui.drawSurge(ctx, W, H, u, tk - g.ff, fx.reduced);
    }
    if (g.phase === 'banner' || g.phase === 'play' || g.phase === 'fly') {
      const bottom = ui.drawHud(ctx, W, H, u, { round: g.round, total: g.n, left, score: g.scores[myId] ?? 0 });
      ui.drawHeightBar(ctx, W, H, u, { goalY: world.goalY, lava: L, entries: barEntries });
      if (room.spectating) ui.drawWatching(ctx, W, H, u, bottom + 8);
      else if (m && m.st === 2 && m.hot <= 0) ui.drawGhostChip(ctx, W, H, u, bottom + 8);
    }
    if (c.placePop.text) ui.drawPlacePop(ctx, W, H, u, c.placePop.text, animT - c.placePop.at);
    if (g.phase === 'score') drawScore(g);
    ui.drawFlash(ctx, W, H, fx.flash, m && m.st === 2 && m.hot > 0 ? '255,120,40' : '255,255,255');
  }

  function rosterRow(g, id) {
    const r = g.roster.find((x) => x.id === id);
    return { id, name: nameOf(id, r), ci: r ? r.c : 0, bot: Boolean(r?.bot), head: r && !r.bot ? avatars.get(id) : null };
  }

  function drawScore(g) {
    const ids = g.roster.map((r) => r.id);
    const rows = finalRanking(ids, g.scores, g.firsts).map((id) => ({ ...rosterRow(g, id), score: g.scores[id] ?? 0, add: (g.rp && g.rp[id]) || 0 }));
    const age = (room.matchNow() - (g.until - T.scoreMs)) / 1000;
    ui.drawScoreboard(ctx, W, H, u, { rows, you: room.me.id, age, round: g.round, final: false }, animT);
  }

  // ---- the podium (full screen at the end, a card over the lobby afterwards)
  function drawFinal(g, dt, compact) {
    const ids = g.roster.map((r) => r.id);
    const ranked = finalRanking(ids, g.scores, g.firsts);
    const pl = places(ranked, g.scores, g.firsts);
    const rows = ranked.map((id, i) => ({ ...rosterRow(g, id), score: g.scores[id] ?? 0, place: pl[i] }));
    const aw = pickAwards(ids, g.gap, g.firsts);
    const nm = (id) => (id ? nameOf(id, g.roster.find((r) => r.id === id)) : null);
    let floor;
    let age = 10;
    if (compact) {
      const pnl = ui.drawResultsPanel(ctx, W, H, u);
      floor = pnl.y + pnl.h - 26 * u;
    } else {
      floor = H - 44 * u;
      age = (room.matchNow() - (g.until - T.finalMs)) / 1000;
      // a festive backdrop: rays from the winner
      ctx.fillStyle = '#4a2f7a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#5d3b94';
      const cx = W / 2;
      const cy = floor - H * 0.2;
      for (let k = 0; k < 12; k++) {
        const a = animT * 0.2 + (k * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * W * 1.5, cy + Math.sin(a) * W * 1.5);
        ctx.lineTo(cx + Math.cos(a + 0.18) * W * 1.5, cy + Math.sin(a + 0.18) * W * 1.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#2b1a2f';
      ctx.fillRect(0, floor, W, H - floor);
    }
    const topRoom = floor - Math.max(120, 130 * u);
    resView.S = clamp(Math.min(W / 9.5, topRoom / 4.4), 24, 96);
    resView.ol = clamp(resView.S * 0.07, 2.5, 4.5);
    resView.camX = 0;
    resView.camY = -(H - floor) / resView.S;
    resView.shx = 0;
    resView.shy = 0;
    if (!compact && finalTrack !== g.mid) {
      finalTrack = g.mid;
      sound.fanfare();
      fx.confetti(0, 5, 70, 6, 10);
    }
    if (!compact && fx.rnd() < dt * 5) fx.confetti(fx.r(-3.5, 3.5), 6.5, 6, 2, 1);
    ui.drawPodium(ctx, resView, W, H, u, { ranked: rows, you: room.me.id, age, awards: { hotFeet: nm(aw.hotFeet), skyHigh: nm(aw.skyHigh) } }, animT);
    if (!compact) fx.draw(ctx, resView);
  }

  // ---------------------------------------------------------------- the match's end: stats, badges, the board
  function onFinal(g) {
    if (finalFor === g.mid) return;
    finalFor = g.mid;
    const id = room.me.id;
    if (!g.roster.some((r) => r.id === id)) return;
    const ids = g.roster.map((r) => r.id);
    const ranked = finalRanking(ids, g.scores, g.firsts);
    const pl = places(ranked, g.scores, g.firsts);
    const won = pl[ranked.indexOf(id)] === 1;
    stats = { matches: stats.matches + 1, wins: stats.wins + (won ? 1 : 0), tops: stats.tops + matchTops };
    matchTops = 0;
    try {
      ow?.save?.set('stats', stats)?.catch?.(() => {});
    } catch {
      // ignore
    }
    if (won) {
      award('first-win');
      try {
        ow?.leaderboards?.submit('wins', stats.wins)?.catch?.(() => {});
      } catch {
        // guests have no leaderboard
      }
    }
    if (stats.tops >= 10) award('climber');
  }

  function drawCountdownScreen() {
    const startsAt = room.match.startsAt;
    if (!Number.isFinite(startsAt)) return;
    const left = (startsAt - nowMs()) / 1000;
    const n = Math.ceil(left);
    if (n >= 1 && n <= 3) {
      if (n !== lastCount) {
        lastCount = n;
        sound.tick();
      }
      ui.drawCountdown(ctx, W, H, u, n, 1 - (left - (n - 1)), fx.reduced);
    } else if (n <= 0) {
      if (!goPlayed) {
        goPlayed = true;
        sound.go();
      }
      ui.drawCountdown(ctx, W, H, u, 'GO!', clamp(-left, 0, 1), fx.reduced);
    }
  }

  // ---------------------------------------------------------------- the frame
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = clamp((ts - (lastTs || ts)) / 1000, 0, 0.1);
    lastTs = ts;
    animT = ts / 1000;
    try {
      fx.reduced = Boolean(ow?.settings?.reducedMotion);
      fx.quality = ow?.settings ? (ow.settings.quality === 'low' ? 0 : ow.settings.quality === 'medium' ? 1 : 2) : 2;
    } catch {
      // keep the last settings
    }
    simFrame(dt);
    fx.update(dt, Math.max(8, S * 0.5));

    const mp = room.match.phase;
    const g = readG(room);
    syncControls(g);
    syncMusic(g);
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ui.clearHits();

    if (mp === 'playing' && g && g.phase === 'final') {
      onFinal(g);
      drawFinal(g, dt, false);
    } else if (mp === 'playing' && g && rc && rc.rid === g.rid) {
      // publish my character while a round runs
      if (rc.me && room.running) publishMe(rc.me.body, rc.me.st, g.round);
      drawRound(g, rc, dt);
    } else {
      drawArena(dt, mp);
      if (mp === 'starting') drawCountdownScreen();
      else if (mp === 'playing') label(ctx, 'GET READY', W / 2, H * 0.35, Math.max(34, 56 * u));
      if (titleOpen) ui.drawTitle(ctx, W, H, u, animT);
      else if (mp === 'lobby') {
        const bottom = ui.drawLobbyChips(ctx, W, H, u, { rounds: roundsOf(room.settings.rounds), lava: lavaOf(room.settings.lava), editable: room.isHost }, animT);
        ui.drawHint(ctx, W, bottom + 30 * u, u, 'Climb! The floor is lava!');
        if (room.stub) ui.drawStandaloneStart(ctx, W, H, u, animT);
        if (resultsG && performance.now() < resultsUntil) drawFinal(resultsG, dt, true);
      }
      if (room.spectating && mp === 'playing') ui.drawWatching(ctx, W, H, u, 70);
    }
    if (needTap && !titleOpen) ui.drawTapHint(ctx, W, H, u, animT);
  }

  requestAnimationFrame(frame);
}
