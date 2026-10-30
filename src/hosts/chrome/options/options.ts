import { CachedProfileGenerator, LocalProfileGenerator } from '../../../core/profile/generator';
import { composeLine } from '../../../core/profile/speech';
import { newId, normalizeProfile } from '../../../core/profile/validate';
import { ENTRANCES, LANGUAGES, SPEECH_KINDS, TIME_SLOTS, TONES, type CharacterProfile, type Language, type PhraseOverrides, type SpeechKind } from '../../../core/profile/types';
import { exportPack, importAvatarFiles, fileKind, type ImportFile } from '../../../core/avatar/importer';
import type { AvatarAsset } from '../../../core/avatar/types';
import { DEFAULT_SETTINGS, normalizeHost, type Settings } from '../../../core/settings/settings';
import { dataUrlToBlob } from '../../../stage/avatarView';
import { BUILTIN_PROFILES } from '../../../../characters';
import { chromeStore, repo } from '../chromeStore';
import { avatarPreview, h, LANG_LABEL, SOURCE_LABEL, TONE_LABEL } from '../ui';

const $ = (id: string) => document.getElementById(id)!;
const generator = new CachedProfileGenerator(new LocalProfileGenerator(), chromeStore);

function toast(msg: string) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(() => { el.hidden = true; }, 2600);
}

async function readFiles(list: FileList | null): Promise<ImportFile[]> {
  const files = Array.from(list ?? []);
  return Promise.all(files.map((f) => new Promise<ImportFile>((resolve, reject) => {
    const kind = fileKind(f.name, f.type);
    const r = new FileReader();
    r.onerror = () => reject(new Error(`Lecture impossible : ${f.name}`));
    r.onload = () => resolve({ name: f.name, mime: f.type, size: f.size, ...(kind === 'raster' ? { dataUrl: String(r.result) } : { text: String(r.result) }) });
    if (kind === 'raster') r.readAsDataURL(f); else r.readAsText(f);
  })));
}

const importDeps = {
  async imageSize(dataUrl: string) {
    const bmp = await createImageBitmap(dataUrlToBlob(dataUrl));
    const size = { w: bmp.width, h: bmp.height };
    bmp.close();
    return size;
  },
};

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------ characters list

async function renderList() {
  const settings = await repo.getSettings();
  const profiles = await repo.listProfiles();
  const cards = await Promise.all(profiles.map(async (p) => {
    const avatar = await repo.getAvatar(p.avatarId);
    const active = p.id === settings.activeProfileId;
    const builtin = p.meta.source === 'builtin';
    return h('article', { class: `card${active ? ' active' : ''}`, 'data-profile': p.id },
      avatar ? avatarPreview(avatar, 90).el : h('div', { class: 'muted' }, 'Avatar manquant'),
      h('div', { class: 'name' }, p.name),
      h('div', { class: 'muted' }, `${TONE_LABEL[p.tone]} · ${LANG_LABEL[p.language]}`),
      h('span', { class: 'badge' }, SOURCE_LABEL[p.meta.source] ?? p.meta.source),
      h('div', { class: 'actions' },
        active ? h('span', { class: 'badge' }, 'Actif') : h('button', { class: 'primary', 'data-action': 'activate', onclick: async () => {
          await repo.saveSettings({ activeProfileId: p.id });
          toast(`${p.name} est maintenant actif.`);
          void renderList();
        } }, 'Activer'),
        builtin ? null : h('button', { 'data-action': 'edit', onclick: async () => openEditor(p, (await repo.getAvatar(p.avatarId))!) }, 'Modifier'),
        h('button', { 'data-action': 'duplicate', onclick: async () => {
          const copy: CharacterProfile = { ...structuredClone(p), id: newId('profile'), name: `${p.name} (copie)`, meta: { ...p.meta, source: 'manual', createdAt: Date.now(), updatedAt: Date.now() } };
          await repo.saveProfile(copy);
          toast('Copie créée.');
          void renderList();
          if (avatar) openEditor(copy, avatar);
        } }, 'Dupliquer'),
        avatar ? h('button', { 'data-action': 'export', onclick: () => download(`${p.name.replace(/[^\w-]+/g, '_')}.persona.json`, exportPack(p, avatar)) }, 'Exporter') : null,
        builtin ? null : h('button', { class: 'danger', 'data-action': 'delete', onclick: async () => {
          if (!confirm(`Supprimer ${p.name} ?`)) return;
          await repo.deleteProfile(p.id);
          toast('Personnage supprimé.');
          void renderList();
        } }, 'Supprimer'),
      ));
  }));
  $('character-list').replaceChildren(...cards);
}

