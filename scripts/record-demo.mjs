// Records docs/demo.gif: the real extension in Chromium, driven by scripted interactions.
// Needs ffmpeg on the PATH. Usage: npm run build && node scripts/record-demo.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'dist/extension');
const fixtures = join(root, 'tests/e2e/fixtures');
const W = 1000, H = 600;

const server = createServer(async (req, res) => {
  const file = (req.url ?? '/').split('?')[0] === '/page.css' ? 'page.css' : 'page.html';
  res.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' });
  res.end(await readFile(join(fixtures, file)));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/page.html`;

const profile = await mkdtemp(join(tmpdir(), 'persona-demo-'));
const videos = await mkdtemp(join(tmpdir(), 'persona-video-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: W, height: H },
  locale: 'fr-FR',
  bypassCSP: true,
  recordVideo: { dir: videos, size: { width: W, height: H } },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
await worker.evaluate(() => chrome.storage.local.set({ settings: { schemaVersion: 1, enabled: true, userName: 'Tanguy', frequency: 'calm' } }));
await new Promise((r) => setTimeout(r, 500));
for (const p of context.pages()) await p.close().catch(() => {});

const page = await context.newPage();
// A visible cursor and captions (headless video does not draw the mouse).
await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    Object.assign(dot.style, { position: 'fixed', left: '0', top: '0', width: '18px', height: '18px', margin: '-9px 0 0 -9px', borderRadius: '50%',
      background: 'rgba(239,71,111,.85)', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.4)', zIndex: '2147483647', pointerEvents: 'none', transition: 'transform .1s' });
    document.documentElement.appendChild(dot);
    addEventListener('mousemove', (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
    addEventListener('mousedown', () => { dot.style.transform = 'scale(.7)'; }, true);
    addEventListener('mouseup', () => { dot.style.transform = ''; }, true);
    const cap = document.createElement('div');
    cap.id = 'demo-caption';
    Object.assign(cap.style, { position: 'fixed', left: '24px', top: '20px', padding: '8px 14px', borderRadius: '10px', background: '#264653', color: '#fff',
      font: '600 18px system-ui, sans-serif', zIndex: '2147483647', pointerEvents: 'none' });
    document.documentElement.appendChild(cap);
  });
});
const caption = (t) => page.evaluate((text) => { document.getElementById('demo-caption').textContent = text; }, t);
const wait = (ms) => page.waitForTimeout(ms);
const hit = page.locator('persona-companion .pc-hit');
const center = async () => { const b = await hit.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

await page.goto(url);
await caption('1. Entrée en scène + salutation');
await page.mouse.move(500, 250);
await wait(4800);

await caption('2. Survol : barre d’outils');
let c = await center();
await page.mouse.move(c.x, c.y, { steps: 15 });
await wait(1400);

await caption('3. Clic : réaction');
await page.mouse.click(c.x, c.y);
await wait(1600);

await caption('4. Glisser-déposer');
c = await center();
await page.mouse.move(c.x, c.y, { steps: 5 });
await page.mouse.down();
await page.mouse.move(430, 220, { steps: 30 });
await wait(900);
await page.mouse.up();
await wait(1800);

await caption('5. Trop de clics : la tête qui tourne');
c = await center();
await page.mouse.move(c.x, c.y, { steps: 10 });
for (let i = 0; i < 4; i++) { await page.mouse.click(c.x, c.y); await wait(120); }
await wait(2200);

await caption('6. Masquer puis faire revenir');
c = await center();
await page.mouse.move(c.x, c.y, { steps: 6 });
await wait(400);
const hide = page.locator('persona-companion [data-action="hide"]');
const hb = await hide.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2, { steps: 8 });
await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
await wait(2000);
const pill = await page.locator('persona-companion .pc-restore').boundingBox();
await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2, { steps: 15 });
await page.mouse.click(pill.x + pill.width / 2, pill.y + pill.height / 2);
await page.mouse.move(500, 250, { steps: 15 });
await wait(3500);

const video = page.video();
await page.close();
const webm = await video.path();
await context.close();
server.close();

const out = join(root, 'docs/demo.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf',
  'fps=12,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', out]);
await rm(profile, { recursive: true, force: true });
await rm(videos, { recursive: true, force: true });
console.log(`Demo written to ${out}`);
