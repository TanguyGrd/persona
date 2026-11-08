import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Server } from 'node:http';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';

interface Call { command: string; args?: Record<string, unknown> }
interface Harness {
  calls: Call[];
  emit(event: string): void;
  stop: () => void;
}
declare global { interface Window { desktopHarness: Harness } }
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'test-results', 'desktop-harness');
let browser: Browser;
let page: Page;
let server: Server;
let url: string;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  await cp(join(root, 'src/hosts/windows/index.html'), join(output, 'index.html'));
  await cp(join(root, 'src/hosts/windows/windows.css'), join(output, 'windows.css'));
  await build({
    absWorkingDir: root,
    stdin: {
      contents: `import {startDesktop} from './src/hosts/windows/desktop';
        const handlers=new Map();
        window.desktopHarness={calls:[],emit(event){handlers.get(event)?.();},stop(){}};
        const bridge={
          async invoke(command,args){window.desktopHarness.calls.push({command,args});},
          async listen(event,handler){handlers.set(event,handler);return ()=>handlers.delete(event);}
        };
        window.desktopHarness.stop=await startDesktop(bridge);`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, format: 'esm', target: 'chrome116', loader: { '.svg': 'text' },
    outfile: join(output, 'windows.js'),
  });
  server = createServer(async (req, res) => {
    const path = req.url === '/' ? 'index.html' : req.url?.slice(1) ?? 'index.html';
    try {
      const body = await readFile(join(output, path));
      res.writeHead(200, { 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ipc: http://ipc.localhost", 'content-type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No browser test server address');
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PERSONA_TEST_CHROMIUM ? { executablePath: process.env.PERSONA_TEST_CHROMIUM } : {}),
  });
});

afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
});

beforeEach(async () => {
  await page?.context().close();
  const context = await browser.newContext({ viewport: { width: 360, height: 320 }, locale: 'fr-FR' });
  await context.addInitScript(() => { if (!localStorage.getItem('persona:desktop:welcome-done')) localStorage.setItem('persona:desktop:welcome-done', '1'); });
  page = await context.newPage();
  await page.goto(url);
  await expect.poll(() => commands()).toContain('desktop_ready');
});
const hit = () => page.locator('persona-companion .pc-hit');
const actor = () => page.locator('persona-companion .pc-actor');
const commands = () => page.evaluate(() => window.desktopHarness.calls.map((call) => call.command));
const emit = (event: string) => page.evaluate((e) => window.desktopHarness.emit(e), event);
async function settled() {
  await expect.poll(() => actor().getAttribute('data-activity'), { timeout: 6000 }).not.toBe('entering');
  await hit().waitFor({ state: 'visible' });
}