// ------------------------------------------------------------------ editor

const KIND_LABEL: Record<SpeechKind, string> = {
  greeting: 'Salutations', again: 'Retour rapide', click: 'Quand on clique', poke: 'Trop de clics',
  idle: 'Remarques spontanées', wake: 'Réveil', drop: 'Après un lâcher', bye: 'Au revoir',
};
const SLOT_LABEL: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', evening: 'Soir', night: 'Nuit', any: 'À toute heure' };

const field = (label: string, input: HTMLElement, hint?: string) => h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
const toLines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

function openEditor(source: CharacterProfile, sourceAvatar: AvatarAsset, opts: { isNew?: boolean } = {}) {
  const p = structuredClone(source);
  let avatar = sourceAvatar;
  let avatarChanged = !!opts.isNew;
  const section = $('editor-section');
  section.hidden = false;

  const previewBox = h('div', {});
  const refreshPreview = () => previewBox.replaceChildren(avatarPreview(avatar, 110).el);
  refreshPreview();

  const name = h('input', { type: 'text', id: 'ed-name', value: p.name, maxlength: 40 });
  const bio = h('textarea', { id: 'ed-bio' }, p.bio);
  const language = h('select', { id: 'ed-language' }, ...LANGUAGES.map((l) => h('option', { value: l, selected: l === p.language }, LANG_LABEL[l])));
  const tone = h('select', { id: 'ed-tone' }, ...TONES.map((t) => h('option', { value: t, selected: t === p.tone }, TONE_LABEL[t])));
  const entrance = h('select', { id: 'ed-entrance' },
    h('option', { value: 'random', selected: p.entrance === 'random' }, 'Au hasard'),
    ...ENTRANCES.map((e) => h('option', { value: e, selected: e === p.entrance }, { peek: 'Sort de derrière le bord', hop: 'Arrive en sautant', pop: 'Apparaît avec des étincelles' }[e])));
  const trait = (key: keyof CharacterProfile['traits'], label: string, left: string, right: string) => {
    const input = h('input', { type: 'range', min: 0, max: 100, value: String(Math.round(p.traits[key] * 100)), id: `ed-${key}` });
    return field(label, input, `${left} ↔ ${right}`);
  };
  const facing = h('select', { id: 'ed-facing' }, ...(['front', 'right', 'left'] as const).map((f) => h('option', { value: f, selected: avatar.facing === f }, { front: 'De face', right: 'Vers la droite', left: 'Vers la gauche' }[f])));
  const height = h('input', { type: 'number', min: 40, max: 400, value: String(avatar.height), id: 'ed-height' });
  const avatarFile = h('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp,.gif,.svg,.json', id: 'ed-avatar-file' });
  avatarFile.addEventListener('change', async () => {
    try {
      const r = await importAvatarFiles(await readFiles(avatarFile.files), importDeps);
      avatar = r.avatar;
      avatarChanged = true;
      facing.value = avatar.facing;
      height.value = String(avatar.height);
      refreshPreview();
      toast(r.warnings[0] ?? 'Avatar chargé — pensez à enregistrer.');
    } catch (e) { toast((e as Error).message); }
  });

  const phraseInputs: { kind: SpeechKind; slot?: string; el: HTMLTextAreaElement }[] = [];
  const phrases = h('details', {}, h('summary', {}, 'Phrases personnalisées (facultatif)'),
    h('p', { class: 'muted' }, 'Une phrase par ligne. Variables : {user} (votre prénom), {,user} (« , prénom » si connu), {name}, {day}, {time}, {site}. Ces phrases s’ajoutent aux phrases intégrées, avec priorité.'),
    ...SPEECH_KINDS.flatMap((kind) => {
      if (kind === 'greeting') {
        return ([...TIME_SLOTS, 'any'] as const).map((slot) => {
          const el = h('textarea', { 'data-kind': kind, 'data-slot': slot }, (p.phrases.greeting?.[slot] ?? []).join('\n'));
          phraseInputs.push({ kind, slot, el });
          return field(`${KIND_LABEL[kind]} — ${SLOT_LABEL[slot]}`, el);
        });
      }
      const el = h('textarea', { 'data-kind': kind }, ((p.phrases[kind] as string[] | undefined) ?? []).join('\n'));
      phraseInputs.push({ kind, el });
      return [field(KIND_LABEL[kind], el)];
    }));

  const collect = (): CharacterProfile => {
    const ph: PhraseOverrides = {};
    for (const { kind, slot, el } of phraseInputs) {
      const lines = toLines(el.value);
      if (!lines.length) continue;
      if (kind === 'greeting') ph.greeting = { ...ph.greeting, [slot!]: lines };
      else ph[kind] = lines;
    }
    const traitVal = (k: string) => Number((document.getElementById(`ed-${k}`) as HTMLInputElement).value) / 100;
    return normalizeProfile({
      ...p,
      name: name.value,
      bio: bio.value,
      language: language.value,
      tone: tone.value,
      entrance: entrance.value,
      traits: { energy: traitVal('energy'), sociability: traitVal('sociability'), playfulness: traitVal('playfulness') },
      phrases: ph,
      avatarId: avatar.id,
    }).value;
  };

  const sampleKind = h('select', { id: 'ed-sample-kind' }, ...SPEECH_KINDS.map((k) => h('option', { value: k }, KIND_LABEL[k])));
  const sample = h('p', { class: 'sample', id: 'ed-sample' }, '…');
  const settingsP = repo.getSettings();
  const trySample = async () => {
    const s = await settingsP;
    const line = composeLine(sampleKind.value as SpeechKind, { profile: collect(), now: new Date(), rng: Math.random, userName: s.userName, site: 'exemple.fr' });
    sample.textContent = line ? `« ${line.text} »` : '(aucune phrase disponible)';
  };

  const uncertainties = p.meta.uncertainties ?? [];
  const warn = uncertainties.length ? h('div', { class: 'warn', id: 'ed-uncertainties' },
    h('strong', {}, p.meta.confidence !== undefined ? `Profil généré — confiance ${Math.round(p.meta.confidence * 100)} %. À vérifier :` : 'À vérifier :'),
    h('ul', {}, ...uncertainties.map((u) => h('li', {}, u))),
    h('button', { onclick: () => { p.meta.uncertainties = []; p.meta.confidence = 1; warn?.remove(); toast('Noté : profil vérifié manuellement.'); } }, 'J’ai vérifié et corrigé')) : null;

  $('editor').replaceChildren(
    warn ?? '',
    h('div', { class: 'editor-head' }, previewBox, h('div', { class: 'muted' },
      h('div', {}, `Avatar : ${avatar.name} (${avatar.kind})`), avatar.license ? h('div', {}, `Licence : ${avatar.license}`) : null)),
    h('div', { class: 'grid' },
      field('Nom', name),
      field('Langue', language),
      field('Ton', tone),
      field('Entrée en scène', entrance),
      trait('energy', 'Énergie', 'calme', 'énergique'),
      trait('sociability', 'Sociabilité', 'réservé', 'bavard'),
      trait('playfulness', 'Espièglerie', 'sérieux', 'farceur'),
      field('Orientation de l’avatar', facing),
      field('Taille de l’avatar (px)', height),
      field('Remplacer l’avatar', avatarFile, 'PNG, JPEG, WebP, GIF, SVG, sprite sheet + JSON'),
    ),
    field('Description / personnalité', bio),
    phrases,
    h('div', { class: 'bar' }, sampleKind, h('button', { id: 'ed-try', onclick: () => void trySample() }, 'Tester une phrase')),
    sample,
    h('div', { class: 'bar' },
      h('button', { class: 'primary', id: 'ed-save', onclick: async () => {
        try {
          const profile = collect();
          if (profile.meta.source === 'builtin') profile.meta.source = 'manual';
          const fh = Number(height.value);
          const nextAvatar = { ...avatar, facing: facing.value as AvatarAsset['facing'], height: fh >= 40 && fh <= 400 ? fh : avatar.height };
          if (!nextAvatar.builtin && (avatarChanged || nextAvatar.facing !== sourceAvatar.facing || nextAvatar.height !== sourceAvatar.height)) {
            await repo.saveAvatar(nextAvatar);
          }
          await repo.saveProfile(profile);
          if (opts.isNew) await repo.saveSettings({ activeProfileId: profile.id });
          toast(opts.isNew ? `${profile.name} est créé et actif !` : 'Enregistré.');
          section.hidden = true;
          void renderList();
        } catch (e) { toast((e as Error).message); }
      } }, opts.isNew ? 'Créer et activer' : 'Enregistrer'),
      h('button', { onclick: () => { section.hidden = true; } }, 'Annuler')),
  );
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ------------------------------------------------------------------ create

