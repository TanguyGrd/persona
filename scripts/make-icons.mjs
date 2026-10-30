// Renders the extension icons from Pip's SVG with the pre-installed Chromium (Playwright).
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'characters/pip/avatar.svg'), 'utf8');
await mkdir(join(root, 'assets/icons'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  // Crop to the head and sprout so the icon stays readable at 16 px.
  const icon = svg.replace(/viewBox="[^"]*"/, 'viewBox="12 0 96 112"').replace(/<ellipse data-part="shadow"[^>]*\/>/, '');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(root, `assets/icons/icon-${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('Icons written to assets/icons/');
