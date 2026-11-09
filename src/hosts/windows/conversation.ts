import type { DesktopBridge } from './desktop';
import type { CharacterProfile } from '../../core/profile/types';
import { ConnectedAgent } from '../../core/agent/connected';
import type { ConnectionStatus, ToolCall, ToolObservation } from '../../core/agent/protocol';
import { nativeAgentStatus, nativeAgentTransport, nativeToolExecutor } from './agent';
import { createSystemVoice } from './voice';

export type LocalIntent = 'pause' | 'help' | 'discord' | 'unknown';

/** Deliberately bounded commands, not an LLM or a partial-match tool executor. */
export function localIntent(prompt: string): LocalIntent {
  const text = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’']/g, ' ').replace(/[?!.,]/g, '').replace(/[-\s]+/g, ' ').trim()
    .replace(/^(?:s il te plait |stp |peux tu |tu peux )/, '').replace(/ (?:stp|s il te plait)$/, '');
  if (/^(?:(?:mets?|mettre|passe|passer) (?:la |le |ma |mon |une |un )?(?:video|musique|media|lecture) (?:en|sur) pause|(?:mets? |mettre )?pause (?:a |sur )?(?:la |le |ma |mon |une |un )?(?:video|musique|media|lecture)|pause|(?:pause|stop) (?:the )?(?:video|music|media)|mets? (?:en|sur) pause)$/.test(text)) return 'pause';
  if (/^(?:aide|help|que peux tu faire|qu est ce que tu sais faire)$/.test(text)) return 'help';
  if (/\bdiscord\b/.test(text)) return 'discord';
  return 'unknown';
}

export function pauseMessage(result: unknown): string {
  const status = (result as { status?: unknown } | null)?.status;
  switch (status) {
    case 'paused': return 'Windows confirme que le média sélectionné est en pause.';
    case 'alreadyPaused': return 'Le média sélectionné est déjà en pause.';
    case 'noSession': return 'Windows ne signale aucun média contrôlable. Lancez votre vidéo ou votre musique, puis réessayez.';
    case 'notPlaying': return 'Le média sélectionné par Windows n’est pas en lecture.';
    case 'refused': return 'Le lecteur a refusé la commande de pause.';
    case 'unconfirmed': return 'La demande de pause a été acceptée, mais Windows ne confirme pas l’arrêt de la lecture.';
    default: return 'La pause n’a pas pu être vérifiée. Aucun succès ne peut être confirmé.';
  }
}