function renderCreate() {
  const name = h('input', { type: 'text', id: 'cr-name', placeholder: 'Ex. Luna', maxlength: 40 });
  const desc = h('textarea', { id: 'cr-desc', placeholder: 'Ex. Une petite renarde espiègle et curieuse, très bavarde, qui adore les blagues.' });
  const lang = h('select', { id: 'cr-language' }, h('option', { value: '' }, 'Détecter'), ...LANGUAGES.map((l) => h('option', { value: l }, LANG_LABEL[l])));
  const file = h('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp,.gif,.svg,.json', id: 'cr-avatar' });
  $('create-form').replaceChildren(
    h('p', { class: 'muted' }, 'Décrivez le personnage : le profil (ton, traits, langue) est déduit localement et gratuitement, puis mis en cache. Vous pourrez tout corriger avant d’enregistrer.'),
    h('div', { class: 'grid' }, field('Nom', name), field('Langue', lang), field('Avatar (facultatif)', file, 'Sans fichier, l’avatar de Pip est utilisé.')),
    field('Description', desc),
    h('div', { class: 'bar' }, h('button', { class: 'primary', id: 'cr-generate', onclick: async () => {
      try {
        if (!name.value.trim()) { toast('Donnez un nom au personnage.'); name.focus(); return; }
        const g = await generator.generate({ name: name.value, description: desc.value, language: (lang.value || undefined) as Language | undefined });
        let avatar = (await repo.getAvatar(BUILTIN_PROFILES[0]!.avatarId))!;
        if (file.files?.length) {
          const r = await importAvatarFiles(await readFiles(file.files), importDeps);
          avatar = r.avatar;
        }
        g.profile.avatarId = avatar.id;
        openEditor(g.profile, avatar, { isNew: true });
      } catch (e) { toast((e as Error).message); }
    } }, 'Générer le profil (gratuit, local)')),
  );
}

