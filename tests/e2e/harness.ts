import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXT_DIR = fileURLToPath(new URL('../../dist/extension', import.meta.url));

export interface Session {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  close(): Promise<void>;
}

/** Launches Chromium with the built extension loaded (new headless mode supports extensions). */
export async function launchWithExtension(): Promise<Session> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'persona-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1200, height: 800 },
    locale: 'fr-FR',
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  return {
    context,
    worker,
    extensionId,
    async close() {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

export const companion = (page: Page) => page.locator('persona-companion');
export const actor = (page: Page) => page.locator('persona-companion .pc-actor');
export const bubble = (page: Page) => page.locator('persona-companion .pc-bubble');

export async function activity(page: Page): Promise<string | null> {
  return actor(page).getAttribute('data-activity');
}

/** Reads chrome.storage.local from the extension service worker. */
export async function storage(worker: Worker, key: string): Promise<unknown> {
  return worker.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key);
}

export async function setStorage(worker: Worker, values: Record<string, unknown>): Promise<void> {
  await worker.evaluate(async (v) => { await chrome.storage.local.set(v); }, values);
}
