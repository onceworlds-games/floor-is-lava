// Opens the built game in headless Chrome with a query string and saves a screenshot.
//   node scripts/shot.mjs "?debug&skip=120" out.png [width height] [wait ms]
import { writeFileSync } from 'node:fs';
import { serve, launch, sleep } from './cdp.mjs';

const [query = '', out = 'shot.png', w = '1100', h = '760', wait = '4000'] = process.argv.slice(2);
const { server, port } = await serve('dist');
const b = await launch({ width: Number(w), height: Number(h) });
const errors = [];
b.on((m) => {
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
});
await b.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html${query}` });
await sleep(Number(wait));
const r = await b.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(r.result.data, 'base64'));
console.log('saved', out, 'errors:', errors.length ? errors : 'none');
b.close();
server.close();
