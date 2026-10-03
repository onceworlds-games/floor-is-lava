// Charters: a contract for the next night. Three are offered; "Plain watch" is always possible.
export const CHARTERS = [
  { id: 'heavy-fog', name: 'Heavy Fog', gives: 'Coins +50%', costs: 'Fog, whatever the glass says', mod: { coinMul: 1.5 }, weather: 'fog', minNight: 3 },
  { id: 'grain-barge', name: 'Grain Barge', gives: 'Save the Marram: +200', costs: 'Lose her: -12 repute', mod: {}, special: 'grain', minNight: 2 },
  { id: 'moonless', name: 'Moonless', gives: 'Coins +25%, ships carry bright lights', costs: 'Lamp -30%', mod: { coinMul: 1.25, lampMul: 0.7, brightShips: true }, minNight: 2 },
  { id: 'smugglers-run', name: "Smuggler's Run", gives: 'Save the skiff: +120', costs: 'Light her near the cutter and she is lost', mod: {}, special: 'smuggler', minNight: 4 },
  { id: 'quiet-night', name: 'Quiet Night', gives: 'Double traffic, nothing hostile', costs: 'Coins -20%', mod: { coinMul: 0.8, trafficMul: 2, hostileMul: 0 }, minNight: 2 },
  { id: 'red-tide', name: 'Red Tide', gives: 'Coins +40%, Red burns +50%', costs: 'Twice the Drowned', mod: { coinMul: 1.4, redBurnMul: 1.5, drownedMul: 2 }, minNight: 3 },
  { id: 'salvage-moon', name: 'Salvage Moon', gives: 'Every wreck leaves a double crate', costs: 'Wrecks cost 2 more repute', mod: { crateMul: 2, allCrates: true, repWreckAdd: -2 }, minNight: 2 },
  { id: 'convoy', name: 'Convoy', gives: 'Coins +30%', costs: 'Ships come in pairs', mod: { coinMul: 1.3, convoy: true }, minNight: 3 },
  { id: 'short-watch', name: 'Short Watch', gives: 'Coins +15%, a 6-minute night', costs: 'Everything comes faster', mod: { coinMul: 1.15, nightLen: 360, compress: 1.35 }, minNight: 2 },
];

export const CHARTER_BY_ID = Object.fromEntries(CHARTERS.map((c) => [c.id, c]));
