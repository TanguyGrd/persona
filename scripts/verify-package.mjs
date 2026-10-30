// Checks that the release zip installs like a manual "Load unpacked" in Chrome:
// unzips it, validates the manifest and every file it references, then loads the
// unzipped folder in Chromium and waits for the companion to appear on a web page.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const zip = join(root, 'release', `persona-extension-${version}.zip`);
if (!existsSync(zip)) throw new Error(`Missing ${zip} — run "npm run pack" first.`);

const dir = await mkdtemp(join(tmpdir(), 'persona-unzipped-'));
if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zip}' -DestinationPath '${dir}'`]);
} else {
  execFileSync('unzip', ['-q', zip, '-d', dir]);
}

const fail = (msg) => { throw new Error(`Package check failed: ${msg}`); };
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.version !== version) fail(`manifest version ${manifest.version} ≠ package.json ${version}`);
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap((c) => c.js),
  `_locales/${manifest.default_locale}/messages.json`,
  'welcome.html',
];
for (const f of referenced) if (!existsSync(join(dir, f))) fail(`missing ${f}`);
for (const html of ['popup.html', 'options.html', 'welcome.html']) {
  const src = readFileSync(join(dir, html), 'utf8');
  for (const [, ref] of src.matchAll(/(?:src|href)="([^"#:]+)"/g)) if (!existsSync(join(dir, ref))) fail(`${html} references missing ${ref}`);
}
const messages = JSON.parse(readFileSync(join(dir, '_locales/fr/messages.json'), 'utf8'));
for (const key of ['extName', 'extDescription', 'cmdToggle']) if (!messages[key]) fail(`missing locale key ${key}`);
console.log(`✓ manifest and ${referenced.length} referenced files present`);

const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>t</title><p>page</p>'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'persona-profile-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
  console.log(`✓ service worker running (${new URL(worker.url()).host})`);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('persona-companion .pc-hit').waitFor({ timeout: 10_000 });
  console.log('✓ companion appears on a web page');
} finally {
  await context.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
  await rm(dir, { recursive: true, force: true });
}
console.log(`Package OK: ${zip}`);
