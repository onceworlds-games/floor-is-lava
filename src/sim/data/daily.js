// Mutators for the daily watch: small rule changes layered on a fixed build.
export const DAILY_MUTATORS = [
  { id: 'brittle', name: 'Brittle glass', mod: { crackCost: 40 } },
  { id: 'thin-oil', name: 'Thin oil', mod: { oilAdd: -20 } },
  { id: 'loud-sea', name: 'Loud sea', mod: { ascStatic: 0.2 } },
  { id: 'long-night', name: 'Long night', mod: { nightLen: 600 } },
  { id: 'fast-current', name: 'Fast current', mod: { driftMul: 1.2 } },
  { id: 'hot-lamp', name: 'Hot lamp', mod: { heatMul: 1.3 } },
  { id: 'short-rack', name: 'Short rack', mod: { harpoonsAdd: -2 } },
  { id: 'kind-sea', name: 'Kind sea', mod: { waveMul: 0.5 } },
];
export const MUTATOR_BY_ID = Object.fromEntries(DAILY_MUTATORS.map((m) => [m.id, m]));
