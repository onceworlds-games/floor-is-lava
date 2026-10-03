# Watchlight

Keep a lonely lighthouse through twelve stormy nights. Your weapon, your guide and your eyes are the same great beam.

Play it at [onceworlds.com/play/watchlight](https://onceworlds.com/play/watchlight).

## How to play

Every night, ships sail blind toward the reef and things in the water hate the light (some love it). Keep a ship in
the lamp's pool until the ring round it closes and it reads **Guided**: it steers back to the safe line. A ship whose
engine dies needs the light first, then a radio order, before it founders. Between nights you spend what you saved:
the shop, a relic draft, a charter for the next night, the Almanac. Survive the season; the Tide Titan waits on night
twelve, and each of its three faces wants a different tool (hard light, harpoons, the horn and flares).

Three stations, one keeper (or up to four friends):

- **Lamp room**: aim the beam, focus the pool (6 to 40 m; tighter is brighter and hotter), Sweep or Spot, four lenses
  (Amber calms sirens, Blue halts false lights, Red burns the Drowned faster, White is strongest), strobe, overcharge.
  Heat cracks the lens; moths dirty it.
- **Gallery**: binoculars, flares (a pool that drifts with the wind), the harpoon cannon, the hammer. Lightning strikes here.
- **Watch room**: the radio (Port, Starboard, Hold, Anchor), the chart, the foghorn, the generator and the hand crank.
- **Cellar**: a spare oil can, a flare crate, the crank, and the door the Drowned come for.

### Controls

Keyboard and mouse: the mouse aims the lamp on the water (no pointer lock; the view turns with `A`/`D` or when the
cursor nears an edge). `Wheel` focus, `Space` Sweep/Spot, `1`-`4` lens, `Shift` strobe, `Ctrl` overcharge, `E` wipe the
lens. Gallery: click to fire the harpoon, `F` flare, `Z` scan, `E` repair. Watch room: `R` radio, `H` horn, `G` generator,
`Q` crank, `C` chart. Cellar: `O` oil can, `F` flare crate, `Q` crank, `E` repair. `Tab` cycles stations, `Shift+1-4` jumps.
`P` pets the cat.

Touch: drag on the water to aim, the slider sets the focus, the stick turns the view, four buttons change with the
station, and the station tabs sit at the top.

## What is in it

- 12-night seasons with a 9-minute night built from an event deck (4 to 14 ships, 1 to 7 hostile events), a quiet minute
  and a moment of panic every night; six weathers; dusk, night, dawn and the day between.
- Four friendly ship types with a drift-and-guidance model, radio orders, dead engines that founder if nobody answers,
  wrecks and salvage crates.
- Seven hostile kinds: the Drowned, Sirens, Mimics, the Tide-Wraith, moth swarms, the Kraken, lightning; the Tide Titan
  and its three faces on night twelve.
- Oil, power, heat, tower integrity, reputation, coins; harpoons, flares, a spare lens, oil cans.
- A shop of 16 items, 30 relics (each gives and costs), 9 charters, an Almanac that pays you for reading, four keepers,
  three sites, Storm levels 1-6, an endless watch after the finale, a daily watch with its own mutators, cosmetics.
- Eleven badges and three leaderboards.

## Multiplayer

A friends game: your own private tower, up to four keepers. The host's page runs the night and everyone else works a
station and sends what they do; snapshots go out eight times a second, so a reloaded friend or a new host picks the
night up where it is, and a keeper alone can run every station.

## How it is built

Vite and three.js, no downloaded art or sound: the sea, sky, tower, ships and creatures are procedural geometry and
shaders lit in linear light and tone-mapped at the end (with bloom on medium and high quality); the beam's shaft is
the light scattered along each view ray inside its cone. Every sound is synthesized with Web Audio through one
limiter; the two fonts are bundled.

- `src/sim/`: the pure simulation (no DOM, seeded, fixed 50 ms steps, plain data): the route and reefs, the beam, ships,
  hostile things, the night's deck, the season, the keeper's record, scripted keepers for the balance harness.
- `src/render/`: the renderer, the sea and sky shaders, the tower, the beam, the entities, the weather.
- `src/ui/`: the HUD, the chart, the screens, hints.
- `src/audio/`: the sound engine. `src/net/`: the room, the match and snapshots. `src/platform.js`: the one adapter
  around the Onceworlds SDK (the game also runs standalone).
- `test/`: unit, property and fuzz tests for the simulation, and a fake room that plays a night with three pages.

## Running it

```
npm install
npm run dev          # http://localhost:5181 (standalone: a solo room, saves in memory)
npm test             # node --test
npm run balance      # the headless balance harness (add --seeds 40 --relics)
npm run build        # dist/
npm run smoke        # the built game drives itself in headless Chrome
npm run store        # captures the store art into store/ from the game's own poster scenes, on the GPU
                     # (SOFTWARE_GL=1 to use the software renderer on a machine without one)
```

To try it with real multiplayer, deploy it to a local Onceworlds platform (`onceworlds deploy . --api http://localhost:8787`)
or push a branch for a preview URL.

## Badges and leaderboards

Badges: First Light, Safe Harbour, No Wrecks, Out Of Oil, Siren Song, False Lights, Lightning Rod, Titan Down,
Twelve Nights, Storm Six, Good Cat. Leaderboards: `season-score`, `endless-nights`, `ships-saved`.

## License

MIT. See `LICENSE`.
