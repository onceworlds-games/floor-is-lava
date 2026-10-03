// Every screen the game draws itself: title, the day (ledger, shop, relics, charter, almanac,
// forecast), dusk, the station tabs, the radio card, the big chart, results and the closed-room card.
// Everything is built with createElement and textContent: nothing from the network reaches innerHTML.
import { SHOP, shopPrice } from '../sim/data/shop.js';
import { RELIC_BY_ID } from '../sim/data/relics.js';
import { CHARTER_BY_ID } from '../sim/data/charters.js';
import { KEEPERS, KEEPER_ORDER } from '../sim/data/keepers.js';
import { SITES, SITE_ORDER } from '../sim/data/sites.js';
import { HOSTILES, HOSTILE_ORDER, ALMANAC } from '../sim/data/hostiles.js';
import { MUTATOR_BY_ID } from '../sim/data/daily.js';
import { unlockedKeepers, unlockedSites, lockLabel } from '../sim/profile.js';
import { forecast, scoreOf, LAST_NIGHT } from '../sim/season.js';
import { drawChart } from './chart.js';
import { ORDERS } from '../sim/data/ships.js';
import { shipPos, reefAt } from '../sim/route.js';
import { STATIONS } from '../sim/night.js';
import { settings } from '../platform.js';

export function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== '') e.textContent = text;
  return e;
}

/** The keeper's portrait pasted in the ledger: an ink silhouette in an oval, wearing the chosen hat. */
function keeperFace(hat) {
  const c = el('canvas');
  c.width = c.height = 96;
  c.className = 'portrait';
  const x = c.getContext('2d');
  x.fillStyle = '#e4d6b4';
  x.beginPath();
  x.ellipse(48, 48, 40, 46, 0, 0, Math.PI * 2);
  x.fill();
  x.lineWidth = 4;
  x.strokeStyle = '#2a1d10';
  x.stroke();
  x.save();
  x.beginPath();
  x.ellipse(48, 48, 38, 44, 0, 0, Math.PI * 2);
  x.clip();
  x.fillStyle = '#2a1d10';
  x.beginPath();
  x.arc(48, 40, 16, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(20, 96);
  x.quadraticCurveTo(24, 58, 48, 58);
  x.quadraticCurveTo(72, 58, 76, 96);
  x.closePath();
  x.fill();
  x.fillStyle = '#a3321f';
  if (hat === 'souwester') {
    x.beginPath();
    x.moveTo(24, 36);
    x.quadraticCurveTo(48, 10, 72, 36);
    x.lineTo(78, 40);
    x.lineTo(18, 40);
    x.closePath();
    x.fill();
  } else if (hat === 'cap') {
    x.fillRect(32, 22, 32, 10);
    x.fillRect(32, 30, 44, 4);
  } else if (hat === 'crown') {
    x.beginPath();
    for (let i = 0; i < 5; i++) {
      x.lineTo(30 + i * 9, i % 2 ? 30 : 16);
    }
    x.lineTo(66, 30);
    x.lineTo(30, 30);
    x.closePath();
    x.fill();
  }
  x.restore();
  return c;
}

function button(label, cls, onClick, key = '') {
  const b = el('button', `btn ${cls}`.trim(), label);
  if (key) {
    const k = el('span', 'key', key);
    b.append(k);
  }
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick?.(e);
  });
  return b;
}

