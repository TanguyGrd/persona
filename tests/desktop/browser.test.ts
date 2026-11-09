import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Server } from 'node:http';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import type { ImportResult } from '../../src/core/avatar/importer';
import type { AvatarAsset } from '../../src/core/avatar/types';

interface Call { command: string; args?: Record<string, unknown> }
interface Harness {
  calls: Call[];
  responses: Record<string, unknown>;
  failures: Record<string, string>;
  queues: Record<string, unknown[]>;
  emit(event: string): void;
  stop: () => void;
  importPack(pack: unknown): Promise<ImportResult>;
  renderWalk(avatar: AvatarAsset): void;
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
        import {importAvatarFiles} from './src/core/avatar/importer';
        import {createAvatarView} from './src/stage/avatarView';
        const handlers=new Map(),pending=new Map();
        window.desktopHarness={calls:[],responses:{},failures:{},queues:{},emit(event){handlers.get(event)?.();},stop(){},
          renderWalk(avatar){const view=createAvatarView(avatar);view.el.id='walk-render-test';document.body.append(view.el);view.setClip('walk');},
          importPack(pack){return importAvatarFiles([{name:'companion.persona.json',mime:'application/json',size:JSON.stringify(pack).length,text:JSON.stringify(pack)}],{imageSize:async()=>({w:128,h:128})});}};
        const bridge={
          async invoke(command,args){
            window.desktopHarness.calls.push({command,args});
            if(command==='agent_cancel'){pending.get(args.requestId)?.(new Error('Stopped simulated request'));return;}
            if(window.desktopHarness.failures[command])throw new Error(window.desktopHarness.failures[command]);
            if(command==='agent_step'&&window.desktopHarness.responses.agent_step==='wait')return new Promise((resolve,reject)=>pending.set(args.requestId,reject));
            const queue=window.desktopHarness.queues[command];if(queue?.length)return queue.shift();
            return window.desktopHarness.responses[command];
          },
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
  const video = process.env.PERSONA_RECORD_AGENT_DEMO ? page?.video() : undefined;
  await page?.context().close();
  if (video) await video.saveAs(join(root, 'test-results', 'v04-agent-demo.webm'));
  await browser?.close();
  if (server) await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
});

