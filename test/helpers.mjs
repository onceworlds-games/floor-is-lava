export const BARE = { keeper: 'ismay', site: 'skerry-rock', asc: 0, upgrades: {}, relics: [], charter: null, almanacRead: [], rep: 60 };
export const GOOD = { keeper: 'ismay', site: 'skerry-rock', asc: 0, upgrades: { lens: 3, tank: 2, fins: 1, door: 1, shutters: 1, rod: 1, harpoons: 2, flares: 1, apprentice: 1, dog: 1, radar: 1 }, relics: ['kettle', 'salt-ledger', 'deep-tank', 'quick-match', 'kraken-tooth'], charter: null, almanacRead: ['drowned', 'siren'], rep: 70 };

export function finite(obj, path = '') {
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) throw new Error(`non-finite number at ${path}: ${obj}`);
    return;
  }
  if (Array.isArray(obj)) return obj.forEach((v, i) => finite(v, `${path}[${i}]`));
  if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) finite(obj[k], `${path}.${k}`);
}
