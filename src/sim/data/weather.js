// Weather sets the swell (drift and tower damage), visibility, radio static and the spawn mix.
export const WEATHER = {
  clear: { id: 'clear', name: 'Clear', storm: 0.15, vis: 1.0, static: 0.05, rain: 0, thunder: false, fog: 0, tell: 'Stars out. Long swell.' },
  rain: { id: 'rain', name: 'Rain', storm: 0.35, vis: 0.8, static: 0.15, rain: 0.6, thunder: false, fog: 0.1, tell: 'Steady rain. Glass falling.' },
  squall: { id: 'squall', name: 'Squall', storm: 0.6, vis: 0.65, static: 0.3, rain: 1.0, thunder: false, fog: 0.15, tell: 'Squalls from the west. Hold the rail.' },
  fog: { id: 'fog', name: 'Fog', storm: 0.2, vis: 0.4, static: 0.1, rain: 0, thunder: false, fog: 0.6, tell: 'Fog on the water. Horn will be wanted.' },
  thunder: { id: 'thunder', name: 'Thunderstorm', storm: 0.75, vis: 0.6, static: 0.5, rain: 0.9, thunder: true, fog: 0.1, tell: 'Thunder. Keep off the gallery at the peak.' },
  gale: { id: 'gale', name: 'Gale', storm: 1.0, vis: 0.55, static: 0.4, rain: 0.8, thunder: false, fog: 0.05, tell: 'Gale. The sea will try the door.' },
};

/** Weights by night: calm early, rough late. The first night is always clear. */
export function weatherWeights(night) {
  if (night <= 1) return [{ id: 'clear', w: 1 }];
  const n = Math.min(night, 12);
  return [
    { id: 'clear', w: Math.max(0.3, 4 - n * 0.35) },
    { id: 'rain', w: 2 + n * 0.1 },
    { id: 'squall', w: n >= 3 ? 1 + n * 0.25 : 0 },
    { id: 'fog', w: n >= 3 ? 1 + n * 0.2 : 0 },
    { id: 'thunder', w: n >= 4 ? 0.5 + n * 0.3 : 0 },
    { id: 'gale', w: n >= 6 ? n * 0.3 : 0 },
  ];
}
