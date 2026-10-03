// Standalone smoke test: the built game runs its autopilot (?test) in headless Chrome for a while,
// with no SDK. Fails on any uncaught error.   npm run build && npm run smoke [seconds]
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve, launch, sleep } from './cdp.mjs';

const seconds = Number(process.argv[2] || 60);
const { server, port } = await serve('dist');
const b = await launch({ width: 900, height: 600, gpu: true });
const errors = [];
b.on((m) => {
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`error: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
});
await b.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html?test&speed=8&quality=high` });
const t0 = Date.now();
let lastPhase = '';
while (Date.now() - t0 < seconds * 1000) {
  await sleep(2000);
  const info = await b.evaluate(`(() => { const w = window.__wl; if (!w) return 'booting'; const s = w.session.state; return JSON.stringify({ phase: w.G.phase, night: s ? s.night : null, t: s ? Math.round(s.t) : null, saved: s ? s.stats.saved : null, wrecked: s ? s.stats.wrecked : null, integ: s ? Math.round(s.res.integ) : null, season: w.G.season ? w.G.season.night : null, q: w.view.gfx.quality, fps: Math.round(1000 / w.view.gfx.frameEma) }); })()`);
  if (info !== lastPhase) {
    console.log(`${Math.round((Date.now() - t0) / 1000)}s`, info);
    lastPhase = info;
  }
}
const r = await b.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(tmpdir(), 'watchlight-smoke.png'), Buffer.from(r.result.data, 'base64'));
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no errors');
b.close();
server.close();
process.exit(errors.length ? 1 : 0);
