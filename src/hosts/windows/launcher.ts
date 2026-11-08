import { normalizeSourceUrls } from '../../core/profile/persona';
import { fileKind, MAX_FILE_BYTES, type ImportFile } from '../../core/avatar/importer';
import { createCompanion, exportCompanionPack, MAX_REFERENCES, MAX_REFERENCE_BYTES, prepareReferences, type PreparedReference } from '../../core/creation/character';
import { LocalProfileGenerator } from '../../core/profile/generator';
import type { Repository } from '../../core/settings/store';
import { createAvatarView, type AvatarView } from '../../stage/avatarView';
import type { DesktopBridge } from './desktop';

export const WELCOME_KEY = 'persona:desktop:welcome-done';

export function createLauncher(repo: Repository, bridge: DesktopBridge, activate: () => Promise<void>) {
  const panel = document.querySelector<HTMLElement>('#launcher')!;
  const form = document.querySelector<HTMLFormElement>('#avatar-form')!;
  const input = document.querySelector<HTMLInputElement>('#avatar-file')!;
  const name = document.querySelector<HTMLInputElement>('#avatar-name')!;
  const sources = document.querySelector<HTMLTextAreaElement>('#avatar-sources')!;
  const universe = document.querySelector<HTMLInputElement>('#avatar-universe')!;
  const description = document.querySelector<HTMLTextAreaElement>('#avatar-description')!;
  const status = document.querySelector<HTMLElement>('#avatar-status')!;
  const create = document.querySelector<HTMLButtonElement>('#avatar-create')!;
  const drop = document.querySelector<HTMLElement>('#avatar-drop')!;
  let references: { prepared: PreparedReference; bytes: number }[] = [];
  let primaryIndex = 0;
  let views: AvatarView[] = [];
  let preview: AvatarView | undefined;
  let busy = false;
  let reading = false;
  let revision = 0;
  let profileRevision = 0;
  let createdProfileId: string | undefined;
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
  const updateControls = () => {
    create.disabled = !references.length || reading || busy;
    for (const field of form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>('input,textarea,button')) {
      if (field !== create) field.disabled = busy;
    }
  };
  const close = async () => {
    if (busy) return;
    await bridge.invoke('set_launcher_open', { open: false });
    panel.hidden = true;
  };
  const play = async (id: string) => {
    await repo.saveSettings({ activeProfileId: id, enabled: true });
    await activate();
    localStorage.setItem(WELCOME_KEY, '1');
    await bridge.invoke('set_launcher_open', { open: false });
    panel.hidden = true;
  };
  const open = async () => {
    const profiles = await repo.listProfiles();
    const list = document.querySelector('#character-list')!;
    list.replaceChildren(...profiles.map((profile) => {
      const row = document.createElement('div');
      row.className = 'character-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `▶ ${profile.name}`;
      button.addEventListener('click', () => {
        if (busy || reading) return;
        busy = true; updateControls();
        attempt(async () => { try { await play(profile.id); } finally { busy = false; updateControls(); } });
      });
      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.className = 'secondary';
      exportButton.textContent = `Exporter ${profile.name} pour Chrome`;
      exportButton.addEventListener('click', () => attempt(async () => {
        const pack = await exportCompanionPack(repo, profile.id);
        const url = URL.createObjectURL(new Blob([JSON.stringify(pack)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${profile.name.replace(/[^\p{L}\p{N}_-]/gu, '_')}.persona.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        message('Enregistrez le pack, puis dans Chrome : Personnages et réglages → Importer. Aucun transfert automatique.');
      }));
      row.append(button, exportButton);
      if (profile.universe) {
        const label = document.createElement('small'); label.textContent = profile.universe; row.append(label);
      }
      return row;
    }));
    await bridge.invoke('set_launcher_open', { open: true });
    panel.hidden = false;
    document.querySelector<HTMLElement>('#launcher-close')!.focus();
  };
  const showProfile = async () => {
    const current = ++profileRevision;
    const generated = await new LocalProfileGenerator().generate({ name: name.value, description: description.value, language: 'fr' });
    if (current !== profileRevision) return;
    const tone = { cheerful: 'enjoué', calm: 'calme', playful: 'espiègle', shy: 'timide', grumpy: 'ronchon' }[generated.profile.tone];
    document.querySelector('#profile-preview')!.textContent = `${generated.profile.name}${universe.value.trim() ? ` · ${universe.value.trim()}` : ''} · Français · Ton ${tone}. Identité non vérifiée. Réglage local provisoire, sans analyse des images ni consultation des liens.`;
  };
  const render = () => {
    for (const view of views) view.destroy();
    views = [];
    preview?.destroy();
    const list = document.querySelector('#reference-list')!;
    list.replaceChildren(...references.map(({ prepared }, index) => {
      const card = document.createElement('div'); card.className = 'reference';
      card.dataset.primary = index === primaryIndex ? '1' : '';
      const thumbnail = document.createElement('div'); thumbnail.className = 'thumb';
      const view = createAvatarView(prepared.avatar, document); views.push(view); thumbnail.append(view.el);
      const title = document.createElement('div'); title.className = 'reference-name'; title.textContent = prepared.name; title.title = prepared.name;
      const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = index === primaryIndex ? 'Vue principale' : 'Choisir cette vue'; choose.setAttribute('aria-pressed', String(index === primaryIndex));
      choose.addEventListener('click', () => {
        if (busy || reading) return;
        primaryIndex = index; createdProfileId = undefined; render();
        message('Vue principale modifiée. Toutes vos références seront conservées localement.');
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Retirer'; remove.setAttribute('aria-label', `Retirer ${prepared.name}`);
      remove.addEventListener('click', () => {
        if (busy || reading) return;
        references.splice(index, 1);
        if (index < primaryIndex) primaryIndex--;
        else if (index === primaryIndex) primaryIndex = Math.min(index, references.length - 1);
        primaryIndex = Math.max(0, primaryIndex); createdProfileId = undefined; render();
        message(`${references.length} référence(s). Choisissez une image principale pour le mode instantané.`);
      });
      card.append(thumbnail, title, choose, remove); return card;
    }));
    const area = document.querySelector('#avatar-preview')!;
    area.replaceChildren();
    const selected = references[primaryIndex]?.prepared;
    if (selected) { preview = createAvatarView(selected.avatar, document); area.append(preview.el); }
    updateControls();
    attempt(showProfile);
  };
  const load = async (files: File[]) => {
    if (busy || !files.length) return;
    const current = ++revision;
    reading = true; updateControls();
    message('Préparation locale de vos références…');
    try {
      if (references.length + files.length > MAX_REFERENCES) throw new Error('10 images maximum. Retirez une référence avant d’en ajouter.');
      if (references.reduce((sum, r) => sum + r.bytes, 0) + files.reduce((sum, f) => sum + f.size, 0) > MAX_REFERENCE_BYTES) throw new Error('32 Mo maximum pour l’ensemble des références.');
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) throw new Error(`« ${file.name} » dépasse 8 Mo.`);
        if (!['raster', 'svg'].includes(fileKind(file.name, file.type))) throw new Error(`« ${file.name} » : choisissez une image PNG, JPEG, WebP, GIF ou SVG.`);
      }
      const loaded: ImportFile[] = [];
      // Read and decode sequentially to bound peak memory for ten images.
      for (const file of files) {
        const svg = fileKind(file.name, file.type) === 'svg';
        const dataUrl = svg ? undefined : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Impossible de lire cette image.')); reader.readAsDataURL(file);
        });
        loaded.push({ name: file.name, mime: file.type, size: file.size, dataUrl, text: svg ? await file.text() : undefined });
      }
      const prepared = await prepareReferences(loaded, {
        imageSize: (url) => new Promise((resolve, reject) => {
          const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => reject(new Error('Une image est illisible. Les références précédentes sont conservées.')); img.src = url;
        }),
      });
      if (current !== revision) return;
      references.push(...prepared.map((reference, index) => ({ prepared: reference, bytes: files[index]!.size })));
      createdProfileId = undefined; render();
      const warnings = prepared.flatMap((ref) => ref.warnings);
      message(`${references.length} référence(s) prête(s). L’image principale bougera en entier ; les autres vues seront conservées.${warnings.length ? ` ${warnings.join(' ')}` : ''}`);
    } catch (error) { if (current === revision) message(String(error), true); }
    finally { if (current === revision) { reading = false; updateControls(); input.value = ''; } }
  };
  on(document.querySelector('#avatar-browse')!, 'click', () => input.click());
  on(input, 'change', () => attempt(() => load(Array.from(input.files ?? []))));
  on(drop, 'keydown', ((event: KeyboardEvent) => {
    if (event.target === drop && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); input.click(); }
  }) as EventListener);
  on(drop, 'dragover', (event) => { event.preventDefault(); drop.dataset.drag = '1'; });
  on(drop, 'dragleave', () => { delete drop.dataset.drag; });
  on(drop, 'drop', ((event: DragEvent) => {
    event.preventDefault(); delete drop.dataset.drag; attempt(() => load(Array.from(event.dataTransfer?.files ?? [])));
  }) as EventListener);
  on(window, 'dragover', (event) => { event.preventDefault(); });
  on(window, 'drop', (event) => { event.preventDefault(); });
  for (const field of [name, universe, description, sources]) on(field, 'input', () => { createdProfileId = undefined; attempt(showProfile); });
  on(form, 'submit', (event) => {
    event.preventDefault();
    if (!references.length || reading || busy) return;
    busy = true; updateControls();
    attempt(async () => {
      try {
        if (!createdProfileId) {
          const profile = await createCompanion(repo, { references: references.map((r) => r.prepared), primaryIndex, name: name.value, universe: universe.value, description: description.value, sourceUrls: normalizeSourceUrls(sources.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) });
          createdProfileId = profile.id;
        }
        await play(createdProfileId);
        message('Compagnon enregistré sur ce PC.');
      } finally { busy = false; updateControls(); }
    });
  });
  on(document.querySelector('#launcher-close')!, 'click', () => attempt(close));
  on(document.querySelector('#launcher-quit')!, 'click', () => attempt(async () => { await bridge.invoke('quit_app'); }));
  return { panel, open, close, destroy() { ++revision; ++profileRevision; preview?.destroy(); for (const view of views) view.destroy(); for (const cleanup of cleanups) cleanup(); } };
}