export class Screens {
  constructor(root, actions, audio) {
    this.root = root;
    this.a = actions;
    this.audio = audio;
    this.current = null;
    this.name = '';
    this.hint = null;
    this.stationBar = null;
    this.radio = null;
    this.chart = null;
    this.focusSlider = null;
    this.watchLabel = null;
    this.tab = 'forecast';
    this.primary = null; // the button Enter presses on this screen
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      const b = this.primary;
      if (!b || !b.isConnected || b.disabled || document.activeElement === b) return;
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      e.preventDefault();
      b.click();
    });
  }

  show(name, node) {
    this.clearScreen();
    this.primary = null;
    this.name = name;
    this.current = node;
    if (node) this.root.append(node);
  }

  clearScreen() {
    if (this.current) this.current.remove();
    this.current = null;
    this.name = '';
  }

  click() {
    this.audio?.ui();
  }

  // ---- Title and the continue card
  // The title is the storm itself (the view draws it behind): the name above, one button below.
  title(hasSeason, onPlay) {
    const s = el('div', 'screen title');
    s.append(el('h1', 'wordmark', 'Watchlight'));
    const b = el('button', 'big play', 'Play');
    b.addEventListener('click', () => {
      this.click();
      onPlay();
    });
    s.append(b);
    this.show('title', s);
    try {
      b.focus({ preventScroll: true });
    } catch {}
  }

  continueCard(season, { onContinue, onNew }) {
    const s = el('div', 'screen dark');
    const book = el('div', 'book');
    book.style.width = 'min(94vw, 460px)';
    const head = el('div', 'head');
    head.append(el('h2', '', `Night ${season.night}`));
    head.append(el('span', 'coins', `${season.coins} coin`));
    book.append(head);
    book.append(el('div', 'entry', season.log[season.log.length - 1] || 'The ledger is new.'));
    book.append(el('div', 'line', 'A night restarts from its dusk.'));
    const row = el('div', 'row');
    row.append(button('Continue', 'on', () => (this.click(), onContinue())));
    row.append(button('New season', 'danger', () => (this.click(), onNew())));
    book.append(row);
    s.append(book);
    this.show('continue', s);
  }

  // ---- The day: one book with tabs. `ctx` = { season, profile, isHost, players, amHost, ledger, firstDay }
  day(ctx) {
    const s = el('div', 'screen dark lobbyroom');
    const book = el('div', 'book');
    const head = el('div', 'head');
    const over = ctx.season.over;
    const title = over === 'won' ? 'Season kept' : over === 'lost' ? 'Season lost' : over === 'done' ? 'Daily watch' : ctx.season.night > LAST_NIGHT ? `Night ${ctx.season.night} · Endless` : `Day ${ctx.season.night}`;
    const left = el('div');
    left.style.cssText = 'display:flex;align-items:center;gap:12px';
    left.append(keeperFace(ctx.profile.cosmetics.hat), el('h2', '', title));
    head.append(left);
    head.append(el('span', 'coins purse', `${ctx.season.coins}`));
    book.append(head);
    const tabs = el('div', 'tabs');
    const names = [];
    if (ctx.ledger) names.push(['ledger', 'Ledger']);
    if (!over) {
      names.push(['forecast', 'Forecast']);
      if (!ctx.season.daily) {
        names.push(['shop', 'Shop']);
        if (ctx.season.relicOffer.length) names.push(['relic', 'Relic']);
        names.push(['charter', 'Charter']);
      }
      names.push(['almanac', 'Almanac']);
    }
    names.push(['keeper', 'Keeper']);
    if (!names.some(([id]) => id === this.tab)) this.tab = names[0][0];
    const body = el('div');
    const render = () => {
      body.replaceChildren();
      for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === this.tab);
      const fn = { ledger: this.ledgerTab, forecast: this.forecastTab, shop: this.shopTab, relic: this.relicTab, charter: this.charterTab, almanac: this.almanacTab, keeper: this.keeperTab }[this.tab];
      body.append(fn.call(this, ctx, render));
    };
    for (const [id, label] of names) {
      const b = button(label, id === this.tab ? 'on' : '', () => {
        this.click();
        this.tab = id;
        render();
      });
      b.dataset.tab = id;
      if (id === 'relic') b.classList.add('on');
      tabs.append(b);
    }
    book.append(tabs, body);
    render();
    s.append(book);
    this.show('day', s);
  }

  ledgerTab(ctx) {
    const L = ctx.ledger;
    const box = el('div');
    box.append(el('div', 'entry', L.entry));
    const stat = (k, v, cls = '') => {
      const row = el('div', `stat ${cls}`.trim());
      row.append(el('span', '', k));
      row.append(el('b', '', String(v)));
      box.append(row);
    };
    stat('Ships home', L.saved, 'good');
    stat('On the reef', L.wrecked, L.wrecked ? 'bad' : '');
    stat('Coins from the sea', L.coins);
    for (const [name, n] of L.bonuses) stat(name, `+${n}`, 'good');
    stat('Earned', L.earned, 'gold');
    stat('Repute', `${L.rep} (${L.repDelta >= 0 ? '+' : ''}${L.repDelta})`, L.repDelta < 0 ? 'bad' : 'good');
    stat('Oil left', `${L.oilLeft}%`);
    stat('Tower', `${L.integ}%`);
    if (L.cracks) stat('Lens cracks', L.cracks, 'bad');
    if (L.titan) stat('The Titan', 'Under', 'good');
    if (ctx.season.over) {
      box.append(el('h3', '', `Score ${scoreOf(ctx.season)}`));
      if (ctx.best) box.append(el('div', 'line', `Best ${ctx.best}`));
      const row = el('div', 'row');
      if (ctx.season.over === 'won' && ctx.isHost) row.append(button('Keep it burning', 'on', () => (this.click(), this.a.endless())));
      if (ctx.isHost) row.append(button('New season', '', () => (this.click(), this.a.newSeason())));
      else row.append(el('div', 'line', 'The keeper decides.'));
      box.append(row);
    }
    return box;
  }

  forecastTab(ctx, render) {
    const season = ctx.season;
    const box = el('div');
    const wx = forecast(season);
    box.append(el('h3', '', `Night ${season.night} · ${wx.name}`));
    box.append(el('div', 'entry', wx.tell));
    if (season.charter) {
      const ch = CHARTER_BY_ID[season.charter];
      box.append(el('div', 'line', `Charter: ${ch.name}. ${ch.gives}. ${ch.costs}.`));
    }
    if (season.daily && season.mutators) box.append(el('div', 'line', `Daily: ${season.mutators.map((m) => MUTATOR_BY_ID[m]?.name).filter(Boolean).join(', ')}`));
    if (ctx.firstDay && ctx.isHost && !season.daily) {
      box.append(el('h3', '', 'Keeper'));
      const kg = el('div', 'grid');
      const ks = unlockedKeepers(ctx.profile);
      for (const id of KEEPER_ORDER) {
        const k = KEEPERS[id];
        const locked = !ks.includes(id);
        const card = el('div', `card pick ${season.keeper === id ? 'on' : ''} ${locked ? 'locked' : ''}`);
        card.append(el('div', 'name', k.name));
        card.append(el('div', 'line', locked ? lockLabel(k.unlock) : k.blurb));
        if (!locked) card.addEventListener('click', () => (this.click(), this.a.pickKeeper(id), render()));
        kg.append(card);
      }
      box.append(kg);
      box.append(el('h3', '', 'Site'));
      const sg = el('div', 'grid');
      const ss = unlockedSites(ctx.profile);
      for (const id of SITE_ORDER) {
        const st = SITES[id];
        const locked = !ss.includes(id);
        const card = el('div', `card pick ${season.site === id ? 'on' : ''} ${locked ? 'locked' : ''}`);
        card.append(el('div', 'name', st.name));
        card.append(el('div', 'line', locked ? lockLabel(st.unlock) : st.blurb));
        if (!locked) card.addEventListener('click', () => (this.click(), this.a.pickSite(id), render()));
        sg.append(card);
      }
      box.append(sg);
      if (ctx.profile.ascCleared > 0) {
        box.append(el('h3', '', 'Storm'));
        const row = el('div', 'row');
        row.style.justifyContent = 'flex-start';
        for (let a = 0; a <= ctx.profile.ascCleared; a++) row.append(button(a === 0 ? 'Calm' : `Storm ${a}`, season.asc === a ? 'on' : '', () => (this.click(), this.a.pickAsc(a), render())));
        box.append(row);
      }
      const row = el('div', 'row');
      row.style.justifyContent = 'flex-start';
      row.append(button(ctx.dailyDone ? `Daily watch · best ${ctx.profile.daily.best}` : 'Daily watch', '', () => (this.click(), this.a.daily())));
      box.append(row);
    }
    if (ctx.canInvite) {
      const row = el('div', 'row');
      row.style.justifyContent = 'flex-start';
      row.append(button(`Invite · ${ctx.seats} seats free`, 'teal', () => (this.click(), this.a.invite())));
      box.append(row);
    }
    if (season.daily) box.append(el('div', 'line', `${KEEPERS[season.keeper].name} at ${SITES[season.site].name}. Best ${ctx.profile.daily.best}.`));
    if (!ctx.isHost) box.append(el('div', 'line', 'Ready up. The keeper lights the lamp.'));
    return box;
  }

  shopTab(ctx, render) {
    const season = ctx.season;
    const grid = el('div', 'grid');
    for (const item of SHOP) {
      const owned = season.upgrades[item.id] || 0;
      const maxed = item.consumable ? owned >= 3 : owned >= item.tiers;
      const price = shopPrice(item, owned);
      const can = ctx.isHost && !maxed && season.coins >= price;
      const card = el('div', `card ${can ? 'pick' : ''} ${owned ? 'on' : ''}`);
      card.append(el('div', 'name', `${item.name}${owned && !item.consumable && item.tiers > 1 ? ` ${'I'.repeat(owned)}` : item.consumable && owned ? ` ×${owned}` : ''}`));
      card.append(el('div', 'line', item.line));
      card.append(el('div', `price ${can ? '' : 'no'}`, maxed ? 'Owned' : `${price} coin`));
      if (can) card.addEventListener('click', () => {
        if (this.a.buy(item.id)) {
          this.click();
          render();
          this.current.querySelector('.coins').textContent = `${season.coins}`;
        }
      });
      grid.append(card);
    }
    return grid;
  }

  relicTab(ctx, render) {
    const season = ctx.season;
    const box = el('div');
    box.append(el('div', 'line', 'Take one, or none.'));
    const grid = el('div', 'grid');
    for (const id of season.relicOffer) {
      const r = RELIC_BY_ID[id];
      if (!r) continue;
      const card = el('div', `card ${ctx.isHost ? 'pick' : ''}`);
      card.append(el('div', 'name', r.name));
      card.append(el('div', 'give', r.gives));
      card.append(el('div', 'cost', r.costs));
      if (ctx.isHost) card.addEventListener('click', () => (this.click(), this.a.pickRelic(id), this.tab = 'charter', this.day(ctx)));
      grid.append(card);
    }
    box.append(grid);
    if (ctx.isHost) {
      const row = el('div', 'row');
      row.append(button('None', '', () => (this.click(), this.a.skipRelic(), this.tab = 'charter', this.day(ctx))));
      box.append(row);
    }
    if (season.relics.length) box.append(el('div', 'line', `Carried: ${season.relics.map((id) => RELIC_BY_ID[id]?.name).filter(Boolean).join(', ')}`));
    return box;
  }

  charterTab(ctx, render) {
    const season = ctx.season;
    const box = el('div');
    box.append(el('div', 'line', 'A contract for the night. Plain watch is always allowed.'));
    const grid = el('div', 'grid');
    const plain = el('div', `card ${ctx.isHost ? 'pick' : ''} ${season.charter === null ? 'on' : ''}`);
    plain.append(el('div', 'name', 'Plain watch'));
    plain.append(el('div', 'line', 'No terms.'));
    if (ctx.isHost) plain.addEventListener('click', () => (this.click(), this.a.pickCharter(null), render()));
    grid.append(plain);
    for (const id of season.charterOffer) {
      const ch = CHARTER_BY_ID[id];
      if (!ch) continue;
      const card = el('div', `card ${ctx.isHost ? 'pick' : ''} ${season.charter === id ? 'on' : ''}`);
      card.append(el('div', 'name', ch.name));
      card.append(el('div', 'give', ch.gives));
      card.append(el('div', 'cost', ch.costs));
      if (ctx.isHost) card.addEventListener('click', () => (this.click(), this.a.pickCharter(id), render()));
      grid.append(card);
    }
    box.append(grid);
    return box;
  }

  almanacTab(ctx, render) {
    const box = el('div');
    box.append(el('div', 'line', 'Read one page a day: +10% against it tonight.'));
    const grid = el('div', 'grid');
    for (const type of HOSTILE_ORDER) {
      const page = ctx.profile.almanac[type];
      const seen = page && page.seen > 0;
      const card = el('div', `card ${seen && ctx.isHost && !ctx.season.over ? 'pick' : ''} ${ctx.season.almanacRead.includes(type) ? 'on' : ''} ${seen ? '' : 'locked'}`);
      card.append(el('div', 'name', seen ? HOSTILES[type].name : '?'));
      if (seen) {
        card.append(el('div', 'give', ALMANAC[type].weakness));
        card.append(el('div', 'line', ALMANAC[type].tell));
        card.append(el('div', 'line', ALMANAC[type].tip));
        if (ctx.isHost && !ctx.season.over) card.addEventListener('click', () => (this.click(), this.a.readAlmanac(type), render()));
      } else card.append(el('div', 'line', 'Survive it to write the page.'));
      grid.append(card);
    }
    box.append(grid);
    return box;
  }

  keeperTab(ctx, render) {
    const p = ctx.profile;
    const box = el('div');
    const stat = (k, v) => {
      const row = el('div', 'stat');
      row.append(el('span', '', k));
      row.append(el('b', '', String(v)));
      box.append(row);
    };
    stat('Best score', p.best.score);
    stat('Seasons kept', p.seasons);
    stat('Ships saved', p.shipsSaved);
    stat('Nights kept', p.nightsTotal);
    stat('Storms cleared', p.ascCleared);
    if (p.endlessBest) stat('Endless nights', p.endlessBest);
    stat('Cat pets', p.pets);
    box.append(el('h3', '', 'Lamp housing'));
    const housings = [['brass', 'Brass', 0], ['iron', 'Iron', 1], ['teal', 'Teal', 2], ['copper', 'Copper', 3]];
    const row = el('div', 'row');
    row.style.justifyContent = 'flex-start';
    for (const [id, name, need] of housings) {
      const ok = p.seasons >= need;
      row.append(button(ok ? name : `${name} · ${need} seasons`, p.cosmetics.housing === id ? 'on' : '', () => ok && (this.click(), this.a.cosmetic('housing', id), render())));
    }
    box.append(row);
    box.append(el('h3', '', "Cat's collar"));
    const collars = [['red', 'Red', 0], ['teal', 'Teal', 10], ['amber', 'Amber', 25], ['white', 'White', 50]];
    const row2 = el('div', 'row');
    row2.style.justifyContent = 'flex-start';
    for (const [id, name, need] of collars) {
      const ok = p.pets >= need;
      row2.append(button(ok ? name : `${name} · ${need} pets`, p.cosmetics.collar === id ? 'on' : '', () => ok && (this.click(), this.a.cosmetic('collar', id), render())));
    }
    box.append(row2);
    box.append(el('h3', '', 'Hat'));
    const hats = [['none', 'Bare', 0], ['souwester', "Sou'wester", 5], ['cap', 'Cap', 20], ['crown', 'Kelp crown', 1]];
    const row3 = el('div', 'row');
    row3.style.justifyContent = 'flex-start';
    for (const [id, name, need] of hats) {
      const ok = id === 'crown' ? p.titans >= 1 : p.nightsTotal >= need;
      row3.append(button(ok ? name : id === 'crown' ? `${name} · beat the Titan` : `${name} · ${need} nights`, p.cosmetics.hat === id ? 'on' : '', () => ok && (this.click(), this.a.cosmetic('hat', id), render())));
    }
    box.append(row3);
    return box;
  }

  // ---- Dusk: the forecast over the tower, and the host's "Light the lamp".
  dusk(state, isHost, players) {
    const s = el('div', 'screen');
    s.style.justifyContent = 'flex-end';
    s.style.paddingBottom = 'calc(14% + var(--sab))';
    s.style.pointerEvents = 'none';
    const box = el('div');
    box.style.pointerEvents = 'auto';
    box.append(el('h2', '', `Night ${state.night} · ${state.weather.name}`));
    box.append(el('div', 'sub', state.weather.tell));
    if (isHost) {
      const b = el('button', 'big', 'Light the lamp');
      b.addEventListener('click', () => (this.click(), this.a.light()));
      box.append(b);
    } else box.append(el('div', 'line', 'The keeper lights the lamp.'));
    box.append(el('div', 'line', `Dusk ${Math.ceil(state.duskLeft)}`));
    this.duskLine = box.lastChild;
    s.append(box);
    this.show('dusk', s);
  }

  updateDusk(state) {
    if (this.duskLine) this.duskLine.textContent = `Dusk ${Math.ceil(state.duskLeft)}`;
  }

  // ---- Night overlays.
  stations(current, onPick, moving) {
    if (!this.stationBar) {
      this.stationBar = el('div', 'stations');
      this.root.append(this.stationBar);
    }
    this.stationBar.replaceChildren();
    const labels = { lantern: 'Lamp', gallery: 'Gallery', watch: 'Watch', cellar: 'Cellar' };
    for (const st of STATIONS) {
      const b = button(labels[st], st === current ? 'on' : '', () => (this.click(), onPick(st)));
      if (moving === st) b.classList.add('on');
      this.stationBar.append(b);
    }
  }

  hideStations() {
    this.stationBar?.remove();
    this.stationBar = null;
  }

  showHint(text) {
    if (this.hint && this.hint.textContent === text) return;
    this.hint?.remove();
    this.hint = el('div', 'hint', text);
    this.root.append(this.hint);
  }

  hideHint() {
    this.hint?.remove();
    this.hint = null;
  }

  watching(text) {
    if (!text) {
      this.watchLabel?.remove();
      this.watchLabel = null;
      return;
    }
    if (!this.watchLabel) {
      this.watchLabel = el('div', 'watch');
      this.root.append(this.watchLabel);
    }
    this.watchLabel.style.top = 'calc(60px + var(--sat))';
    this.watchLabel.textContent = text;
  }

  /** The radio: pick a ship that is calling (or any known ship), then an order. */
  radioCard(state, onOrder, onClose) {
    this.closeRadio();
    const card = el('div', 'radio');
    card.append(el('h3', '', 'Radio'));
    const ships = state.ships.filter((s) => (s.st === 'sail' || s.st === 'distress') && (s.seen || s.needs || state.mods.radar || state.mods.brightShips) && s.special !== 'chaser');
    ships.sort((a, b) => b.needs - a.needs || Math.abs(b.d) / reefAt(state.route, b.s, b.d) - Math.abs(a.d) / reefAt(state.route, a.s, a.d));
    const list = el('div', 'ships');
    let chosen = ships[0] || null;
    const orders = el('div', 'orders');
    const renderOrders = () => {
      orders.replaceChildren();
      if (!chosen) {
        orders.append(el('div', 'line', 'Nobody is calling.'));
        return;
      }
      for (const [i, o] of ORDERS.entries()) {
        const side = chosen.d > 0 ? 'port' : 'starboard';
        orders.append(button(o[0].toUpperCase() + o.slice(1), o === side && chosen.st !== 'distress' && Math.abs(chosen.d) > 4 ? 'on' : '', () => (this.click(), onOrder(chosen.id, o)), String(i + 1)));
      }
    };
    const renderList = () => {
      list.replaceChildren();
      for (const s of ships.slice(0, 4)) {
        const pos = shipPos(state.route, s.s, s.d);
        const b = button('', s === chosen ? 'on' : '', () => (this.click(), chosen = s, renderList(), renderOrders()));
        b.append(el('span', '', s.name));
        b.append(el('span', '', `${s.st === 'distress' ? `engine out · ${Math.max(0, Math.ceil(s.distressLeft || 0))} s${s.guided > 0 ? ' · lit' : ' · light it'}` : s.hidden ? 'in fog' : `${s.d > 0 ? 'starboard' : 'port'} of the line`} · ${Math.round(Math.hypot(pos.x, pos.z))} m`));
        list.append(b);
      }
    };
    renderList();
    renderOrders();
    card.append(list, orders);
    card.append(button('Close', 'close', () => (this.click(), onClose()), 'Esc'));
    this.radio = { card, chosen: () => chosen, pick: (i) => chosen && onOrder(chosen.id, ORDERS[i]) };
    this.root.append(card);
  }

  closeRadio() {
    this.radio?.card.remove();
    this.radio = null;
  }

  bigChart(state, onClose) {
    this.closeChart();
    const box = el('div', 'chartbox');
    const canvas = el('canvas');
    const size = Math.round(Math.min(window.innerWidth * 0.92, 560, window.innerHeight - 120) * settings.pixelRatio(2));
    canvas.width = size;
    canvas.height = size;
    box.append(canvas);
    box.append(button('Close', 'close', () => (this.click(), onClose()), 'Esc'));
    this.root.append(box);
    this.chart = { box, canvas, size };
    this.updateChart(state);
  }

  updateChart(state) {
    if (!this.chart) return;
    const ctx = this.chart.canvas.getContext('2d');
    drawChart(ctx, this.chart.size, state, { radar: state.mods.radar, labels: true, big: true });
  }

  closeChart() {
    this.chart?.box.remove();
    this.chart = null;
  }

  focus(value, onChange) {
    if (!this.focusSlider) {
      const wrap = el('div', 'focus');
      const input = el('input');
      input.type = 'range';
      input.min = '6';
      input.max = '40';
      input.step = '1';
      input.setAttribute('aria-label', 'Focus');
      input.addEventListener('input', () => onChange(46 - Number(input.value)));
      wrap.append(input);
      this.root.append(wrap);
      this.focusSlider = { wrap, input };
    }
    if (document.activeElement !== this.focusSlider.input) this.focusSlider.input.value = String(46 - value);
  }

  hideFocus() {
    this.focusSlider?.wrap.remove();
    this.focusSlider = null;
  }

  // ---- The end of a night, over the dawn.
  // The night's page, over the dawn: it settles low on the screen a moment after the bell, leaving the sunrise above.
  nightOver(ledger, isHost, onContinue) {
    const s = el('div', `screen nightover ${ledger.result === 'dawn' ? 'dawn' : 'lost'}`);
    const book = el('div', 'book');
    book.style.width = 'min(94vw, 520px)';
    const head = el('div', 'head');
    head.append(el('h2', '', ledger.result === 'dawn' ? 'Dawn' : ledger.result === 'disaster' ? 'The tower fell' : 'Dismissed'));
    head.append(el('span', 'coins', `+${ledger.earned}`));
    book.append(head);
    book.append(el('div', 'entry', ledger.entry));
    const stat = (k, v, cls = '') => {
      const row = el('div', `stat ${cls}`.trim());
      row.append(el('span', '', k));
      row.append(el('b', '', String(v)));
      book.append(row);
    };
    stat('Ships home', ledger.saved, 'good');
    stat('On the reef', ledger.wrecked, ledger.wrecked ? 'bad' : '');
    for (const [name, n] of ledger.bonuses) stat(name, `+${n}`, 'good');
    stat('Repute', `${ledger.rep}`, ledger.repDelta < 0 ? 'bad' : 'good');
    if (ledger.lines.length) {
      const lines = el('div', 'line');
      lines.textContent = ledger.lines.slice(-4).join('  ·  ');
      book.append(lines);
    }
    const row = el('div', 'row');
    let morning = null;
    if (isHost) row.append((morning = button('Morning', 'on', () => (this.click(), onContinue()), 'Enter')));
    else row.append(el('div', 'line', 'Waiting for the keeper.'));
    book.append(row);
    s.append(book);
    this.show('over', s);
    this.primary = morning;
  }

  closed(reason, onAgain) {
    const s = el('div', 'screen dark');
    const text = reason === 'kicked' ? 'You were removed' : reason === 'replaced' ? 'Playing in another tab' : reason === 'disconnected' ? 'Connection lost' : 'Left the tower';
    s.append(el('h2', '', text));
    const b = el('button', 'big', reason === 'disconnected' ? 'Rejoin' : reason === 'replaced' ? 'Play here' : 'Play');
    b.addEventListener('click', () => (this.click(), onAgain()));
    s.append(b);
    this.show('closed', s);
  }

  paused(onResume) {
    const s = el('div', 'screen dark');
    s.append(el('h2', '', 'Paused'));
    const b = el('button', 'big', 'Resume');
    b.addEventListener('click', () => (this.click(), onResume()));
    s.append(b);
    this.show('paused', s);
  }

  waiting(text) {
    const s = el('div', 'screen veil');
    s.append(el('h2', '', text));
    this.show('waiting', s);
  }

  hideOverlays() {
    this.hideStations();
    this.hideHint();
    this.closeRadio();
    this.closeChart();
    this.hideFocus();
    this.watching(null);
  }
}
