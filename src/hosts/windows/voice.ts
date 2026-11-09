import { SentenceChunker, speakable } from '../../core/agent/speechText';

/** Optional system voice. No microphone, model key, cloned voice or audio routing. */
export function createSystemVoice(onSpeaking: (speaking: boolean) => void, onError: () => void) {
  let version = 0;
  const available = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const stop = () => { ++version; if (available()) speechSynthesis.cancel(); onSpeaking(false); };
  return {
    available, stop,
    say(text: string, language: string) {
      stop(); if (!available()) { onError(); return; }
      const current = version;
      const chunks = new SentenceChunker();
      const sentences = [...chunks.push(text.slice(0, 2500)), ...chunks.end()].map(speakable).filter(Boolean);
      const next = () => {
        if (version !== current) return;
        const sentence = sentences.shift();
        if (!sentence) { onSpeaking(false); return; }
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.lang = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', de: 'de-DE' }[language] ?? 'fr-FR';
        const voice = speechSynthesis.getVoices().find((voice) => voice.lang.startsWith(language));
        if (voice) utterance.voice = voice;
        utterance.onstart = () => { if (version === current) onSpeaking(true); };
        utterance.onend = next;
        utterance.onerror = () => { if (version === current) { stop(); onError(); } };
        speechSynthesis.speak(utterance);
      };
      next();
    },
  };
}