export function createConversation(bridge: DesktopBridge, report: (error: unknown) => void, opened: () => void, speaking: (value: boolean) => void = () => undefined, wave?: () => boolean) {
  const panel = document.querySelector<HTMLElement>('#conversation')!;
  const input = document.querySelector<HTMLInputElement>('#conversation-input')!;
  const form = document.querySelector<HTMLFormElement>('#conversation-form')!;
  const messages = document.querySelector<HTMLElement>('#conversation-messages')!;
  const send = document.querySelector<HTMLButtonElement>('#conversation-send')!;
  const closeButton = document.querySelector<HTMLButtonElement>('#conversation-close')!;
  const stopButton = document.querySelector<HTMLButtonElement>('#conversation-stop')!;
  const phase = document.querySelector<HTMLElement>('#conversation-phase')!;
  const journal = document.querySelector<HTMLElement>('#action-journal')!;
  const voiceToggle = document.querySelector<HTMLInputElement>('#conversation-voice')!;
  const connectionForm = document.querySelector<HTMLFormElement>('#connection-form')!;
  const connectionCode = document.querySelector<HTMLInputElement>('#connection-code')!;
  const refreshButton = document.querySelector<HTMLButtonElement>('#connection-refresh')!;
  const disconnectButton = document.querySelector<HTMLButtonElement>('#connection-disconnect')!;
  const suggestions = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-prompt]'));
  let busy = false;
  let opening: Promise<void> | undefined;
  let revision = 0;
  let destroyed = false;
  let pairing = false;
  let character: CharacterProfile;
  let agent: ConnectedAgent | undefined;
  let controller: AbortController | undefined;
  let status: ConnectionStatus = { state: 'notConfigured', detail: 'Le service IA Persona reste à connecter.' };
  let refreshing: Promise<void> | undefined;
  const transport = nativeAgentTransport(bridge), tools = nativeToolExecutor(bridge, wave);
  const entries = new Map<string, HTMLElement>();
  const voice = createSystemVoice(speaking, () => { phase.textContent = 'Lecture vocale indisponible sur ce PC.'; });
  voiceToggle.disabled = !voice.available();
  voiceToggle.checked = voice.available() && localStorage.getItem('persona:desktop:voice') === '1';
  const append = (role: 'user' | 'assistant', text: string) => {
    const line = document.createElement('p');
    line.className = 'chat-message'; line.dataset.role = role;
    // User text and native errors are always text, never HTML.
    line.textContent = text; messages.append(line);
    while (messages.children.length > 20) messages.firstElementChild?.remove();
    messages.scrollTop = messages.scrollHeight;
  };
  const update = () => {
    send.disabled = busy || pairing; send.textContent = busy ? 'En cours…' : pairing ? 'Connexion…' : 'Envoyer';
    stopButton.hidden = !busy;
    form.setAttribute('aria-busy', String(busy));
    for (const button of [...suggestions, refreshButton, disconnectButton]) button.disabled = busy || pairing;
    for (const field of connectionForm.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button')) field.disabled = busy || pairing;
  };
  const refresh = () => {
    if (refreshing) return refreshing;
    const current = revision;
    const pending = (async () => {
      const value = await nativeAgentStatus(bridge);
      if (destroyed || current !== revision) return;
      status = value;
      document.querySelector('#conversation-mode')!.textContent = status.state === 'ready' ? 'Conversation via Persona' : 'Commandes locales · IA non connectée';
      document.querySelector('#connection-status')!.textContent = status.detail;
      document.querySelector<HTMLElement>('#connection-pair')!.hidden = status.state !== 'notPaired';
      disconnectButton.hidden = !status.paired;
      if (status.state === 'ready' && !agent) agent = new ConnectedAgent({ id: character.id, name: character.name, bio: character.bio, universe: character.universe, language: character.language, tone: character.tone, traits: character.traits }, transport, tools);
    })();
    refreshing = pending;
    void pending.finally(() => { if (refreshing === pending) refreshing = undefined; });
    return pending;
  };
  const action = (call: ToolCall) => {
    const labels = { media_pause: 'Mettre le média en pause', media_play: 'Reprendre la lecture', open_application: 'Ouvrir une application', open_page: 'Ouvrir une page dans Persona', search_web: 'Ouvrir une recherche', companion_wave: 'Faire coucou' };
    const line = document.createElement('p'); line.dataset.state = 'running';
    const detail = Object.values(call.args).join(' ').slice(0, 200);
    line.textContent = detail ? `${labels[call.name]} · ${detail}` : labels[call.name];
    journal.append(line); entries.set(call.id, line);
    while (journal.children.length > 20) journal.firstElementChild?.remove();
    document.querySelector<HTMLDetailsElement>('#action-details')!.open = true;
    journal.scrollTop = journal.scrollHeight;
    phase.textContent = 'Action en cours…';
  };
  const observed = (id: string, result: ToolObservation) => {
    const line = entries.get(id); if (!line) return;
    line.dataset.state = result.ok ? 'success' : 'error';
    line.textContent += ` → ${result.summary}`;
    entries.delete(id); journal.scrollTop = journal.scrollHeight;
  };
  const stop = () => { controller?.abort(); voice.stop(); };
  const submit = async (prompt: string) => {
    prompt = prompt.trim().slice(0, 4000);
    if (!prompt || busy || pairing || destroyed) return;
    const current = revision;
    const task = new AbortController(); controller = task;
    busy = true; update(); input.value = ''; append('user', prompt); voice.stop();
    try {
      // Wait for connection discovery, but stop must not wait for its network timeout.
      if (refreshing) {
        await new Promise<void>((resolve, reject) => {
          const abort = () => reject(new DOMException('Tâche arrêtée.', 'AbortError'));
          task.signal.addEventListener('abort', abort, { once: true });
          void refreshing!.then(resolve, reject).finally(() => task.signal.removeEventListener('abort', abort));
        });
      }
      task.signal.throwIfAborted();
      if (status.state === 'ready' && agent) {
        for await (const event of agent.run({ id: crypto.randomUUID(), prompt }, task.signal)) {
          if (destroyed || current !== revision) break;
          switch (event.type) {
            case 'thinking': phase.textContent = 'Réflexion…'; break;
            case 'action': action({ id: event.id!, name: event.name as ToolCall['name'], args: event.args }); break;
            case 'observation': observed(event.id, event.result); break;
            case 'message': append('assistant', event.text); if (voiceToggle.checked && !panel.hidden) voice.say(event.text, character.language); break;
            case 'error': append('assistant', event.message); break;
            case 'stopped': append('assistant', 'Tâche arrêtée. Les actions déjà terminées figurent dans le journal.'); break;
          }
        }
        return;
      }
      let response: string;
      switch (localIntent(prompt)) {
        case 'pause': {
          const id = crypto.randomUUID(); action({ id, name: 'media_pause', args: {} });
          const result = await bridge.invoke('pause_media');
          response = pauseMessage(result);
          const status = (result as { status?: string } | null)?.status;
          observed(id, { ok: status === 'paused' || status === 'alreadyPaused', summary: response });
          break;
        }
        case 'help': response = 'Sans service IA, je peux faire coucou, demander la pause du média Windows ou ouvrir Discord, la calculatrice et le bloc-notes. Écrivez « ouvre Discord ». Avec le service connecté, je peux discuter selon mon profil et choisir parmi les outils disponibles. Les appels Discord et la lecture des pages restent indisponibles.'; break;
        default: {
          if (/^(?:fais(?: moi)? (?:un )?coucou|coucou)[.!?]*$/i.test(prompt.trim().replace(/-/g, ' '))) {
            const call: ToolCall = { id: crypto.randomUUID(), name: 'companion_wave', args: {} };
            action(call); const result = await tools.execute(call, task.signal); observed(call.id, result); response = result.summary; break;
          }
          const match = /^(?:ouvre|ouvrir|lance|lancer) (?:la |le |l )?(discord|calculatrice|bloc notes|notepad)[.!?]*$/i.exec(prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, ' ').trim());
          if (match) {
            const application = ({ discord: 'discord', calculatrice: 'calculator', 'bloc notes': 'notepad', notepad: 'notepad' } as Record<string, string>)[match[1]!.toLowerCase()]!;
            const call: ToolCall = { id: crypto.randomUUID(), name: 'open_application', args: { application } };
            action(call); const result = await tools.execute(call, task.signal); observed(call.id, result); response = result.summary;
          } else response = localIntent(prompt) === 'discord'
            ? 'Je ne peux pas encore rejoindre un appel Discord, parler à vos amis ou écouter leur réponse. Aucun appel ni message n’a été lancé. Cette fonction demande une intégration audio.'
            : 'Le service IA n’est pas connecté. Les commandes locales restent disponibles : « mets la vidéo en pause » ou « ouvre Discord ». Ouvrez Connexion Persona pour voir l’état du service.';
        }
      }
      if (!destroyed && current === revision) { append('assistant', response); if (voiceToggle.checked && !task.signal.aborted && !panel.hidden) voice.say(response, character.language); }
    } catch (error) {
      if (!destroyed && current === revision) append('assistant', task.signal.aborted ? 'Tâche arrêtée. Les actions déjà terminées figurent dans le journal.' : `L’action a échoué : ${String(error).slice(0, 500)}`);
    } finally {
      if (controller === task) {
        for (const [id] of entries) observed(id, { ok: false, summary: 'Résultat non reçu ; effet éventuel à vérifier.' });
        controller = undefined; busy = false;
        if (!destroyed) { phase.textContent = task.signal.aborted ? 'Arrêté' : ''; update(); input.focus(); }
      }
    }
  };
  const close = async () => {
    voice.stop();
    if (opening) await opening;
    if (panel.hidden) return;
    await bridge.invoke('set_chat_open', { open: false });
    panel.hidden = true;
  };
  const onSubmit = (event: Event) => { event.preventDefault(); void submit(input.value); };
  const onClose = () => { void close().catch(report); };
  const onSuggestion = (event: Event) => { void submit((event.currentTarget as HTMLButtonElement).dataset.prompt!); };
  const onVoice = () => { localStorage.setItem('persona:desktop:voice', voiceToggle.checked ? '1' : '0'); if (!voiceToggle.checked) voice.stop(); };
  const onRefresh = () => { void refresh(); };
  const onPair = (event: Event) => {
    event.preventDefault();
    if (busy || pairing) return;
    pairing = true; update();
    void bridge.invoke('agent_pair', { code: connectionCode.value.trim() }).then(() => { connectionCode.value = ''; return refresh(); }).catch((error) => { document.querySelector('#connection-status')!.textContent = String(error).slice(0, 400); }).finally(() => { pairing = false; if (!destroyed) update(); });
  };
  const onDisconnect = () => { stop(); agent = undefined; void bridge.invoke('agent_disconnect').then(() => refresh()).catch(report); };
  form.addEventListener('submit', onSubmit);
  closeButton.addEventListener('click', onClose);
  for (const button of suggestions) button.addEventListener('click', onSuggestion);
  stopButton.addEventListener('click', stop); voiceToggle.addEventListener('change', onVoice);
  refreshButton.addEventListener('click', onRefresh); disconnectButton.addEventListener('click', onDisconnect); connectionForm.addEventListener('submit', onPair);
  return {
    panel, close, stop, escape() { if (busy) stop(); else { voice.stop(); void close().catch(report); } },
    async open() {
      if (destroyed) return;
      if (opening) return opening;
      opening = (async () => {
        if (panel.hidden) await bridge.invoke('set_chat_open', { open: true });
        if (destroyed) return;
        panel.hidden = false; opened(); input.focus();
        void refresh();
      })();
      try { await opening; } finally { opening = undefined; }
    },
    setCharacter(profile: CharacterProfile) {
      stop(); ++revision; character = profile; agent = undefined; controller = undefined; busy = false; refreshing = undefined;
      document.querySelector('#conversation-title')!.textContent = profile.name;
      messages.replaceChildren(); input.value = '';
      journal.replaceChildren(); entries.clear(); update();
      append('assistant', 'Écrivez une demande ici. Le bouton Aide présente les actions disponibles.');
    },
    destroy() {
      stop(); destroyed = true; ++revision;
      form.removeEventListener('submit', onSubmit); closeButton.removeEventListener('click', onClose);
      for (const button of suggestions) button.removeEventListener('click', onSuggestion);
      stopButton.removeEventListener('click', stop); voiceToggle.removeEventListener('change', onVoice);
      refreshButton.removeEventListener('click', onRefresh); disconnectButton.removeEventListener('click', onDisconnect); connectionForm.removeEventListener('submit', onPair);
    },
  };
}