// A mock IPC bridge verifies frontend requests and shared-stage behavior only.
// These tests do not establish Windows transparency, native dragging, or tray behavior.
describe('desktop frontend with real Chromium and mocked native IPC', () => {
  it('opens the welcome menu on first use and can play Pip', async () => {
    // Use an untouched context, without the companion-only fixture's welcome marker.
    const fresh = await browser.newContext({ viewport: { width: 760, height: 640 } });
    try {
      const welcome = await fresh.newPage();
      await welcome.goto(url);
      await expect.poll(() => welcome.locator('#launcher').isVisible()).toBe(true);
      await welcome.getByRole('button', { name: '▶ Pip' }).click();
      await expect.poll(() => welcome.locator('#launcher').isVisible()).toBe(false);
      expect(await welcome.evaluate(() => localStorage.getItem('persona:desktop:welcome-done'))).toBe('1');
    } finally { await fresh.close(); }
  });

  it('creates a companion from an image and keeps it after restart', async () => {
    await page.setViewportSize({ width: 760, height: 640 });
    await emit('desktop-menu');
    await page.locator('#avatar-file').setInputFiles({ name: 'mousse.png', mimeType: 'image/png', buffer: await readFile(join(root, 'assets/icons/icon-128.png')) });
    await expect.poll(() => page.locator('#avatar-create').isEnabled()).toBe(true);
    await page.locator('#avatar-name').fill('Mousse');
    await page.locator('#avatar-description').fill('Calme et curieux');
    await page.screenshot({ path: join(root, 'test-results/persona-avatar-menu.png') });
    await page.locator('#avatar-create').click();
    await expect.poll(() => page.locator('#launcher').isVisible()).toBe(false);
    await page.reload();
    await expect.poll(() => commands()).toContain('desktop_ready');
    expect(await hit().getAttribute('aria-label')).toContain('Mousse');
    await emit('desktop-menu');
    expect(await page.getByRole('button', { name: '▶ Mousse' }).count()).toBe(1);
  });

  it('rejects multiple views instead of pretending to generate them with AI', async () => {
    await emit('desktop-menu');
    await page.locator('#avatar-drop').evaluate((el) => {
      const data = new DataTransfer();
      data.items.add(new File(['a'], 'face.png', { type: 'image/png' }));
      data.items.add(new File(['b'], 'profil.png', { type: 'image/png' }));
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    });
    expect(await page.locator('#avatar-status').textContent()).toContain('plusieurs vues');
    expect(await page.locator('#avatar-create').isDisabled()).toBe(true);
  });

  it('animates Pip and keeps a short click as a stage reaction, without native dragging', async () => {
    expect(await actor().getAttribute('data-activity')).toBe('entering');
    await settled();
    await hit().click();
    expect(await actor().getAttribute('data-activity')).toBe('react');
    expect(await commands()).not.toContain('start_dragging');
    expect(await page.locator('#error').isVisible()).toBe(false);
  });

  it('delegates a drag to the OS once, rather than moving Pip inside the page', async () => {
    await settled();
    await hit().hover(); // Playwright waits for entrance layout to settle before the gesture.
    const before = await actor().evaluate((el) => el.style.transform);
    const box = await hit().boundingBox();
    if (!box) throw new Error('Pip has no hit rectangle');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => commands()).toContain('set_pointer_capture');
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2);
    expect(await commands()).not.toContain('start_dragging');
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 - 20);
    await page.mouse.up();
    const calls = await commands();
    expect(calls.filter((command) => command === 'start_dragging')).toHaveLength(1);
    expect(await actor().getAttribute('data-activity')).not.toBe('dragging');
    expect(await actor().evaluate((el) => el.style.transform)).toBe(before);
  });

  it('sends a native hide and restores the stage when the tray emits show; quit has its own IPC', async () => {
    await settled();
    await hit().hover();
    await page.locator('persona-companion [data-action="hide"]').click();
    await expect.poll(() => commands()).toContain('hide_companion');
    await emit('desktop-show');
    await expect.poll(() => actor().isVisible()).toBe(true);
    await emit('desktop-settings');
    await page.locator('#quit').click();
    expect(await commands()).toContain('quit_app');
  });

  it('persists settings across reload and keeps the built-in profile usable', async () => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await emit('desktop-settings');
    await page.locator('[name="userName"]').fill('Tanguy');
    await page.locator('[name="scale"]').selectOption('1.25');
    await page.locator('[name="reduceMotion"]').selectOption('on');
    await page.locator('#settings-form button[type="submit"]').click();
    await expect.poll(() => page.locator('#settings').isVisible()).toBe(false);
    await page.reload();
    await expect.poll(() => commands()).toContain('desktop_ready');
    await emit('desktop-settings');
    expect(await page.locator('[name="userName"]').inputValue()).toBe('Tanguy');
    expect(await page.locator('[name="scale"]').inputValue()).toBe('1.25');
    expect(await page.locator('[name="activeProfileId"]').inputValue()).toBe('builtin:pip');
    await page.locator('#close-settings').click();
    expect(await page.locator('persona-companion').count()).toBe(1);
    expect(await page.locator('#error').isVisible()).toBe(false);
    expect(errors).toEqual([]);
  });

  it('exposes corrupt persisted state and requests a visible native window instead of silently booting', async () => {
    await page.evaluate(() => localStorage.setItem('persona:desktop:settings', '{corrupted'));
    await page.reload();
    await expect.poll(() => page.locator('#error').isVisible()).toBe(true);
    expect(await page.locator('#error').textContent()).toContain('Persona');
    await expect.poll(() => commands()).toContain('desktop_ready');
    expect(await page.locator('persona-companion').count()).toBe(0);
    const regions = await page.evaluate(() => window.desktopHarness.calls.find((call) => call.command === 'set_hit_regions')?.args?.regions);
    expect(regions).toEqual([{ x: 0, y: 0, width: 360, height: 320 }]);
  });

  it('keeps all toolbar actions inside the small window at the right edge', async () => {
    await settled();
    await hit().focus();
    for (let step = 0; step < 16; step++) await page.keyboard.press('ArrowRight');
    await hit().hover();
    const toolbar = page.locator('persona-companion .pc-toolbar');
    await expect.poll(() => toolbar.evaluate((element) => (element as HTMLElement).style.left)).toBe('-34px');
    const buttons = page.locator('persona-companion .pc-toolbar button');
    expect(await buttons.count()).toBe(3);
    await expect.poll(() => buttons.evaluateAll((elements) => elements.every((element) => {
      const rectangle = element.getBoundingClientRect();
      return rectangle.left >= 0 && rectangle.right <= innerWidth && rectangle.top >= 0 && rectangle.bottom <= innerHeight;
    }))).toBe(true);
    await page.locator('persona-companion [data-action="settings"]').click();
    await expect.poll(() => page.locator('#settings').isVisible()).toBe(true);
  });

  it('reports only visible hit regions, and includes the settings panel while open', async () => {
    await settled();
    // Assert actual calls, rather than synthetic element geometry.
    const latest = () => page.evaluate(() => {
      const calls = window.desktopHarness.calls.filter((call) => call.command === 'set_hit_regions');
      return calls.at(-1)?.args?.regions as { x: number; y: number; width: number; height: number }[];
    });
    await expect.poll(async () => (await latest())?.length ?? 0).toBeGreaterThan(0);
    expect((await latest()).some((r) => r.width >= 340 && r.height >= 300)).toBe(false);
    await emit('desktop-settings');
    await expect.poll(async () => (await latest()).some((r) => r.width >= 340 && r.height >= 300)).toBe(true);
    await page.locator('#close-settings').click();
    await expect.poll(async () => (await latest()).some((r) => r.width >= 340 && r.height >= 300)).toBe(false);
  });
});
