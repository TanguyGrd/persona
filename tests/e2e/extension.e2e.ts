import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { activity, actor, bubble, companion, launchWithExtension, setStorage, storage, type Session } from './harness';
import { serve } from './server';
import { PHRASEBOOK } from '../../src/core/profile/phrasebook';
import { PIP_PROFILE } from '../../characters/pip/profile';

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));
const SHOTS = fileURLToPath(new URL('../../test-results', import.meta.url));

let s: Session;
let server: { url: string; close(): Promise<void> };

async function openTestPage(path = '/page.html'): Promise<Page> {
  const page = await s.context.newPage();
  await page.goto(server.url + path);
  return page;
}

async function waitForActivity(page: Page, pred: (a: string | null) => boolean, timeout = 8000) {
  await expect.poll(() => activity(page), { timeout }).toSatisfy(pred);
}

const settled = (a: string | null) => !!a && !['entering', 'hidden', 'exiting'].includes(a);

beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
  server = await serve(FIXTURES);
  s = await launchWithExtension();
});

afterAll(async () => {
  await s?.close();
  await server?.close();
});

beforeEach(async () => {
  // Fresh state for every test (keeps the extension installed).
  await s.worker.evaluate(async () => { await chrome.storage.local.clear(); });
  await setStorage(s.worker, { settings: { schemaVersion: 1, enabled: true, activeProfileId: 'builtin:pip' } });
  for (const p of s.context.pages()) if (p.url().startsWith('http')) await p.close();
});

