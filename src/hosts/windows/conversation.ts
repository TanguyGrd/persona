import type { DesktopBridge } from './desktop';

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

export function createConversation(bridge: DesktopBridge, report: (error: unknown) => void, opened: () => void) {
  const panel = document.querySelector<HTMLElement>('#conversation')!;
  const input = document.querySelector<HTMLInputElement>('#conversation-input')!;
  const form = document.querySelector<HTMLFormElement>('#conversation-form')!;
  const messages = document.querySelector<HTMLElement>('#conversation-messages')!;
  const send = document.querySelector<HTMLButtonElement>('#conversation-send')!;
  const closeButton = document.querySelector<HTMLButtonElement>('#conversation-close')!;
  const suggestions = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-prompt]'));
  let busy = false;
  let opening: Promise<void> | undefined;
  let revision = 0;
  let destroyed = false;
  const append = (role: 'user' | 'assistant', text: string) => {
    const line = document.createElement('p');
    line.className = 'chat-message'; line.dataset.role = role;
    // User text and native errors are always text, never HTML.
    line.textContent = text; messages.append(line);
    while (messages.children.length > 20) messages.firstElementChild?.remove();
    messages.scrollTop = messages.scrollHeight;
  };
  const update = () => { send.disabled = busy; for (const button of suggestions) button.disabled = busy; };
  const submit = async (prompt: string) => {
    prompt = prompt.trim().slice(0, 1000);
    if (!prompt || busy || destroyed) return;
    const current = revision;
    busy = true; update(); input.value = ''; append('user', prompt);
    try {
      let response: string;
      switch (localIntent(prompt)) {
        case 'pause': response = pauseMessage(await bridge.invoke('pause_media')); break;
        case 'help': response = 'Je peux demander à Windows de mettre le média actuel en pause. Écrivez « mets la vidéo en pause ». La conversation IA et les appels Discord ne sont pas encore connectés.'; break;
        case 'discord': response = 'Je ne peux pas encore rejoindre un appel Discord, parler à vos amis ou écouter leur réponse. Aucun appel ni message n’a été lancé. Cette fonction demande un agent connecté et une intégration audio.'; break;
        default: response = 'La conversation IA n’est pas encore connectée. Pour le moment, je reconnais la commande « mets la vidéo en pause ». Le bouton Aide présente les actions disponibles.';
      }
      if (!destroyed && current === revision) append('assistant', response);
    } catch (error) {
      if (!destroyed && current === revision) append('assistant', `L’action a échoué : ${String(error).slice(0, 500)}`);
    } finally { busy = false; if (!destroyed) { update(); input.focus(); } }
  };
  const close = async () => {
    if (opening) await opening;
    if (panel.hidden) return;
    await bridge.invoke('set_chat_open', { open: false });
    panel.hidden = true;
  };
  const onSubmit = (event: Event) => { event.preventDefault(); void submit(input.value); };
  const onClose = () => { void close().catch(report); };
  const onSuggestion = (event: Event) => { void submit((event.currentTarget as HTMLButtonElement).dataset.prompt!); };
  form.addEventListener('submit', onSubmit);
  closeButton.addEventListener('click', onClose);
  for (const button of suggestions) button.addEventListener('click', onSuggestion);
  return {
    panel, close,
    async open() {
      if (destroyed) return;
      if (opening) return opening;
      opening = (async () => {
        if (panel.hidden) await bridge.invoke('set_chat_open', { open: true });
        if (destroyed) return;
        panel.hidden = false; opened(); input.focus();
      })();
      try { await opening; } finally { opening = undefined; }
    },
    setCharacter(name: string) {
      ++revision;
      document.querySelector('#conversation-title')!.textContent = name;
      messages.replaceChildren(); input.value = '';
      append('assistant', 'Écrivez une demande ici. Pour commencer : « mets la vidéo en pause ».');
    },
    destroy() {
      destroyed = true; ++revision;
      form.removeEventListener('submit', onSubmit); closeButton.removeEventListener('click', onClose);
      for (const button of suggestions) button.removeEventListener('click', onSuggestion);
    },
  };
}
