// The three lighthouses. Each changes the channel's shape, the tower and how the sea treats it.
export const SITES = {
  'skerry-rock': {
    id: 'skerry-rock',
    name: 'Skerry Rock',
    blurb: 'A low rock in a wide channel. The keeper’s first posting.',
    towerHeight: 34,
    galleryRadius: 4.2,
    routeOffset: 72, // how far east of the tower the channel passes
    routeLength: 620,
    reefMin: 22,
    reefMax: 46,
    waveMul: 1,
    climbTime: 25, // seconds the Drowned take from the reef to the door
    lightningMul: 1,
    beamRangeMul: 1,
    unlock: null,
  },
  'gannet-head': {
    id: 'gannet-head',
    name: 'Gannet Head',
    blurb: 'A cliff over a long narrow sound. Far to see, slow to climb.',
    towerHeight: 52,
    galleryRadius: 4.6,
    routeOffset: 112,
    routeLength: 720,
    reefMin: 20,
    reefMax: 40,
    waveMul: 0.8,
    climbTime: 40,
    lightningMul: 1.3,
    beamRangeMul: 0.85,
    unlock: { nights: 6 }, // finish night 6 once
  },
  'the-needle': {
    id: 'the-needle',
    name: 'The Needle',
    blurb: 'A tall thin tower on a stack. The waves reach the door.',
    towerHeight: 60,
    galleryRadius: 3.0,
    routeOffset: 64,
    routeLength: 580,
    reefMin: 24,
    reefMax: 50,
    waveMul: 1.6,
    climbTime: 18,
    lightningMul: 1.6,
    beamRangeMul: 1.15,
    unlock: { season: true }, // finish a season
  },
};

export const SITE_ORDER = ['skerry-rock', 'gannet-head', 'the-needle'];