// ------------------------------------------------------------------ import

function renderImport() {
  const file = h('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp,.gif,.svg,.json', id: 'im-file' });
  const out = h('div', { id: 'im-result' });
  file.addEventListener('change', async () => {
    try {
      const r = await importAvatarFiles(await readFiles(file.files), importDeps);
      if (r.profile) {
        await repo.saveAvatar(r.avatar);
        await repo.saveProfile(r.profile);
        toast(`Pack importé : ${r.profile.name}.`);
        out.replaceChildren(...r.warnings.map((w) => h('p', { class: 'muted' }, w)));
        void renderList();
        return;
      }
      const now = Date.now();
      const { value: profile } = normalizeProfile({
        name: r.avatar.name, language: 'fr', tone: 'cheerful', avatarId: r.avatar.id,
        meta: { source: 'imported', createdAt: now, updatedAt: now, uncertainties: ['Avatar importé sans profil : nom, langue et personnalité sont des valeurs par défaut. Ajustez-les.'] },
      });
      out.replaceChildren(...r.warnings.map((w) => h('p', { class: 'muted' }, w)));
      openEditor(profile, r.avatar, { isNew: true });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      file.value = '';
    }
  });
  $('import-form').replaceChildren(
    h('ul', { class: 'muted' },
      h('li', {}, 'Image : PNG, JPEG, WebP, GIF (les GIF/WebP animés sont joués).'),
      h('li', {}, 'SVG : animé par parties s’il suit la convention ', h('code', {}, 'data-part'), ' (voir docs/AVATAR-FORMATS.md), sinon animé en entier.'),
      h('li', {}, 'Sprite sheet : sélectionnez l’image et son JSON ensemble (grille Persona, export Aseprite ou TexturePacker).'),
      h('li', {}, 'Pack Persona (.persona.json) : profil + avatar, exporté depuis cette page.')),
    field('Fichier(s)', file),
    h('p', { class: 'muted' }, 'N’importez que des images dont vous avez les droits. Les fichiers restent sur cet appareil.'),
    out,
  );
}

// ------------------------------------------------------------------ settings

