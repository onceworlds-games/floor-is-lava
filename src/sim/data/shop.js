// The day shop. `tiers` is how many times an item can be bought (each tier adds `each` again);
// consumables restock a per-night supply. `mod` fields are read by modifiers.js.
export const TIER_PRICES = [40, 90, 160];

export const SHOP = [
  { id: 'lens', name: 'Lens', tiers: 3, blurb: 'Brighter, further.', line: '+12% light, +10% reach per tier' },
  { id: 'fins', name: 'Cooling fins', tiers: 1, blurb: 'Heat climbs slower.', line: '-25% heat' },
  { id: 'shutter', name: 'Dual shutter', tiers: 1, blurb: 'Strobe keeps its bite.', line: 'Strobe at full light' },
  { id: 'tank', name: 'Oil tank', tiers: 3, blurb: 'Room for more.', line: '+40 L per tier' },
  { id: 'shutters', name: 'Storm shutters', tiers: 1, blurb: 'The sea hits softer.', line: '-30% wave damage' },
  { id: 'door', name: 'Reinforced door', tiers: 1, blurb: 'Iron over oak.', line: 'Drowned do half damage' },
  { id: 'rod', name: 'Lightning rod', tiers: 1, blurb: 'Takes the strike for you.', line: 'Lightning is harmless' },
  { id: 'radar', name: 'Radar', tiers: 1, blurb: 'Blips for what you have not seen.', line: 'Chart shows every ship' },
  { id: 'climb', name: 'Quick climb', tiers: 1, blurb: 'Rope on the stair.', line: 'Stairs 0.6 s faster' },
  { id: 'harpoons', name: 'Harpoon rack', tiers: 3, blurb: 'Two more a night.', line: '+2 harpoons per tier' },
  { id: 'flares', name: 'Flare box', tiers: 3, blurb: 'Two more a night.', line: '+2 flares per tier' },
  { id: 'spare', name: 'Spare lens', tiers: 0, price: 25, blurb: 'For when it cracks.', line: '+1 spare lens tonight', consumable: true },
  { id: 'oilcan', name: 'Oil can', tiers: 0, price: 25, blurb: '20 L in the cellar.', line: '+1 can tonight', consumable: true },
  { id: 'apprentice', name: 'Apprentice', tiers: 1, price: 140, blurb: 'Runs the horn and radio when you are elsewhere.', line: 'Works the watch room at 70%' },
  { id: 'dog', name: 'Dog', tiers: 1, price: 70, blurb: 'Barks before trouble.', line: 'Warns 4 s earlier' },
  { id: 'cat', name: 'Cat', tiers: 1, price: 30, blurb: 'Sits on the chart.', line: 'Never useful. Always loved' },
];

export function shopPrice(item, owned) {
  if (item.consumable) return item.price;
  if (item.price) return item.price;
  return TIER_PRICES[Math.min(owned, TIER_PRICES.length - 1)];
}
