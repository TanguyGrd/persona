import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Server } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IndexedDesktopStore } from '../../src/hosts/windows/store';

declare global { interface Window { indexedStoreTest: { Store: typeof IndexedDesktopStore } } }
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'test-results', 'indexed-store');
let browser: Browser;
let page: Page;
let server: Server;
let url: string;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  await build({
    absWorkingDir: root,
    stdin: {
      contents: "import {IndexedDesktopStore} from './src/hosts/windows/store'; window.indexedStoreTest={Store:IndexedDesktopStore};",
      resolveDir: root, loader: 'ts',
    },
    bundle: true, format: 'esm', target: 'chrome116', outfile: join(output, 'store.js'),
  });
  server = createServer(async (req, res) => {
    if (req.url === '/store.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(await readFile(join(output, 'store.js')));
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>IndexedDB persistence</title><script type="module" src="/store.js"></script>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No storage test server address');
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.PERSONA_TEST_CHROMIUM ? { executablePath: process.env.PERSONA_TEST_CHROMIUM } : {}) });
});
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
});
beforeEach(async () => {
  await page?.context().close();
  page = await browser.newPage();
  await page.goto(url);
  await page.waitForFunction(() => !!window.indexedStoreTest);
});

describe('desktop IndexedDB persistence in Chromium', () => {
  it('stores assets larger than the localStorage quota and reads them after reopening', async () => {
    const result = await page.evaluate(async () => {
      const { Store } = window.indexedStoreTest;
      const first = new Store(localStorage, 'large-assets');
      await first.ready();
      const contents = 'x'.repeat(6 * 1024 * 1024);
      await first.set('avatar:large', { kind: 'image', contents });
      await first.set('settings', { activeProfileId: 'profile-large' });
      first.close();
      const reopened = new Store(localStorage, 'large-assets');
      const avatar = await reopened.get<{ contents: string }>('avatar:large');
      const settings = await reopened.get('settings');
      reopened.close();
      return { length: avatar?.contents.length, settings, legacyLength: localStorage.length };
    });
    expect(result).toEqual({ length: 6 * 1024 * 1024, settings: { activeProfileId: 'profile-large' }, legacyLength: 0 });
  });

  it('migrates existing profiles/settings/avatar keys once and preserves the legacy backup', async () => {
    const result = await page.evaluate(async () => {
      const { Store } = window.indexedStoreTest;
      localStorage.setItem('persona:desktop:settings', JSON.stringify({ userName: 'Tanguy' }));
      localStorage.setItem('persona:desktop:profiles', JSON.stringify({ custom: { name: 'Mousse' } }));
      localStorage.setItem('persona:desktop:avatar:custom', JSON.stringify({ kind: 'image', dataUrl: 'data:image/png;base64,AA==' }));
      localStorage.setItem('persona:desktop:welcome-done', '1');
      localStorage.setItem('unrelated', 'keep-me');
      const first = new Store(localStorage, 'legacy-migration');
      const migrated = await first.getMany(['settings', 'profiles', 'avatar:custom', 'welcome-done']);
      await first.set('settings', { userName: 'Changed' });
      first.close();
      localStorage.setItem('persona:desktop:settings', '{not-json-anymore');
      const second = new Store(localStorage, 'legacy-migration');
      const updated = await second.get('settings');
      second.close();
      return { migrated, updated, backup: localStorage.getItem('persona:desktop:profiles'), unrelated: localStorage.getItem('unrelated') };
    });
    expect(result.migrated).toEqual({ settings: { userName: 'Tanguy' }, profiles: { custom: { name: 'Mousse' } }, 'avatar:custom': { kind: 'image', dataUrl: 'data:image/png;base64,AA==' } });
    expect(result.updated).toEqual({ userName: 'Changed' });
    expect(result.backup).toContain('Mousse');
    expect(result.unrelated).toBe('keep-me');
  });

  it('leaves a corrupt legacy migration uncommitted and retries after repair', async () => {
    const result = await page.evaluate(async () => {
      const { Store } = window.indexedStoreTest;
      localStorage.setItem('persona:desktop:settings', JSON.stringify({ userName: 'Tanguy' }));
      localStorage.setItem('persona:desktop:profiles', '{invalid');
      const first = new Store(localStorage, 'corrupt-migration');
      let failure = '';
      try { await first.ready(); } catch (error) { failure = String(error); }
      first.close();
      const backup = localStorage.getItem('persona:desktop:profiles');
      localStorage.setItem('persona:desktop:profiles', JSON.stringify({ restored: true }));
      const second = new Store(localStorage, 'corrupt-migration');
      const migrated = await second.getMany(['settings', 'profiles']);
      second.close();
      return { failure, backup, migrated };
    });
    expect(result.failure).toContain('profiles');
    expect(result.backup).toBe('{invalid');
    expect(result.migrated).toEqual({ settings: { userName: 'Tanguy' }, profiles: { restored: true } });
  });

  it('does not overwrite existing database values when migrating a legacy installation', async () => {
    const result = await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('migration-conflict', 1);
        request.onupgradeneeded = () => { request.result.createObjectStore('kv'); };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('kv', 'readwrite');
          transaction.objectStore('kv').put({ userName: 'Already migrated' }, 'settings');
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
      localStorage.setItem('persona:desktop:settings', JSON.stringify({ userName: 'Old copy' }));
      localStorage.setItem('persona:desktop:profiles', JSON.stringify({ imported: true }));
      const store = new window.indexedStoreTest.Store(localStorage, 'migration-conflict');
      const values = await store.getMany(['settings', 'profiles']);
      store.close();
      return values;
    });
    expect(result).toEqual({ settings: { userName: 'Already migrated' }, profiles: { imported: true } });
  });

  it('keeps CRUD operations isolated, reports failed writes and rejects calls after close', async () => {
    const result = await page.evaluate(async () => {
      const store = new window.indexedStoreTest.Store(localStorage, 'crud');
      await store.set('a', { value: 1 });
      await store.set('b', [2]);
      let writeFailure = '';
      try { await store.set('bad', () => {}); } catch (error) { writeFailure = String(error); }
      await store.remove('a');
      const data = await store.getMany(['a', 'b', 'bad', 'missing']);
      store.close();
      let closedFailure = '';
      try { await store.get('b'); } catch (error) { closedFailure = String(error); }
      return { data, writeFailure, closedFailure };
    });
    expect(result.data).toEqual({ b: [2] });
    expect(result.writeFailure).toContain('DataCloneError');
    expect(result.closedFailure).toContain('fermé');
  });
});