async function renderSettings() {
  const s = await repo.getSettings();
  const save = async (patch: Partial<Settings>) => { await repo.saveSettings(patch); toast('Réglage enregistré.'); };
  const check = (id: string, label: string, value: boolean, key: keyof Settings) =>
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id, checked: value, onchange: (e: Event) => save({ [key]: (e.target as HTMLInputElement).checked } as Partial<Settings>) }), label);
  const select = <T extends string>(id: string, value: T, options: [T, string][], key: keyof Settings) =>
    h('select', { id, onchange: (e: Event) => save({ [key]: (e.target as HTMLSelectElement).value } as Partial<Settings>) },
      ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));

  const scale = h('input', { type: 'range', id: 'st-scale', min: 50, max: 200, value: String(Math.round(s.scale * 100)),
    onchange: (e: Event) => save({ scale: Number((e.target as HTMLInputElement).value) / 100 }) });
  const userName = h('input', { type: 'text', id: 'st-username', value: s.userName, maxlength: 40, placeholder: 'Facultatif',
    onchange: (e: Event) => save({ userName: (e.target as HTMLInputElement).value }) });
  const cooldown = h('input', { type: 'number', id: 'st-cooldown', min: 1, max: 1440, value: String(s.greetCooldownMin),
    onchange: (e: Event) => save({ greetCooldownMin: Number((e.target as HTMLInputElement).value) }) });
  const sites = h('textarea', { id: 'st-sites', placeholder: 'exemple.com\n*.banque.fr' }, s.disabledSites.join('\n'));
  sites.addEventListener('change', () => save({ disabledSites: toLines(sites.value).map(normalizeHost) }));

  $('settings-form').replaceChildren(
    h('div', { class: 'grid' },
      field('Votre prénom (pour les salutations)', userName),
      field('Taille du personnage', scale),
      field('Fréquence des animations', select('st-frequency', s.frequency, [['calm', 'Calme'], ['normal', 'Normale'], ['lively', 'Très vivante']], 'frequency')),
      field('Bulles de dialogue', select('st-chattiness', s.chattiness, [['all', 'Toutes'], ['greetings', 'Salutations seulement'], ['silent', 'Aucune']], 'chattiness')),
      field('Entrée en scène', select('st-entrance', s.entrance, [['profile', 'Celle du personnage'], ['random', 'Au hasard'], ['peek', 'Sort de derrière le bord'], ['hop', 'En sautant'], ['pop', 'Étincelles']], 'entrance')),
      field('Animations réduites', select('st-reduce', s.reduceMotion, [['auto', 'Selon le système'], ['on', 'Oui'], ['off', 'Non']], 'reduceMotion')),
      field('Nouvelle salutation complète après (minutes)', cooldown),
    ),
    h('div', { class: 'bar' },
      check('st-enabled', 'Compagnon activé', s.enabled, 'enabled'),
      check('st-gravity', 'Retombe en bas de la fenêtre quand on le lâche', s.gravity, 'gravity'),
      check('st-follow', 'Suit le curseur des yeux', s.followCursor, 'followCursor')),
    field('Sites où le compagnon n’apparaît pas (un par ligne)', sites, '« *.exemple.com » couvre aussi les sous-domaines.'),
    h('div', { class: 'bar' },
      h('button', { id: 'st-reset-position', onclick: () => save({ position: null }) }, 'Réinitialiser la position'),
      h('button', { class: 'danger', id: 'st-reset', onclick: async () => {
        if (!confirm('Rétablir tous les réglages par défaut ? Vos personnages sont conservés.')) return;
        await repo.saveSettings({ ...DEFAULT_SETTINGS });
        void renderSettings();
        void renderList();
        toast('Réglages réinitialisés.');
      } }, 'Réglages par défaut')),
  );
}

function renderAbout() {
  $('about-text').replaceChildren(
    h('p', {}, 'Persona est un compagnon animé gratuit : animations, salutations et réactions fonctionnent entièrement sur votre appareil, sans compte, sans abonnement et sans clé API.'),
    h('p', { class: 'muted' }, 'Les données (réglages, personnages, avatars) sont stockées localement dans Chrome et ne sont envoyées nulle part.'),
    h('p', { class: 'muted' }, 'Pip est un personnage original créé pour Persona. Les avatars importés restent sous la responsabilité de leurs auteurs : vérifiez leurs licences avant toute diffusion.'),
  );
}

async function init() {
  await Promise.all([renderList(), renderSettings()]);
  renderCreate();
  renderImport();
  renderAbout();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.settings || changes.profiles)) void renderList();
  });
}

void init();
