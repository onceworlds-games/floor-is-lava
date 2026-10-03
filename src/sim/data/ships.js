// Friendly ships: what they are worth, how they move, how well they hear the radio.
export const SHIPS = {
  smack: { id: 'smack', name: 'Fishing smack', value: 1, speed: 4.2, length: 9, radio: 0.6, driftMul: 1.2, rep: 2, hull: 1 },
  ferry: { id: 'ferry', name: 'Ferry', value: 2, speed: 3.6, length: 16, radio: 0.95, driftMul: 1.0, rep: 3, hull: 1 },
  barge: { id: 'barge', name: 'Cargo barge', value: 3, speed: 2.6, length: 26, radio: 0.8, driftMul: 0.9, rep: 2, hull: 1, crate: 45 },
  cutter: { id: 'cutter', name: 'Naval cutter', value: 2, speed: 4.0, length: 14, radio: 0.9, driftMul: 0.85, rep: 2, hull: 1, guideMul: 1.4, guns: true },
  skiff: { id: 'skiff', name: 'Skiff', value: 2, speed: 4.6, length: 7, radio: 0.5, driftMul: 1.3, rep: 2, hull: 1 },
};

export const SHIP_ORDER = ['smack', 'ferry', 'barge', 'cutter'];

/** Weights by night: smacks early, more ferries and barges later, cutters from night 3. */
export function shipWeights(night) {
  return [
    { id: 'smack', w: 5 },
    { id: 'ferry', w: 2 + night * 0.3 },
    { id: 'barge', w: night >= 2 ? 1 + night * 0.25 : 0 },
    { id: 'cutter', w: night >= 3 ? 1 + night * 0.15 : 0 },
  ];
}

export const ORDERS = ['port', 'starboard', 'hold', 'anchor'];

/** Ship names drawn in the keeper's ledger (never players' names). */
export const SHIP_NAMES = [
  'Mary Alder', 'Petrel', 'Grey Gull', 'Hesper', 'Kittiwake', 'Old Tom', 'Saltire', 'Dunlin', 'Fulmar', 'Marram',
  'Lantern Jane', 'Orsa', 'Tern', 'Bellwether', 'Cormorant', 'Lisbet', 'Ninefold', 'Skua', 'Whitby Rose', 'Ebb',
  'Carrack Moll', 'Sedge', 'Brigid', 'Low Water', 'Gannet', 'Halyard', 'Tansy', 'Northlight', 'Pell', 'Eider',
];