beforeEach(async () => {
  await page?.context().close();
  const context = await browser.newContext({ viewport: { width: process.env.PERSONA_RECORD_AGENT_DEMO ? 480 : 360, height: process.env.PERSONA_RECORD_AGENT_DEMO ? 720 : 320 }, locale: 'fr-FR', ...(process.env.PERSONA_RECORD_AGENT_DEMO ? { recordVideo: { dir: join(root, 'test-results', 'agent-demo'), size: { width: 480, height: 720 } } } : {}) });
  await context.addInitScript(() => { if (!localStorage.getItem('persona:desktop:welcome-done')) localStorage.setItem('persona:desktop:welcome-done', '1'); });
  page = await context.newPage();
  await page.goto(url);
  await expect.poll(() => commands()).toContain('desktop_ready');
});
const hit = () => page.locator('persona-companion .pc-hit');
const actor = () => page.locator('persona-companion .pc-actor');
const commands = () => page.evaluate(() => window.desktopHarness.calls.map((call) => call.command));
const emit = (event: string) => page.evaluate((e) => window.desktopHarness.emit(e), event);
async function stored<T>(key: string): Promise<T | undefined> {
  return page.evaluate((name) => new Promise((resolve, reject) => {
    const request = indexedDB.open('persona-desktop');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('kv', 'readonly');
      const read = transaction.objectStore('kv').get(name);
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
      transaction.oncomplete = () => db.close();
    };
  }), key) as Promise<T | undefined>;
}
async function referenceFiles() {
  return [
    { name: 'face.png', mimeType: 'image/png', buffer: await readFile(join(root, 'assets/icons/icon-128.png')) },
    { name: 'profil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120"><ellipse cx="40" cy="70" rx="24" ry="40" fill="#e7b45b"/><circle cx="51" cy="40" r="17" fill="#ffe6ab"/><circle cx="57" cy="37" r="3" fill="#213c32"/></svg>') },
    { name: 'dos.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120"><rect x="18" y="40" width="44" height="68" rx="20" fill="#b59adc"/><circle cx="40" cy="28" r="22" fill="#725aa2"/></svg>') },
  ];
}
async function openWorkshop() {
  await page.setViewportSize({ width: 980, height: 760 });
  await emit('desktop-menu');
  await expect.poll(() => page.locator('#launcher').isVisible()).toBe(true);
}

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

  it('creates from three references, selects a main view and keeps the full profile after restart', async () => {
    await page.context().close();
    const recording = await browser.newContext({
      viewport: { width: 980, height: 760 }, locale: 'fr-FR',
      ...(process.env.PERSONA_RECORD_DEMO ? { recordVideo: { dir: join(root, 'test-results', 'phase1-demo'), size: { width: 980, height: 760 } } } : {}),
    });
    page = await recording.newPage();
    const video = page.video();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Presentation holds are opt-in for the demo; assertions establish test readiness.
    const hold = async () => { if (process.env.PERSONA_RECORD_DEMO) await page.waitForTimeout(1200); };
    try {
      await page.goto(url);
      await expect.poll(() => page.locator('#launcher').isVisible()).toBe(true);
      await hold();
      await page.locator('#avatar-file').setInputFiles(await referenceFiles());
      await expect.poll(() => page.locator('#reference-list .reference').count()).toBe(3);
      await page.locator('#reference-list .reference').nth(1).getByRole('button', { name: 'Choisir cette vue' }).click();
      await expect.poll(() => page.locator('#reference-list .reference').nth(1).getAttribute('data-primary')).toBe('1');
      await page.locator('#identity-details summary').click();
      await page.locator('#avatar-name').fill('Mousse');
      await page.locator('#avatar-universe').fill('Le jardin des lucioles');
      await page.locator('#avatar-description').fill('Calme et curieux');
      await page.screenshot({ path: join(root, 'test-results', 'phase1-workshop-ready.png') });
      await page.locator('#launcher').evaluate((element) => { element.scrollTop = 0; });
      await page.screenshot({ path: join(root, 'test-results', 'phase1-workshop.png') });
      await hold();
      await page.locator('#avatar-create').click();
      await expect.poll(() => page.locator('#launcher').isVisible()).toBe(false);
      const settings = await stored<{ activeProfileId: string }>('settings');
      const profiles = await stored<Record<string, { name: string; universe?: string; avatarId: string; meta: { creation?: { referenceAvatarIds: string[] } } }>>('profiles');
      const profile = profiles?.[settings!.activeProfileId];
      expect(profile?.name).toBe('Mousse');
      expect(profile?.universe).toBe('Le jardin des lucioles');
      const references = profile?.meta.creation?.referenceAvatarIds ?? [];
      expect(references).toHaveLength(3);
      expect(profile?.avatarId).toBe(references[1]);
      if (process.env.PERSONA_RECORD_DEMO) { await settled(); await hold(); }
      for (const id of references) expect(await stored(`avatar:${id}`)).toBeDefined();
      await page.reload();
      await expect.poll(() => commands()).toContain('desktop_ready');
      expect(await hit().getAttribute('aria-label')).toContain('Mousse');
      await emit('desktop-menu');
      await expect.poll(() => page.getByRole('button', { name: '▶ Mousse' }).count()).toBe(1);
      const downloadReady = page.waitForEvent('download');
      await page.locator('#character-list .character-actions').filter({ has: page.getByRole('button', { name: '▶ Mousse' }) }).getByRole('button', { name: /Exporter/ }).click();
      const download = await downloadReady;
      const path = await download.path();
      if (!path) throw new Error('Exported pack download has no local path');
      const pack = JSON.parse(await readFile(path, 'utf8'));
      expect(pack.format).toBe('persona-pack');
      expect(pack.profile.universe).toBe('Le jardin des lucioles');
      const imported = await page.evaluate((value) => window.desktopHarness.importPack(value), pack);
      expect(imported.profile?.name).toBe('Mousse');
      expect(imported.references).toHaveLength(2);
      expect(imported.profile?.avatarId).toBe(imported.avatar.id);
      expect(imported.profile?.meta.creation?.referenceAvatarIds).toHaveLength(3);
      expect(await page.locator('#error').isVisible()).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      await recording.close();
      if (video) await video.saveAs(join(root, 'test-results', 'phase1-demo.webm'));
    }
  });

  it('allows an unnamed companion and removes an unneeded reference before saving', async () => {
    await openWorkshop();
    await page.locator('#avatar-file').setInputFiles(await referenceFiles());
    await expect.poll(() => page.locator('#reference-list .reference').count()).toBe(3);
    await page.getByRole('button', { name: 'Retirer profil.svg', exact: true }).click();
    expect(await page.locator('#reference-list .reference').count()).toBe(2);
    // No identity field is required for instant creation.
    expect(await page.locator('#avatar-name').isVisible()).toBe(false);
    await page.locator('#avatar-create').click();
    await expect.poll(() => page.locator('#launcher').isVisible()).toBe(false);
    const settings = await stored<{ activeProfileId: string }>('settings');
    const profiles = await stored<Record<string, { name: string; meta: { creation?: { referenceAvatarIds: string[] } } }>>('profiles');
    expect(profiles?.[settings!.activeProfileId]?.name).toBe('Compagnon');
    expect(profiles?.[settings!.activeProfileId]?.meta.creation?.referenceAvatarIds).toHaveLength(2);
  });

  it('accepts a valid dropped batch and rejects too many images without losing the draft', async () => {
    await openWorkshop();
    await page.locator('#avatar-drop').evaluate((element) => {
      const data = new DataTransfer();
      data.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="green"/></svg>'], 'face.svg', { type: 'image/svg+xml' }));
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    });
    await expect.poll(() => page.locator('#reference-list .reference').count()).toBe(1);
    const files = await referenceFiles();
    await page.locator('#avatar-file').setInputFiles(Array.from({ length: 11 }, (_, index) => ({ ...files[0]!, name: `reference-${index}.png` })));
    await expect.poll(() => page.locator('#avatar-status').getAttribute('data-error')).toBe('1');
    expect(await page.locator('#reference-list .reference').count()).toBe(1);
    expect(await page.locator('#avatar-create').isEnabled()).toBe(true);
  });

  it('does not replace a valid draft when one image in the new batch is invalid', async () => {
    await openWorkshop();
    const files = await referenceFiles();
    await page.locator('#avatar-file').setInputFiles([files[0]!]);
    await expect.poll(() => page.locator('#reference-list .reference').count()).toBe(1);
    await page.locator('#avatar-file').setInputFiles([files[1]!, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a real image') }]);
    await expect.poll(() => page.locator('#avatar-status').getAttribute('data-error')).toBe('1');
    expect(await page.locator('#reference-list .reference').count()).toBe(1);
    expect(await page.locator('#reference-list').textContent()).toContain('face.png');
    expect(await page.locator('#avatar-create').isEnabled()).toBe(true);
  });

  it('fits an extremely wide imported avatar inside the small desktop scene without cropping the saved image', async () => {
    await openWorkshop();
    await page.locator('#avatar-file').setInputFiles({
      name: 'wide.svg', mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 100"><rect width="2000" height="100" rx="25" fill="#a5d592"/></svg>'),
    });
    await expect.poll(() => page.locator('#avatar-create').isEnabled()).toBe(true);
    await page.locator('#avatar-create').click();
    await expect.poll(() => page.locator('#launcher').isVisible()).toBe(false);
    // IPC is mocked, so mimic the native return to the companion's small window.
    await page.setViewportSize({ width: 360, height: 320 });
    await settled();
    const bounds = await hit().boundingBox();
    if (!bounds) throw new Error('Wide avatar has no hit rectangle');
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.width).toBeLessThanOrEqual(220);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(320);
    await hit().hover();
    const actions = page.locator('persona-companion .pc-toolbar button');
    expect(await actions.count()).toBe(3);
    await expect.poll(() => actions.evaluateAll((elements) => elements.every((element) => {
      const rectangle = element.getBoundingClientRect();
      return rectangle.left >= 0 && rectangle.right <= innerWidth && rectangle.top >= 0 && rectangle.bottom <= innerHeight;
    }))).toBe(true);
    const settings = await stored<{ activeProfileId: string }>('settings');
    const profiles = await stored<Record<string, { avatarId: string }>>('profiles');
    const saved = await stored<{ svg: string }>(`avatar:${profiles![settings!.activeProfileId]!.avatarId}`);
    expect(saved?.svg).toContain('2000 100');
  });

  it('keeps identity optional, saves unverified user links and offers gauges plus an explicit Terry profile', async () => {
    await openWorkshop();
    expect(await page.locator('#avatar-name').isVisible()).toBe(false);
    await page.locator('#avatar-file').setInputFiles([(await referenceFiles())[0]!]);
    await expect.poll(() => page.locator('#avatar-create').isEnabled()).toBe(true);
    await page.screenshot({ path: join(root, 'test-results', 'v02-images-first.png') });
    await page.locator('#identity-details summary').click();
    await page.locator('#avatar-sources').fill('https://fr.wikipedia.org/wiki/Batman_Beyond');
    await page.locator('#avatar-create').click();
    await expect.poll(() => page.locator('#launcher').isVisible()).toBe(false);
    await emit('desktop-settings');
    await page.locator('[name="dialoguePreset"]').selectOption('terry');
    await page.locator('[name="scale"]').fill('125');
    await page.locator('[name="frequency"]').fill('2');
    await page.locator('[name="chattiness"]').fill('0');
    await page.locator('[name="desktopRoaming"]').uncheck();
    expect(await page.locator('#scale-value').textContent()).toBe('125 %');
    await page.screenshot({ path: join(root, 'test-results', 'v02-gauges.png') });
    await page.locator('#settings-form button[type="submit"]').click();
    await expect.poll(() => page.locator('#settings').isVisible()).toBe(false);
    expect(await hit().getAttribute('aria-label')).toContain('Terry McGinnis');
    const settings = await stored<{activeProfileId:string;desktopRoaming:boolean}>('settings');
    expect(settings!.desktopRoaming).toBe(false);
    const profiles = await stored<Record<string,{meta:{sourceUrls:string[];dialoguePreset:string}}>>('profiles');
    expect(profiles![settings!.activeProfileId]!.meta.sourceUrls).toEqual(['https://fr.wikipedia.org/wiki/Batman_Beyond']);
    expect(profiles![settings!.activeProfileId]!.meta.dialoguePreset).toBe('terry-mcginnis-fr@1');
    await page.reload(); await expect.poll(() => commands()).toContain('desktop_ready');
    await emit('desktop-settings');
    expect(await page.locator('[name="scale"]').inputValue()).toBe('125');
    expect(await page.locator('[name="frequency"]').inputValue()).toBe('2');
    expect(await page.locator('[name="chattiness"]').inputValue()).toBe('0');
  });

  it('does not request a window perch before explicit opt-in and pauses native movement while settings are open', async () => {
    await emit('desktop-settings');
    await page.locator('#perch').click();
    expect(await commands()).not.toContain('perch_companion');
    await page.locator('[name="windowPerching"]').check();
    await page.locator('#settings-form button[type="submit"]').click();
    await expect.poll(() => page.locator('#settings').isVisible()).toBe(false);
    await emit('desktop-settings');
    await expect.poll(() => page.evaluate(() => {
      const call=window.desktopHarness.calls.filter(c=>c.command==='configure_motion').at(-1);
      return (call?.args?.config as {paused:boolean}|undefined)?.paused;
    })).toBe(true);
    await page.locator('#perch').click();
    await expect.poll(() => commands()).toContain('perch_companion');
    await expect.poll(() => page.locator('#settings').isVisible()).toBe(false);
    expect(await page.locator('#error').isVisible()).toBe(false);
  });

  it('animates Pip and keeps a short click as a stage reaction, without native dragging', async () => {
    expect(await actor().getAttribute('data-activity')).toBe('entering');
    await settled();
    await hit().click();
    expect(await actor().getAttribute('data-activity')).toBe('react');
    expect(await commands()).not.toContain('start_dragging');
    await expect.poll(() => page.locator('#conversation').isVisible()).toBe(true);
    expect(await page.locator('#conversation-input').evaluate((element) => element === document.activeElement)).toBe(true);
    expect(await commands()).toContain('set_chat_open');
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
    expect(await page.locator('#conversation').isVisible()).toBe(false);
  });

  it('offers typed local commands, reports verified media results and refuses unsupported Discord tasks', async () => {
    await settled();
    await hit().click();
    await page.setViewportSize({ width: 420, height: 600 });
    await page.evaluate(() => { window.desktopHarness.responses.pause_media = { status: 'paused' }; });
    await page.locator('#conversation-input').fill('Mets la vidéo en pause');
    await page.locator('#conversation-input').press('Enter');
    await expect.poll(() => page.locator('#conversation-messages').textContent()).toContain('Windows confirme');
    expect((await commands()).filter((command) => command === 'pause_media')).toHaveLength(1);
    await page.screenshot({ path: join(root, 'test-results', 'v03-conversation.png') });
    await page.locator('#conversation-input').fill('Va sur Discord et dis à mes amis que j’arrive');
    await page.locator('#conversation-send').click();
    await expect.poll(() => page.locator('#conversation-messages').textContent()).toContain('Aucun appel ni message');
    await page.locator('#conversation-input').fill('<img src=x onerror=alert(1)>');
    await page.locator('#conversation-send').click();
    expect(await page.locator('#conversation-messages img').count()).toBe(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('#conversation').isVisible()).toBe(false);
    expect(await page.evaluate(() => window.desktopHarness.calls.filter(c => c.command === 'set_chat_open').at(-1)?.args)).toEqual({ open: false });
  });

  it('keeps media failures in the conversation without claiming success or blocking settings', async () => {
    await settled(); await hit().click();
    await page.setViewportSize({ width: 420, height: 600 });
    await page.evaluate(() => { window.desktopHarness.failures.pause_media = 'Lecteur indisponible'; });
    await page.getByRole('button', { name: '⏸ Mettre en pause' }).click();
    await expect.poll(() => page.locator('#conversation-messages').textContent()).toContain('L’action a échoué');
    expect(await page.locator('#error').isVisible()).toBe(false);
    await emit('desktop-settings');
    await expect.poll(() => page.locator('#settings').isVisible()).toBe(true);
    expect(await page.locator('#conversation').isVisible()).toBe(false);
  });

  it('runs the connected agent through model, native action and observed result, with a visible action journal', async () => {
    await page.evaluate(() => {
      window.desktopHarness.responses.agent_status = { state: 'ready', detail: 'Service simulé pour le test.' };
      window.desktopHarness.responses.agent_tool = { ok: true, summary: 'État Paused observé par le lecteur simulé.' };
      window.desktopHarness.queues.agent_step = [
        { text: 'Vérification demandée.', calls: [{ id: 'pause-model', name: 'media_pause', args: {} }] },
        { text: 'Le lecteur de test confirme la pause.', calls: [] },
      ];
    });
    await settled(); await hit().click(); await page.setViewportSize({ width: 480, height: 720 });
    await expect.poll(() => page.locator('#conversation-mode').textContent()).toBe('Conversation via Persona');
    if (process.env.PERSONA_RECORD_AGENT_DEMO) {
      await page.evaluate(() => { const label = document.createElement('p'); label.textContent = 'Démo de l’interface · IA et Windows simulés'; label.style.cssText = 'position:fixed;top:460px;left:12px;right:12px;text-align:center;font:11px system-ui;color:#527461;z-index:2147483647'; document.body.append(label); });
      await page.waitForTimeout(800);
      await page.locator('#conversation-input').pressSequentially('Tu peux mettre ma chanson en pause, s’il te plaît ?', { delay: 30 });
    } else await page.locator('#conversation-input').fill('Tu peux mettre ma chanson en pause, s’il te plaît ?');
    await page.locator('#conversation-input').press('Enter');
    await expect.poll(() => page.locator('#conversation-messages').textContent()).toContain('lecteur de test confirme');
    expect(await page.locator('#action-journal [data-state="success"]').count()).toBe(1);
    expect(await page.locator('#action-journal').textContent()).toContain('Paused observé');
    const calls = await page.evaluate(() => window.desktopHarness.calls.filter((call) => ['agent_step','agent_tool'].includes(call.command)));
    expect(calls.map((call) => call.command)).toEqual(['agent_step','agent_tool','agent_step']);
    expect(calls[2]?.args?.request).toMatchObject({ messages: expect.arrayContaining([expect.objectContaining({ role: 'tool', content: expect.stringContaining('Paused observé') })]) });
    expect(await commands()).not.toContain('pause_media');
    if (process.env.PERSONA_RECORD_AGENT_DEMO) await page.waitForTimeout(2200);
    await page.screenshot({ path: join(root, 'test-results', 'v04-connected-agent.png') });
    await expect.poll(() => page.evaluate(() => {
      const calls = window.desktopHarness.calls.filter((call) => call.command === 'set_hit_regions');
      const regions = calls.at(-1)?.args?.regions as { x: number; y: number; width: number; height: number }[] | undefined;
      return !!regions && !regions.some((r) => 24 >= r.x && 24 < r.x + r.width && 500 >= r.y && 500 < r.y + r.height);
    })).toBe(true);
  });

  it('executes a requested greeting in the existing animated stage even without a cloud service', async () => {
    await settled(); await hit().click(); await page.setViewportSize({ width: 480, height: 720 });
    await page.locator('#conversation-input').fill('Fais-moi un coucou');
    await page.locator('#conversation-send').click();
    await expect.poll(() => actor().getAttribute('data-activity')).toBe('wave');
    expect(await page.locator('persona-companion .pc-avatar').getAttribute('data-clip')).toBe('wave');
    await expect.poll(() => page.locator('#action-journal [data-state="success"]').count()).toBe(1);
    expect(await commands()).not.toContain('agent_tool');
    expect(await commands()).not.toContain('agent_step');
  });

  it('stops a pending model request with the stop button and with the native global-stop event', async () => {
    await page.evaluate(() => { window.desktopHarness.responses.agent_status = { state: 'ready', detail: 'Simulated service.' }; window.desktopHarness.responses.agent_step = 'wait'; });
    await settled(); await hit().click(); await page.setViewportSize({ width: 480, height: 720 });
    await expect.poll(() => page.locator('#conversation-mode').textContent()).toBe('Conversation via Persona');
    await page.locator('#conversation-input').fill('Bonjour'); await page.locator('#conversation-send').click();
    await expect.poll(() => commands()).toContain('agent_step');
    await page.locator('#conversation-stop').click();
    await expect.poll(() => commands()).toContain('agent_cancel');
    await expect.poll(() => page.locator('#conversation-send').isEnabled()).toBe(true);
    await page.locator('#conversation-input').fill('Nouvelle demande'); await page.locator('#conversation-send').click();
    await expect.poll(async () => (await commands()).filter((command) => command === 'agent_step').length).toBe(2);
    await emit('agent-stop');
    await expect.poll(() => page.locator('#conversation-send').isEnabled()).toBe(true);
    expect((await commands()).filter((command) => command === 'agent_cancel')).toHaveLength(2);
    expect(await commands()).not.toContain('agent_tool');
    expect(await page.locator('#conversation-messages').textContent()).toContain('Tâche arrêtée');
  });

  it('rejects a model tool outside the allowlist and still supports local app opening when the service is unavailable', async () => {
    await page.evaluate(() => { window.desktopHarness.responses.agent_status = { state: 'ready', detail: 'Simulated service.' }; window.desktopHarness.responses.agent_step = { text: 'Opening.', calls: [{ id: 'unsafe', name: 'shell', args: { command: 'anything' } }] }; });
    await settled(); await hit().click(); await page.setViewportSize({ width: 480, height: 720 });
    await expect.poll(() => page.locator('#conversation-mode').textContent()).toBe('Conversation via Persona');
    await page.locator('#conversation-input').fill('Fais une action'); await page.locator('#conversation-send').click();
    await expect.poll(() => page.locator('#conversation-messages').textContent()).toContain('Outil indisponible');
    expect(await commands()).not.toContain('agent_tool');
    await page.evaluate(() => { window.desktopHarness.responses.agent_status = { state: 'unavailable', detail: 'Service absent dans ce test.' }; window.desktopHarness.responses.agent_tool = { ok: true, summary: 'Demande d’ouverture acceptée par Windows (simulé). Aucun appel lancé.' }; });
    await page.locator('#service-connection summary').click();
    await page.locator('#connection-refresh').click();
    await expect.poll(() => page.locator('#conversation-mode').textContent()).toContain('Commandes locales');
    await page.getByRole('button', { name: 'Discord', exact: true }).click();
    await expect.poll(() => page.locator('#conversation-messages').textContent()).toContain('Aucun appel lancé');
    expect(await page.evaluate(() => window.desktopHarness.calls.filter((call) => call.command === 'agent_tool').at(-1)?.args)).toMatchObject({ call: { name: 'open_application', args: { application: 'discord' } } });
  });

  it('pairs a device using a one-time service code without exposing a provider-key field', async () => {
    await page.evaluate(() => { window.desktopHarness.responses.agent_status = { state: 'notPaired', detail: 'Code de connexion requis.' }; });
    await settled(); await hit().click(); await page.setViewportSize({ width: 480, height: 720 });
    await page.locator('#service-connection summary').click();
    await page.locator('#connection-code').fill('fixture-pairing-code');
    await page.evaluate(() => { window.desktopHarness.responses.agent_status = { state: 'ready', detail: 'Connecté au service simulé.' }; });
    await page.getByRole('button', { name: 'Connecter cet appareil', exact: true }).click();
    await expect.poll(() => page.locator('#conversation-mode').textContent()).toBe('Conversation via Persona');
    expect(await page.locator('#connection-code').inputValue()).toBe('');
    expect(await page.locator('input[type="password"]').count()).toBe(0);
    expect(await page.locator('#connection-status').textContent()).not.toContain('fixture-pairing-code');
    expect(await commands()).toContain('agent_pair');
  });

  it('reads replies only after voice opt-in and cancels the simulated system voice on the stop event', async () => {
    await page.addInitScript(() => {
      const state = { spoken: [] as string[], cancelled: 0 };
      (window as unknown as { voiceHarness: typeof state }).voiceHarness = state;
      class Utterance { lang = ''; text: string; onstart?: () => void; onend?: () => void; onerror?: () => void; constructor(text: string) { this.text = text; } }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [], cancel: () => { state.cancelled++; }, speak: (utterance: Utterance) => { state.spoken.push(utterance.text); utterance.onstart?.(); } } });
    });
    await page.reload(); await expect.poll(() => commands()).toContain('desktop_ready');
    await page.evaluate(() => { window.desktopHarness.responses.agent_status = { state: 'ready', detail: 'Simulated service.' }; window.desktopHarness.responses.agent_step = { text: 'Bonjour, je reste dans le coin.', calls: [] }; });
    await settled(); await hit().click(); await page.setViewportSize({ width: 480, height: 720 });
    await expect.poll(() => page.locator('#conversation-mode').textContent()).toBe('Conversation via Persona');
    expect(await page.locator('#conversation-voice').isChecked()).toBe(false);
    await page.locator('#conversation-input').fill('Bonjour'); await page.locator('#conversation-send').click();
    await expect.poll(() => page.locator('#conversation-send').isEnabled()).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { voiceHarness: { spoken: string[] } }).voiceHarness.spoken)).toEqual([]);
    await page.locator('#conversation-voice').check();
    await page.locator('#conversation-input').fill('Redis-moi bonjour'); await page.locator('#conversation-send').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { voiceHarness: { spoken: string[] } }).voiceHarness.spoken.length)).toBe(1);
    await expect.poll(() => page.locator('persona-companion .pc-avatar').getAttribute('data-mouth')).toBe('open');
    const before = await page.evaluate(() => (window as unknown as { voiceHarness: { cancelled: number } }).voiceHarness.cancelled);
    await emit('agent-stop');
    expect(await page.evaluate(() => (window as unknown as { voiceHarness: { cancelled: number } }).voiceHarness.cancelled)).toBeGreaterThan(before);
    expect(await page.locator('persona-companion .pc-avatar').getAttribute('data-mouth')).toBeNull();
  });

  it('imports an existing walk animation, persists its clips and renders changing transparent frames', async () => {
    await openWorkshop();
    await page.locator('#animation-import summary').click();
    const imageData = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32;
      const context = canvas.getContext('2d')!;
      // Distinct test poses with transparent margins; no third-party artwork.
      context.fillStyle = 'red'; context.fillRect(4, 4, 12, 24);
      context.fillStyle = 'blue'; context.fillRect(40, 8, 16, 20);
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    await page.locator('#animation-file').setInputFiles([
      { name: 'walk.png', mimeType: 'image/png', buffer: Buffer.from(imageData, 'base64') },
      { name: 'walk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'persona-spritesheet', frameWidth: 32, frameHeight: 32, animations: { idle: [0], walk: { frames: [0, 1], fps: 5 } } })) },
    ]);
    await expect.poll(() => page.locator('#launcher').isVisible()).toBe(false);
    const settings = await stored<{ activeProfileId: string }>('settings');
    const profiles = await stored<Record<string, { avatarId: string }>>('profiles');
    const avatar = await stored<AvatarAsset>(`avatar:${profiles![settings!.activeProfileId]!.avatarId}`);
    expect(avatar).toMatchObject({ kind: 'spritesheet', clips: { walk: { frames: [0, 1], fps: 5 } } });
    await page.evaluate((asset) => window.desktopHarness.renderWalk(asset!), avatar);
    const canvas = page.locator('#walk-render-test canvas');
    await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => Array.from(el.getContext('2d')!.getImageData(8, 8, 1, 1).data))).toEqual([255, 0, 0, 255]);
    await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => Array.from(el.getContext('2d')!.getImageData(12, 12, 1, 1).data)), { interval: 30 }).toEqual([0, 0, 255, 255]);
    expect(await canvas.evaluate((el: HTMLCanvasElement) => el.getContext('2d')!.getImageData(0, 0, 1, 1).data[3])).toBe(0);
    expect(await page.locator('#error').isVisible()).toBe(false);
  });

  it('sends a native hide and restores the stage when the tray emits show; quit has its own IPC', async () => {
    await settled();
    await hit().hover();
    await page.locator('persona-companion [data-action="hide"]').click();
    await expect.poll(() => commands()).toContain('hide_companion');
    await expect.poll(() => actor().isVisible(), { timeout: 4000 }).toBe(false);
    expect(await page.evaluate(() => window.desktopHarness.calls.filter(c => c.command === 'configure_motion').every(c => { const config=c.args?.config as {actorWidth:number;actorHeight:number}; return config.actorWidth>0 && config.actorHeight>0; }))).toBe(true);
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
    await page.locator('[name="scale"]').fill('125');
    await page.locator('[name="reduceMotion"]').selectOption('on');
    await page.locator('#settings-form button[type="submit"]').click();
    await expect.poll(() => page.locator('#settings').isVisible()).toBe(false);
    await page.reload();
    await expect.poll(() => commands()).toContain('desktop_ready');
    await emit('desktop-settings');
    expect(await page.locator('[name="userName"]').inputValue()).toBe('Tanguy');
    expect(await page.locator('[name="scale"]').inputValue()).toBe('125');
    expect(await page.locator('[name="activeProfileId"]').inputValue()).toBe('builtin:pip');
    await page.locator('#close-settings').click();
    expect(await page.locator('persona-companion').count()).toBe(1);
    expect(await page.locator('#error').isVisible()).toBe(false);
    expect(errors).toEqual([]);
  });

  it('exposes corrupt legacy state on initial migration and requests a visible native window', async () => {
    const fresh = await browser.newContext({ viewport: { width: 360, height: 320 } });
    try {
      await fresh.addInitScript(() => localStorage.setItem('persona:desktop:settings', '{corrupted'));
      const broken = await fresh.newPage();
      await broken.goto(url);
      await expect.poll(() => broken.locator('#error').isVisible()).toBe(true);
      expect(await broken.locator('#error').textContent()).toContain('Persona');
      await expect.poll(() => broken.evaluate(() => window.desktopHarness.calls.map((call) => call.command))).toContain('desktop_ready');
      expect(await broken.locator('persona-companion').count()).toBe(0);
      const regions = await broken.evaluate(() => window.desktopHarness.calls.find((call) => call.command === 'set_hit_regions')?.args?.regions);
      expect(regions).toEqual([{ x: 0, y: 0, width: 360, height: 320 }]);
    } finally { await fresh.close(); }
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