describe('Chrome extension', () => {
  it('opens the welcome page on install, with the companion on it', async () => {
    const welcome = s.context.pages().find((p) => p.url().endsWith('/welcome.html'))
      ?? (await s.context.waitForEvent('page', { predicate: (p) => p.url().endsWith('/welcome.html'), timeout: 5000 }));
    await expect.poll(() => companion(welcome).count()).toBe(1);
  });

  it('appears with an entrance, greets in a bubble, then starts living', async () => {
    const page = await openTestPage();
    await expect.poll(() => companion(page).count()).toBe(1);
    expect(await activity(page)).toBe('entering');
    await page.screenshot({ path: `${SHOTS}/1-entrance.png` });

    await waitForActivity(page, (a) => a === 'wave');
    await expect.poll(() => bubble(page).isVisible()).toBe(true);
    const text = (await page.locator('persona-companion .pc-bubble .pc-sr').textContent()) ?? '';
    expect(text.length).toBeGreaterThan(3);
    const known = JSON.stringify([PHRASEBOOK.fr.greeting, PHRASEBOOK.fr.weekend, PIP_PROFILE.phrases.greeting]);
    const firstWords = text.split(/[ ,!?.…]/)[0]!;
    expect(known).toContain(firstWords);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/2-greeting.png` });

    // Speech memory was saved, so the next page does not repeat a full greeting.
    await expect.poll(async () => ((await storage(s.worker, 'speechMemory')) as Record<string, { lastGreetingAt: number }> | undefined)?.['builtin:pip']?.lastGreetingAt ?? 0).toBeGreaterThan(0);

    await waitForActivity(page, (a) => a === 'idle', 6000);
    await page.close();
  });

  it('works on a page with a strict Content-Security-Policy (styles applied, avatar drawn)', async () => {
    const page = await openTestPage();
    await waitForActivity(page, settled);
    const box = await actor(page).boundingBox();
    expect(box!.width).toBeGreaterThan(60);
    expect(box!.height).toBeGreaterThan(80);
    expect(box!.y + box!.height).toBeGreaterThan(780); // standing on the bottom of the window
    const arm = await page.locator('persona-companion [data-part="arm-right"]').count();
    expect(arm).toBe(1);
    await page.close();
  });

  it('can be dragged, falls back down and remembers its position', async () => {
    const page = await openTestPage();
    await waitForActivity(page, settled);
    const hit = page.locator('persona-companion .pc-hit');
    const before = (await hit.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 8 });
    expect(await activity(page)).toBe('dragging');
    const held = (await hit.boundingBox())!;
    expect(held.y).toBeLessThan(before.y - 200);
    await page.screenshot({ path: `${SHOTS}/3-dragging.png` });
    await page.mouse.up();
    expect(await activity(page)).toBe('falling');
    await waitForActivity(page, (a) => a !== 'falling');
    const after = (await hit.boundingBox())!;
    expect(Math.abs(after.x + after.width / 2 - 400)).toBeLessThan(60);
    expect(after.y + after.height).toBeGreaterThan(780);

    await expect.poll(async () => ((await storage(s.worker, 'settings')) as { position: { xRatio: number } | null }).position?.xRatio ?? 1).toBeLessThan(0.5);
    const page2 = await openTestPage();
    await waitForActivity(page2, settled);
    const restored = (await page2.locator('persona-companion .pc-hit').boundingBox())!;
    expect(Math.abs(restored.x - after.x)).toBeLessThan(120);
    await page.close();
    await page2.close();
  });

  it('reacts when clicked and gets dizzy when poked repeatedly', async () => {
    const page = await openTestPage();
    await waitForActivity(page, settled);
    const hit = page.locator('persona-companion .pc-hit');
    await hit.click();
    expect(await activity(page)).toBe('react');
    expect(['giggle', 'hop', 'spin', 'blush']).toContain(await actor(page).getAttribute('data-reaction'));
    for (let i = 0; i < 3; i++) await hit.click();
    expect(await actor(page).getAttribute('data-reaction')).toBe('dizzy');
    await page.screenshot({ path: `${SHOTS}/4-dizzy.png` });
    await page.close();
  });

  it('is keyboard accessible', async () => {
    const page = await openTestPage();
    await waitForActivity(page, settled);
    const hit = page.locator('persona-companion .pc-hit');
    expect(await hit.getAttribute('aria-label')).toContain('Pip');
    await hit.focus();
    const x0 = (await hit.boundingBox())!.x;
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect((await hit.boundingBox())!.x).toBeLessThan(x0 - 30);
    await page.keyboard.press('Enter');
    expect(await activity(page)).toBe('react');
    await page.close();
  });

  it('talks on demand from its toolbar', async () => {
    const page = await openTestPage();
    await waitForActivity(page, settled);
    await page.locator('persona-companion .pc-hit').hover();
    await page.locator('persona-companion [data-action="talk"]').click();
    expect(await activity(page)).toBe('talk');
    await expect.poll(() => bubble(page).isVisible()).toBe(true);
    await page.close();
  });

  it('can be hidden from its toolbar and brought back, across tabs', async () => {
    const page = await openTestPage();
    await waitForActivity(page, settled);
    await page.locator('persona-companion .pc-hit').hover();
    await page.locator('persona-companion [data-action="hide"]').click();
    await expect.poll(() => actor(page).isHidden(), { timeout: 4000 }).toBe(true);
    const restore = page.locator('persona-companion .pc-restore');
    await expect.poll(() => restore.isVisible()).toBe(true);
    expect(await storage(s.worker, 'hidden')).toBe(true);
    await page.screenshot({ path: `${SHOTS}/5-hidden.png` });

    const other = await openTestPage();
    await expect.poll(() => other.locator('persona-companion .pc-restore').isVisible()).toBe(true);
    expect(await actor(other).isHidden()).toBe(true);

    await restore.click();
    await expect.poll(() => actor(page).isVisible()).toBe(true);
    await expect.poll(() => actor(other).isVisible(), { timeout: 4000 }).toBe(true);
    expect(await storage(s.worker, 'hidden')).toBe(false);
    await page.close();
    await other.close();
  });

  it('toggles from the keyboard-shortcut message path', async () => {
    const page = await openTestPage();
    await waitForActivity(page, settled);
    const status = await s.worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url: `${url}/*` });
      return chrome.tabs.sendMessage(tab!.id!, { type: 'persona:toggle-hidden' });
    }, server.url);
    expect(status).toMatchObject({ present: true, hidden: true });
    await expect.poll(() => actor(page).isHidden(), { timeout: 4000 }).toBe(true);
    await page.close();
  });

  it('can be disabled everywhere from the popup, and re-enabled', async () => {
    const page = await openTestPage();
    await waitForActivity(page, settled);
    const popup = await s.context.newPage();
    await popup.goto(`chrome-extension://${s.extensionId}/popup.html`);
    await popup.locator('#enabled').waitFor();
    expect(await popup.locator('.who strong').textContent()).toBe('Pip');
    await popup.setViewportSize({ width: 320, height: 400 });
    await popup.screenshot({ path: `${SHOTS}/6-popup.png`, fullPage: true });
    await popup.locator('#enabled').click();
    await expect.poll(() => companion(page).count()).toBe(0);
    await popup.locator('#enabled').click();
    await expect.poll(() => companion(page).count()).toBe(1);
    await popup.close();
    await page.close();
  });

  it('stays away from disabled sites', async () => {
    await setStorage(s.worker, { settings: { schemaVersion: 1, enabled: true, disabledSites: ['127.0.0.1'] } });
    const page = await openTestPage();
    await page.waitForTimeout(800);
    expect(await companion(page).count()).toBe(0);
    await setStorage(s.worker, { settings: { schemaVersion: 1, enabled: true, disabledSites: [] } });
    await expect.poll(() => companion(page).count()).toBe(1);
    await page.close();
  });

  it('creates a character from a description, flags uncertainties, and shows it on pages', async () => {
    const page = await openTestPage();
    await waitForActivity(page, settled);
    const options = await s.context.newPage();
    await options.goto(`chrome-extension://${s.extensionId}/options.html`);
    await options.locator('#cr-name').fill('Grumble');
    await options.locator('#cr-desc').fill('A grumpy, sarcastic old robot who is lazy and slow.');
    await options.locator('#cr-generate').click();
    await options.locator('#ed-uncertainties').waitFor();
    expect(await options.locator('#ed-uncertainties').textContent()).toMatch(/recherche en ligne/);
    expect(await options.locator('#ed-tone').inputValue()).toBe('grumpy');
    expect(await options.locator('#ed-language').inputValue()).toBe('en');
    await options.locator('#ed-try').click();
    expect(await options.locator('#ed-sample').textContent()).toMatch(/« .+ »/);
    await options.screenshot({ path: `${SHOTS}/7-options-editor.png`, fullPage: true });
    await options.locator('#ed-save').click();
    await expect.poll(async () => ((await storage(s.worker, 'settings')) as { activeProfileId: string }).activeProfileId).not.toBe('builtin:pip');
    await expect.poll(async () => page.locator('persona-companion .pc-hit').getAttribute('aria-label'), { timeout: 6000 }).toContain('Grumble');
    await options.close();
    await page.close();
  });

  it('imports an SVG avatar and uses it on pages', async () => {
    const options = await s.context.newPage();
    await options.goto(`chrome-extension://${s.extensionId}/options.html`);
    await options.locator('#im-file').setInputFiles({
      name: 'blob.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="blob" cx="50" cy="55" r="44" fill="#ff9f1c"/><script>alert(1)</script></svg>'),
    });
    await options.locator('#ed-name').waitFor();
    await options.locator('#ed-name').fill('Blob');
    await options.locator('#ed-save').click();
    await expect.poll(async () => ((await storage(s.worker, 'settings')) as { activeProfileId: string }).activeProfileId).not.toBe('builtin:pip');
    const page = await openTestPage();
    await expect.poll(() => page.locator('persona-companion circle#blob').count()).toBe(1);
    expect(await page.locator('persona-companion script').count()).toBe(0);
    await waitForActivity(page, settled);
    await page.screenshot({ path: `${SHOTS}/8-imported-avatar.png` });
    await options.close();
    await page.close();
  });

  it('imports a PNG avatar and draws it on a canvas despite the page CSP', async () => {
    // 8×8 opaque orange PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGP436DwHx9mGBkKAHASp4EuzpueAAAAAElFTkSuQmCC', 'base64');
    const options = await s.context.newPage();
    await options.goto(`chrome-extension://${s.extensionId}/options.html`);
    await options.locator('#im-file').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: png });
    await options.locator('#ed-save').click();
    await expect.poll(async () => ((await storage(s.worker, 'settings')) as { activeProfileId: string }).activeProfileId).not.toBe('builtin:pip');
    const page = await openTestPage();
    await expect.poll(() => page.locator('persona-companion canvas').count()).toBe(1);
    await expect.poll(() => page.locator('persona-companion canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      return d.some((v, i) => i % 4 === 3 && v > 0);
    })).toBe(true);
    await options.close();
    await page.close();
  });
});

describe('host independence', () => {
  it('runs in a plain web page without Chrome APIs (seed of the Windows host)', async () => {
    // Keep the extension off this test server so only the playground's own companion is on the page.
    await setStorage(s.worker, { settings: { schemaVersion: 1, enabled: false } });
    const play = await serve(fileURLToPath(new URL('../../dist/playground', import.meta.url)));
    const page = await s.context.newPage();
    await page.goto(`${play.url}/index.html`);
    await expect.poll(() => companion(page).count(), { timeout: 5000 }).toBe(1);
    expect(await companion(page).getAttribute('data-owner')).toBeNull();
    await waitForActivity(page, settled);
    await page.close();
    await play.close();
  });
});

// Keep a machine-readable list of screenshots for the README / PR.
afterAll(async () => {
  await writeFile(`${SHOTS}/README.txt`, 'Screenshots produced by tests/e2e/extension.e2e.ts\n').catch(() => {});
});
