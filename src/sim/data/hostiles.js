// Hostile things: when they first appear, their weight in the deck, their cost against the night's
// budget, and the Almanac page each one writes when survived.
export const HOSTILES = {
  drowned: { id: 'drowned', name: 'The Drowned', minNight: 1, w: 5, cost: 1, tell: 8 },
  moths: { id: 'moths', name: 'Moth swarm', minNight: 2, w: 3, cost: 0.6, tell: 5 },
  siren: { id: 'siren', name: 'Siren', minNight: 3, w: 4, cost: 1.2, tell: 6 },
  wraith: { id: 'wraith', name: 'Tide-Wraith', minNight: 4, w: 3, cost: 1.3, tell: 10 },
  mimic: { id: 'mimic', name: 'Mimic', minNight: 5, w: 4, cost: 1.2, tell: 5 },
  kraken: { id: 'kraken', name: 'Kraken', minNight: 7, w: 2, cost: 2.2, tell: 8 },
  lightning: { id: 'lightning', name: 'Lightning', minNight: 4, w: 0, cost: 0, tell: 0 }, // comes with thunderstorms, not the deck
  titan: { id: 'titan', name: 'The Tide Titan', minNight: 12, w: 0, cost: 0, tell: 20 },
};

export const HOSTILE_ORDER = ['drowned', 'moths', 'siren', 'wraith', 'mimic', 'kraken', 'lightning', 'titan'];

export const ALMANAC = {
  drowned: { weakness: 'Light on the reef. Red burns faster.', tell: 'Churn on the rocks. The dog knows.', tip: 'Burn them climbing. At the door, drop a flare at the base.' },
  moths: { weakness: 'Strobe, or the wiping rag.', tell: 'A soft tapping on the glass.', tip: 'Strobe two seconds before the grit sets.' },
  siren: { weakness: 'Amber quiets her. Horn, flare or harpoon moves her.', tell: 'The song. Ships lean toward it.', tip: 'Amber first, then guide the ship past. Harpoon if she sits in the narrows.' },
  wraith: { weakness: 'A flare burns a hole. The horn pushes it back.', tell: 'The chart goes blank where it sits.', tip: 'Horn when it covers the narrows, flare when a ship is inside.' },
  mimic: { weakness: 'Blue halts it. A scan names it.', tell: 'Lights where no ship was hailed.', tip: 'Unhailed lights are lies. Blue, then harpoon.' },
  kraken: { weakness: 'Three harpoons, or six seconds of hard white.', tell: 'The water boils before it comes.', tip: 'Do not sound the horn when the water boils.' },
  lightning: { weakness: 'A rod on the roof.', tell: 'The count between flash and thunder shortens.', tip: 'Come in off the gallery at the peak.' },
  titan: { weakness: 'Light, then iron, then noise and fire.', tell: 'Everything else goes quiet.', tip: 'Each face wants a different tool. Keep the ships moving.' },
};
