import { importAvatarFiles, MAX_FILE_BYTES, type ImportResult } from '../../core/avatar/importer';
import { LocalProfileGenerator } from '../../core/profile/generator';
import { KEYS, type Repository } from '../../core/settings/store';
import { createAvatarView, type AvatarView } from '../../stage/avatarView';
import type { DesktopBridge } from './desktop';

export const WELCOME_KEY = 'persona:desktop:welcome-done';

export function createLauncher(repo: Repository, bridge: DesktopBridge, activate: () => Promise<void>) {
  const panel = document.querySelector<HTMLElement>('#launcher')!;
  const form = document.querySelector<HTMLFormElement>('#avatar-form')!;
  const input = document.querySelector<HTMLInputElement>('#avatar-file')!;
  const name = document.querySelector<HTMLInputElement>('#avatar-name')!;
  const description = document.querySelector<HTMLTextAreaElement>('#avatar-description')!;
  const status = document.querySelector<HTMLElement>('#avatar-status')!;
  const create = document.querySelector<HTMLButtonElement>('#avatar-create')!;
  const drop = document.querySelector<HTMLElement>('#avatar-drop')!;
  let imported: ImportResult | undefined;
  let preview: AvatarView | undefined;
  let busy = false;
  let reading = false;
  let revision = 0;
  const cleanups: (() => void)[] = [];
  const on = (target: EventTarget, type: string, fn: EventListener) => {
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  };
  const message = (text: string, error = false) => {
    status.textContent = text;
    status.dataset.error = error ? '1' : '';
  };
  const attempt = (fn: () => Promise<void>) => { void fn().catch((e) => message(String(e), true)); };
  const close = async () => {
    await bridge.invoke('set_launcher_open', { open: false });
    panel.hidden = true;
  };
  const play = async (id: string) => {
    await repo.saveSettings({ activeProfileId: id, enabled: true });
    await activate();
    localStorage.setItem(WELCOME_KEY, '1');
    await close();
  };
  const open = async () => {
    const profiles = await repo.listProfiles();
    const list = document.querySelector('#character-list')!;
    list.replaceChildren(...profiles.map((profile) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `▶ ${profile.name}`;
      button.addEventListener('click', () => { if (!busy) attempt(() => play(profile.id)); });
      return button;
    }));
    await bridge.invoke('set_launcher_open', { open: true });
    panel.hidden = false;
    document.querySelector<HTMLElement>('#launcher-close')!.focus();
  };
  const load = async (files: File[]) => {
    if (busy) return;
    const current = ++revision;
    imported = undefined;
    create.disabled = true;
    preview?.destroy();
    document.querySelector('#avatar-preview')!.replaceChildren();
    if (files.length !== 1) {
      reading = false;
      message('Choisissez une seule image. La création IA à partir de plusieurs vues n’est pas encore connectée.', true);
      return;
    }
    reading = true;
    message('Préparation de votre image…');
    try {
      const file = files[0]!;
      if (file.size > MAX_FILE_BYTES) throw new Error('Image trop grande : 8 Mo maximum.');
      const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
      const dataUrl = svg ? undefined : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Impossible de lire cette image.'));
        reader.readAsDataURL(file);
      });
      const result = await importAvatarFiles([{ name: file.name, mime: file.type, size: file.size, dataUrl, text: svg ? await file.text() : undefined }], {
        imageSize: (url) => new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error('Cette image est illisible.'));
          img.src = url;
        }),
      });
      if (current !== revision) return;
      imported = result;
      preview = createAvatarView(result.avatar, document);
      document.querySelector('#avatar-preview')!.append(preview.el);
      if (!name.value.trim()) name.value = result.avatar.name;
      message(result.warnings.join(' ') || 'Image prête. Votre compagnon utilisera des mouvements simples, sans génération IA.');
      create.disabled = false;
    } catch (error) {
      if (current === revision) message(String(error), true);
    } finally {
      if (current === revision) reading = false;
    }
  };
  on(input, 'change', () => attempt(() => load(Array.from(input.files ?? []))));
  on(drop, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  }) as EventListener);
  on(drop, 'dragover', (event) => { event.preventDefault(); });
  on(drop, 'drop', ((event: DragEvent) => {
    event.preventDefault();
    attempt(() => load(Array.from(event.dataTransfer?.files ?? [])));
  }) as EventListener);
  // Prevent the WebView from navigating to a dropped file outside the target.
  on(window, 'dragover', (event) => { event.preventDefault(); });
  on(window, 'drop', (event) => { event.preventDefault(); });
  on(form, 'submit', (event) => {
    event.preventDefault();
    if (!imported || reading || busy || !name.value.trim()) return;
    const avatar = imported.avatar;
    busy = true;
    create.disabled = true;
    attempt(async () => {
      try {
        const generated = await new LocalProfileGenerator().generate({ name: name.value, description: description.value, language: 'fr' });
        generated.profile.avatarId = avatar.id;
        await repo.saveAvatar(avatar);
        try { await repo.saveProfile(generated.profile); }
        catch (error) { await repo.store.remove(KEYS.avatar(avatar.id)); throw error; }
        await play(generated.profile.id);
        message('Compagnon enregistré sur ce PC.');
      } finally { busy = false; create.disabled = false; }
    });
  });
  on(document.querySelector('#launcher-close')!, 'click', () => attempt(close));
  on(document.querySelector('#launcher-quit')!, 'click', () => attempt(async () => { await bridge.invoke('quit_app'); }));
  return { panel, open, close, destroy() { ++revision; preview?.destroy(); for (const cleanup of cleanups) cleanup(); } };
}
