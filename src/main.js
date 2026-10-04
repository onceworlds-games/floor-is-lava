// Boot: join the room first, then build the scene; then run the title, the day and the night.
import './ui/style.css';
import { ow, saves, now, player, controls, settings, onPlatformEvent, onPlatform, ui } from './platform.js';
import { Session } from './net/session.js';
import { View } from './render/view.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { Hints } from './ui/hints.js';
import { AudioEngine } from './audio/engine.js';
import { Input, touchControlsFor } from './input.js';
import { loadProfile, bankSeason } from './sim/profile.js';
import { newSeason, creditNight, buy, pickRelic, skipRelic, pickCharter, readAlmanac, scoreOf, goEndless, dailyFor, cleanSeason } from './sim/season.js';
import { makeBot, stepBot } from './sim/bots.js';
import { STATIONS, TICK } from './sim/night.js';
import { maxDist } from './sim/beam.js';
import { TITAN } from './sim/hostiles.js';
import { award, nightBadges, seasonBadges, submitScores } from './badges.js';

const q = new URLSearchParams(location.search);
if (q.has('poster')) {
  import('./poster.js').then((m) => m.runPoster(q.get('poster'))).catch((e) => console.error(e));
} else boot().catch((e) => console.error(e));

async function boot() {
  const canvas = document.getElementById('gl');
  const hudCanvas = document.getElementById('hud');
  const root = document.getElementById('ui');
  const audio = new AudioEngine();
  const test = q.has('test');
  const G = { phase: 'boot', season: null, profile: loadProfile(null), ledger: null, stats: null, profileDirty: 0, pointerPrev: 0, bot: null, lastStation: null, hints: null, closedReason: null, scanLabel: null, pausedByMenu: false };

  // Join first, so a reload lands back in its seat before the scene is built.
  const session = new Session({
    onFx: (fx, state) => playFx(fx, state),
    onToast: (text) => hud.toast(text),
    onSeason: () => {
      if (G.phase === 'day') showDay();
    },
    onClosed: (reason) => {
      G.closedReason = reason;
      G.phase = 'closed';
      screens.hideOverlays();
      controls.set(null);
      screens.closed(reason, () => rejoin());
    },
    onNight: (state) => onNightState(state),
    onLedger: (ledger) => onLedger(ledger),
    onRole: () => onRole(),
  });
  const joining = session.join();
  const view = new View(canvas);
  const hud = new Hud(hudCanvas);
  const screens = new Screens(root, {}, audio);
  const input = new Input(canvas);
  Object.assign(screens.a, {
    light: () => session.command({ k: 'light' }),
    buy: (id) => hostEdit((s) => buy(s, id)),
    pickRelic: (id) => hostEdit((s) => pickRelic(s, id)),
    skipRelic: () => hostEdit((s) => skipRelic(s)),
    pickCharter: (id) => hostEdit((s) => pickCharter(s, id)),
    readAlmanac: (type) => hostEdit((s) => readAlmanac(s, type, G.profile)),
    pickKeeper: (id) => freshSeason({ keeper: id }),
    pickSite: (id) => freshSeason({ site: id }),
    pickAsc: (a) => freshSeason({ asc: a }),
    daily: () => startDaily(),
    endless: () => hostEdit((s) => goEndless(s)),
    newSeason: () => freshSeason({}, true),
    cosmetic: (kind, id) => {
      G.profile.cosmetics[kind] = id;
      saveProfile();
    },
    invite: () => ui.showInvite(),
  });

  const me = await player.get();
  G.profile = loadProfile(await saves.get('profile'));
  let savedSeason = validSeason(await saves.get('season'));
  await joining;
  view.setSite((session.season || savedSeason || {}).site || G.profile.site);
  G.hints = new Hints(G.profile, controls.touch);

  // Sound starts on the first gesture inside the game.
  const wake = () => audio.start();
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
  window.addEventListener('resize', () => {
    view.gfx.resize();
    hud.resize();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      session.flushSeason();
      saveProfile(true);
    }
  });
  onPlatformEvent('pause', () => {
    if (session.room.players.size <= 1 && session.room.match.phase !== 'lobby' && session.isHost) {
      session.safe(() => session.room.pauseMatch(true));
      G.pausedByMenu = true;
    }
  });
  onPlatformEvent('resume', () => {
    if (G.pausedByMenu) {
      G.pausedByMenu = false;
      session.safe(() => session.room.pauseMatch(false));
    }
  });

  function validSeason(s) {
    return cleanSeason(s);
  }

  function saveProfile(force = false) {
    G.profileDirty = 1;
    if (force) {
      G.profileDirty = 0;
      saves.set('profile', G.profile);
    }
  }

  function hostEdit(fn) {
    if (!session.isHost || !G.season) return false;
    const ok = fn(G.season);
    if (ok !== false) {
      session.setSeason(G.season);
      saveProfile();
    }
    return ok;
  }

  function freshSeason(over = {}, fromOver = false) {
    if (!session.isHost) return;
    const prev = G.season;
    if (fromOver && prev && prev.daily && prev.stash) {
      G.season = prev.stash;
    } else {
      if (over.keeper) G.profile.keeper = over.keeper;
      if (over.site) G.profile.site = over.site;
      if (over.asc !== undefined) G.profile.asc = over.asc;
      G.season = newSeason({ keeper: G.profile.keeper, site: G.profile.site, asc: Math.min(G.profile.asc, G.profile.ascCleared), seed: (Math.random() * 1e9) >>> 0, owner: session.me?.id });
    }
    G.ledger = null;
    savedSeason = null;
    session.setSeason(G.season);
    view.setSite(G.season.site);
    saveProfile();
    showDay();
  }

  function startDaily() {
    if (!session.isHost) return;
    const today = new Date(now()).toISOString().slice(0, 10);
    const d = dailyFor(today);
    const daily = newSeason({ keeper: d.keeper, site: d.site, asc: 0, seed: d.seed, daily: d, owner: session.me?.id });
    daily.stash = G.season;
    G.season = daily;
    G.ledger = null;
    session.setSeason(daily, { save: false });
    view.setSite(daily.site);
    showDay();
  }

  // ---- Screens by phase.
  function dayCtx() {
    const s = G.season;
    const today = new Date(now()).toISOString().slice(0, 10);
    const seats = Math.max(0, 4 - session.room.players.size);
    return { season: s, profile: G.profile, isHost: session.isHost, ledger: G.ledger, firstDay: s.night === 1 && s.totals.nights === 0 && !s.over, best: G.profile.best.score, dailyDone: G.profile.daily.date === today && G.profile.daily.done, canInvite: onPlatform && seats > 0, seats };
  }

  function showDay() {
    G.season = session.season || G.season;
    if (!G.season) {
      if (session.isHost) {
        G.season = savedSeason || newSeason({ keeper: G.profile.keeper, site: G.profile.site, asc: Math.min(G.profile.asc, G.profile.ascCleared), seed: (Math.random() * 1e9) >>> 0, owner: session.me?.id });
        session.setSeason(G.season, { save: !savedSeason });
      } else {
        screens.waiting('The keeper is coming');
        return;
      }
    }
    view.setSite(G.season.site);
    G.phase = 'day';
    input.locked = true;
    controls.set(null);
    screens.hideOverlays();
    session.setPresence({ ph: 'day' });
    if (!G.ledger && G.season.ledger && G.season.over) G.ledger = G.season.ledger;
    if (G.season.over) screens.tab = 'ledger';
    screens.day(dayCtx());
    session.safe(() => session.room.hideLobby?.(false));
  }

  function showTitle() {
    G.phase = 'title';
    input.locked = true;
    controls.set(null);
    session.setPresence({ ph: 'title' });
    session.safe(() => session.room.hideLobby?.(true));
    const hasSeason = Boolean(session.season || savedSeason);
    screens.title(hasSeason, () => {
      audio.start();
      if (session.isHost && !session.season && savedSeason) {
        screens.continueCard(savedSeason, {
          onContinue: () => {
            G.season = savedSeason;
            session.setSeason(G.season, { save: false });
            showDay();
          },
          onNew: () => freshSeason({}),
        });
      } else showDay();
    });
  }

  function onNightState(state) {
    if (!state) {
      if (G.phase !== 'closed') showDay();
      return;
    }
    if (G.phase === 'night' || G.phase === 'dusk' || G.phase === 'over') return;
    enterNight(state);
  }

  function enterNight(state) {
    G.phase = state.phase === 'over' ? 'over' : state.phase === 'dusk' ? 'dusk' : 'night';
    G.stats = null;
    G.ledger = null;
    screens.hideOverlays();
    view.setSite(state.site);
    input.locked = false;
    G.lastStation = null;
    session.safe(() => session.room.hideLobby?.(false));
    if (G.phase === 'dusk') screens.dusk(state, session.isHost);
    else screens.clearScreen();
    if (session.role === 'watch') screens.watching('Watching until dawn');
    if (test && session.isHost) {
      G.bot = makeBot(me.id, q.get('bot') || 'expert');
      session.speed = Math.max(1, Math.min(10, Number(q.get('speed') || 6)));
    }
  }

  function onLedger(ledger) {
    if (G.phase === 'over' && G.ledger && G.ledger.night === ledger.night && G.ledger.entry === ledger.entry) return;
    G.ledger = ledger;
    // Each night is banked once per keeper, even when a reload or a new host shows its ledger again.
    const fresh = !ledger.mid || G.profile.credited !== ledger.mid;
    if (fresh) {
      G.profile.credited = ledger.mid || '';
      creditNight(G.profile, ledger);
      if (session.state) {
        G.stats = session.state.stats;
        G.profile.strikes += session.state.stats.strikes || 0;
      }
      nightBadges(ledger, G.stats, G.profile);
      const season = session.season || G.season;
      if (season && season.daily && season.over === 'done') {
        const today = new Date(now()).toISOString().slice(0, 10);
        const score = ledger.saved * 100 + ledger.coins + ledger.integ;
        G.profile.daily = { date: today, score, done: true, best: Math.max(G.profile.daily.date === today ? G.profile.daily.best : 0, score) };
      } else if (season && season.over) {
        const score = scoreOf(season);
        const unlocked = bankSeason(G.profile, season, score);
        for (const id of unlocked) hud.toast(`Unlocked ${id.replace('-', ' ')}`, 'good');
        seasonBadges(season);
        submitScores(G.profile, season, score);
      }
      saveProfile(true);
    }
    screens.tab = 'ledger';
    G.phase = 'over';
    input.locked = true;
    controls.set(null);
    screens.hideOverlays();
    screens.nightOver(ledger, session.isHost, () => session.morning(), againFor(), view.sunScreen());
  }

  /** On a lost season's last page, the host can start the next season at once (same keeper, same rock). */
  function againFor() {
    const season = session.season || G.season;
    if (!season || season.over !== 'lost' || season.daily) return null;
    return () => {
      freshSeason({}, true);
      session.morning();
    };
  }

  /** The host moved: redraw the screen that has host-only buttons (Start-of-night, Morning, the shop). */
  function onRole() {
    if (G.phase === 'day') showDay();
    else if (G.phase === 'over' && G.ledger) screens.nightOver(G.ledger, session.isHost, () => session.morning(), againFor(), view.sunScreen());
    else if (G.phase === 'dusk' && session.state) screens.dusk(session.state, session.isHost);
  }

  function rejoin() {
    screens.clearScreen();
    G.phase = 'boot';
    session.join().then(() => {
      if (session.room.match.phase !== 'lobby' && session.state) enterNight(session.state);
      else showTitle();
    }).catch((e) => console.error(e));
  }

  // ---- Effects: sound, toasts, the view's kicks.
  function playFx(fx, state) {
    audio.fx(fx, state);
    switch (fx.k) {
      case 'saved': hud.toast(`${fx.name} home +${fx.coins}`, 'good'); break;
      case 'wreck': hud.toast(fx.why === 'foundered' ? `${fx.name} foundered` : `${fx.name} wrecked`, 'bad'); break;
      case 'guided': hud.pop(fx.id); break;
      case 'distress': hud.toast(`${fx.name}: engine out`, 'bad'); break;
      case 'engine': hud.toast('Under way', 'good'); break;
      case 'titan-blast': hud.toast(`Horn ${Math.min(TITAN.blasts, fx.n || 0)}/${TITAN.blasts}`, 'good'); break;
      case 'lure-hit': hud.toast('Lure burning', 'good'); break;
      case 'hail': hud.toast(`${fx.name} hailing`); break;
      case 'crack': hud.toast('Lens cracked', 'bad'); break;
      case 'door': hud.toast(`${fx.n} at the door`, 'bad'); break;
      case 'arrive': if (fx.type === 'kraken') hud.toast('Kraken', 'bad'); else if (fx.type === 'titan') hud.toast('It is here', 'bad'); else if (fx.type === 'siren') hud.toast('Siren', 'bad'); break;
      case 'bark': hud.toast('The dog barks'); break;
      case 'stun': if (fx.id === me.id) hud.toast('Struck', 'bad'); break;
      case 'oilout': hud.toast('Oil out', 'bad'); break;
      case 'powerout': hud.toast('Power out', 'bad'); break;
      case 'mimic-revealed': hud.toast('False lights', 'good'); G.profile.mimics++; saveProfile(); break;
      case 'siren-silenced': hud.toast('Silenced', 'good'); G.profile.sirens++; saveProfile(); break;
      case 'kraken-retreat': hud.toast('It let go', 'good'); break;
      case 'titan-phase': hud.toast(fx.phase === 2 ? 'Its arms' : 'The maw', 'bad'); break;
      case 'titan-down': hud.toast('It went under', 'good'); break;
      case 'scatter': if (fx.n > 1) hud.toast('Scattered', 'good'); break;
      case 'purr': if (fx.id === me.id) { G.profile.pets++; if (G.profile.pets >= 10) award('good-cat'); saveProfile(); } break;
      case 'nightfall': if (G.phase === 'dusk') { screens.clearScreen(); G.phase = 'night'; } break;
      case 'dawn': hud.toast('Dawn', 'good'); break;
      default: break;
    }
  }

  // ---- The frame.
  let last = performance.now();
  let beamAcc = 0;
  let aimAcc = 0;
  const camInput = { yaw: 0, pitch: -0.06 };
  function frame(nowMs) {
    const dt = Math.max(0, Math.min(0.1, (nowMs - last) / 1000));
    last = nowMs;
    try {
      tick(dt);
    } catch (e) {
      console.error(e);
    }
    if (!document.hidden && dt < 0.15 && dt > 0) view.gfx.govern(dt * 1000);
    requestAnimationFrame(frame);
  }

  function tick(dt) {
    if (G.profileDirty) {
      G.profileDirty = 0;
      saves.set('profile', G.profile);
    }
    const stepFx = session.update(dt);
    const state = session.state;
    const inNight = state && (G.phase === 'dusk' || G.phase === 'night' || G.phase === 'over');
    if (!inNight) {
      if (!document.hidden) view.updateTitle(dt, { reducedMotion: settings.reducedMotion, day: G.phase === 'day' || G.phase === 'over' });
      hud.clear();
      audio.idle(dt);
      if (session.awaitingSnapshot && screens.name !== 'waiting' && session.room.match.phase !== 'lobby') screens.waiting('Joining the night');
      return;
    }
    if (G.phase === 'dusk' && state.phase === 'night') {
      G.phase = 'night';
      screens.clearScreen();
    }
    if (G.phase === 'dusk') screens.updateDusk(state);
    const crew = state.crew[me.id] || null;
    const watching = session.role === 'watch' || !crew;
    if (G.bot && session.isHost && state.phase !== 'over') {
      stepBot(state, G.bot);
      for (const f of state.fx) stepFx.push(f);
      state.fx.length = 0;
    }
    for (const f of stepFx) playFx(f, state);
    // Input.
    const station = crew ? (crew.move ? null : crew.st) : null;
    const inp = input.poll(dt, station, {});
    camInput.yaw = inp.yaw;
    camInput.pitch = inp.pitch;
    const cards = Boolean(screens.radio || screens.chart);
    if (inp.escape) {
      if (screens.radio) screens.closeRadio();
      else if (screens.chart) screens.closeChart();
    }
    if (!watching && state.phase !== 'over') handlePlay(state, crew, inp, dt, cards);
    if (screens.radio) {
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) if (input.keys.has(code)) {
        input.keys.delete(code);
        screens.radio.pick(Number(code.slice(5)) - 1);
      }
    }
    if (screens.chart) screens.updateChart(state);
    // Station tabs and touch controls.
    const shown = crew ? (crew.move ? crew.to : crew.st) : null;
    if (!watching && state.phase !== 'over') {
      if (shown !== G.lastStation) {
        G.lastStation = shown;
        screens.stations(crew.st, (st) => session.command({ k: 'station', st }), crew.move ? crew.to : null);
        controls.set(touchControlsFor(shown));
        session.setPresence({ ph: 'play', st: shown });
      }
      if (controls.touch && shown === 'lantern' && state.beam.mode === 'spot') screens.focus(input.focus, (r) => input.setFocus(r));
      else screens.hideFocus();
    } else {
      screens.hideStations();
      screens.hideFocus();
    }
    // Hints.
    if (!watching && crew) {
      const hint = G.hints.update(state, crew, dt);
      if (hint) screens.showHint(hint, () => {
        G.hints.skip();
        saveProfile(true);
        screens.hideHint();
      });
      else screens.hideHint();
    }
    // Draw.
    if (!document.hidden) {
      view.update(state, crew, camInput, dt, { fx: stepFx, reducedMotion: settings.reducedMotion, cosmetics: G.profile.cosmetics, bright: Boolean(state.mods.brightShips) });
      const aim = !watching && crew && !crew.move && (crew.st === 'lantern' && state.beam.mode === 'spot' ? { x: Math.sin(state.beam.az) * state.beam.dist, z: Math.cos(state.beam.az) * state.beam.dist } : crew.st === 'gallery' ? crew.aim : null);
      hud.draw(state, crew, view, dt, { aim, coins: G.season ? G.season.coins : 0, scanLabel: G.scanLabel, bigChart: Boolean(screens.chart) });
    }
    audio.update(state, crew, dt);
  }

  function handlePlay(state, crew, inp, dt, cards) {
    const st = crew.st;
    for (const cmd of inp.commands) {
      if (cmd.k === 'station') {
        const target = cmd.st === 'next' ? STATIONS[(STATIONS.indexOf(crew.move ? crew.to : crew.st) + 1) % STATIONS.length] : cmd.st;
        session.command({ k: 'station', st: target });
      } else if (cards) continue;
      else if (cmd.aim) {
        const a = view.aimAt(inp.pointer.x, inp.pointer.y, 400);
        session.command({ k: cmd.k, x: a.x, z: a.z });
      } else session.command(cmd);
    }
    if (inp.lensNext && !cards) session.command({ k: 'lens' });
    if (inp.pet) session.command({ k: 'pet' });
    if (inp.radio) {
      if (screens.radio) screens.closeRadio();
      else if (st === 'watch' && !crew.move) screens.radioCard(state, (ship, order) => {
        session.command({ k: 'radio', ship, order });
        screens.closeRadio();
      }, () => screens.closeRadio());
    }
    if (inp.chart) {
      if (screens.chart) screens.closeChart();
      else screens.bigChart(state, () => screens.closeChart());
    }
    if (cards || crew.move || crew.stun > 0) return;
    const p = inp.pointer;
    if (st === 'lantern') {
      // The pointer aims the pool: a mouse by hovering, a finger by dragging. Sent at most 15 times a second.
      beamAcc += dt;
      const moved = p.moved !== G.pointerPrev;
      G.pointerPrev = p.moved;
      const wantAim = state.beam.mode === 'spot' && (inp.touch ? p.down : true);
      const focusOff = Math.abs(input.focus - state.beam.r) > 0.5;
      if (beamAcc >= 1 / 15 && ((wantAim && (moved || inp.focusChanged)) || (state.beam.mode === 'spot' && focusOff))) {
        beamAcc = 0;
        if (wantAim && moved) {
          const a = view.aimAt(p.x, p.y, maxDist(state.mods));
          session.command({ k: 'beam', az: a.az, dist: a.dist, r: input.focus });
        } else session.command({ k: 'beam', az: state.beam.az, dist: state.beam.dist, r: input.focus });
      }
      if (inp.tapped && inp.touch && state.beam.mode === 'sweep') {
        // A tap on the water in Sweep switches to Spot there.
        session.command({ k: 'mode', mode: 'spot' });
        const a = view.aimAt(p.x, p.y, maxDist(state.mods));
        session.command({ k: 'beam', az: a.az, dist: a.dist, r: input.focus });
      }
    } else if (st === 'gallery') {
      aimAcc += dt;
      if (aimAcc >= 0.1) {
        aimAcc = 0;
        const a = view.aimAt(p.x, p.y, 400);
        session.command({ k: 'aim', x: a.x, z: a.z });
        const scan = state.crew[me.id]?.holds?.scan > state.t;
        G.scanLabel = scan ? scanLabel(state, a) : null;
      }
    } else G.scanLabel = null;
  }

  function scanLabel(state, a) {
    let best = null;
    let bd = 30;
    const near = [];
    for (const ship of state.ships) if (ship.st !== 'saved' && ship.st !== 'lost') near.push({ kind: 'ship', ship });
    for (const h of state.hostiles) if (h.st !== 'gone' && h.type !== 'moths') near.push({ kind: 'h', h });
    for (const n of near) {
      const pos = n.kind === 'ship' ? view.entities.ships.get(n.ship.id)?.group.position ?? null : { x: n.h.x, z: n.h.z };
      if (!pos) continue;
      const d = Math.hypot(pos.x - a.x, pos.z - a.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (!best) return 'NOTHING THERE';
    if (best.kind === 'ship') return `${best.ship.name.toUpperCase()} · ${best.ship.type.toUpperCase()} · ${Math.round(Math.hypot(a.x, a.z))} M`;
    const h = best.h;
    if (h.type === 'mimic') return h.labelled ? 'FALSE LIGHTS' : 'LIGHTS · UNHAILED';
    return `${h.type.toUpperCase()} · ${Math.round(Math.hypot(a.x, a.z))} M`;
  }

  // ---- Go.
  if (session.room.match.phase !== 'lobby' && session.state) enterNight(session.state);
  else if (session.room.match.phase !== 'lobby') screens.waiting('Joining the night');
  else showTitle();
  if (test) autopilot();
  requestAnimationFrame(frame);
  window.__wl = { session, G, view, screens, hud };

  /** Drives the game through its public paths for the smoke test. */
  function autopilot() {
    let step = 0;
    audio.start();
    const timer = setInterval(() => {
      try {
        step++;
        if (G.phase === 'title') document.querySelector('#ui .big')?.click();
        else if (screens.name === 'continue') document.querySelector('#ui .btn.danger')?.click();
        else if (G.phase === 'day' && session.isHost) {
          if (G.season && G.season.over) {
            screens.a.newSeason();
            return;
          }
          if (G.season && G.season.coins >= 40 && step % 3 === 0) {
            screens.a.buy('tank');
            screens.a.buy('lens');
          }
          if (G.season && G.season.relicOffer.length) screens.a.pickRelic(G.season.relicOffer[0]);
          if (step % 2 === 0) session.startNight();
        } else if (G.phase === 'dusk' && session.isHost && session.state && session.state.duskLeft > 1) session.command({ k: 'light' });
        else if (G.phase === 'over' && session.isHost) session.morning();
      } catch (e) {
        console.error(e);
      }
    }, 1500);
    window.__autopilot = timer;
  }
}

export { ow, now, onPlatform, TICK };
