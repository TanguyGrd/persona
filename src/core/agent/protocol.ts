import type { CharacterProfile } from '../profile/types';

export type AgentCharacter = Pick<CharacterProfile, 'id' | 'name' | 'bio' | 'universe' | 'language' | 'tone' | 'traits'>;
export type ToolName = 'media_pause' | 'media_play' | 'open_application' | 'open_page' | 'search_web' | 'companion_wave';
export interface ToolCall { id: string; name: ToolName; args: Record<string, unknown> }
export interface ToolObservation { ok: boolean; summary: string; data?: unknown }
export interface ModelMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  calls?: ToolCall[];
  callId?: string;
}
export interface ModelRequest { character: AgentCharacter; messages: ModelMessage[] }
export interface ModelReply { text: string; calls: ToolCall[]; usage?: { inputTokens: number; outputTokens: number } }
export interface AgentTransport { step(request: ModelRequest, signal: AbortSignal): Promise<ModelReply> }
export type ConnectionState = 'ready' | 'notConfigured' | 'notPaired' | 'unavailable';
export interface ConnectionStatus { state: ConnectionState; detail: string; paired?: boolean }

export const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const boundedString = (v: unknown, limit: number) => typeof v === 'string' && v.length <= limit;
const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((key) => keys.includes(key));

export function publicPageUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Adresse de page invalide.');
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) throw new Error('Seules les pages HTTPS publiques sont autorisées.');
  return url.href;
}

/** Validate the entire batch before any native operation is executed. */
export function validateToolCall(value: unknown): ToolCall {
  if (!record(value) || !onlyKeys(value, ['id','name','args']) || !boundedString(value.id, 100) || !value.id || !record(value.args)) throw new Error('Outil mal formé.');
  const { args } = value;
  switch (value.name) {
    case 'media_pause': case 'media_play': case 'companion_wave':
      if (!onlyKeys(args, [])) throw new Error('Cet outil ne prend aucun argument.');
      break;
    case 'open_application':
      if (!onlyKeys(args, ['application']) || !['calculator', 'notepad', 'discord'].includes(String(args.application))) throw new Error('Application non autorisée.');
      break;
    case 'open_page':
      if (!onlyKeys(args, ['url'])) throw new Error('Arguments de navigation invalides.');
      publicPageUrl(args.url);
      break;
    case 'search_web':
      if (!onlyKeys(args, ['query']) || !boundedString(args.query, 300) || !(args.query as string).trim()) throw new Error('Recherche invalide.');
      break;
    default: throw new Error(`Outil indisponible : ${String(value.name).slice(0, 60)}`);
  }
  return { id: value.id as string, name: value.name, args: { ...args } };
}

export function validateModelReply(value: unknown): ModelReply {
  if (!record(value) || !onlyKeys(value, ['text','calls','usage']) || !boundedString(value.text, 8000) || !Array.isArray(value.calls) || value.calls.length > 4) throw new Error('Réponse du service IA invalide.');
  const calls = value.calls.map(validateToolCall);
  if (new Set(calls.map((call) => call.id)).size !== calls.length) throw new Error('Identifiants d’outil dupliqués.');
  const usage = value.usage;
  if (usage !== undefined && (!record(usage) || ![usage.inputTokens, usage.outputTokens].every((n) => Number.isSafeInteger(n) && (n as number) >= 0))) throw new Error('Consommation IA invalide.');
  return { text: value.text as string, calls, ...(usage ? { usage: usage as ModelReply['usage'] } : {}) };
}

export function validateModelRequest(value: unknown): ModelRequest {
  if (!record(value) || !onlyKeys(value, ['character','messages']) || !record(value.character) || !Array.isArray(value.messages) || !value.messages.length || value.messages.length > 48 || JSON.stringify(value).length > 60_000) throw new Error('Conversation trop grande ou invalide.');
  const c = value.character;
  if (!onlyKeys(c, ['id','name','bio','universe','language','tone','traits']) || (record(c.traits) && !onlyKeys(c.traits, ['energy','sociability','playfulness']))) throw new Error('Champs de profil non autorisés.');
  if (!boundedString(c.id, 100) || !boundedString(c.name, 40) || !boundedString(c.bio, 2000) || (c.universe !== undefined && !boundedString(c.universe, 120)) || !['fr','en','es','de'].includes(String(c.language)) || !['cheerful','calm','playful','shy','grumpy'].includes(String(c.tone)) || !record(c.traits) || !['energy','sociability','playfulness'].every((key) => typeof c.traits === 'object' && c.traits !== null && Number.isFinite((c.traits as Record<string, unknown>)[key]) && Number((c.traits as Record<string, unknown>)[key]) >= 0 && Number((c.traits as Record<string, unknown>)[key]) <= 1)) throw new Error('Profil du personnage invalide.');
  const pending = new Set<string>();
  let previous = '';
  for (const raw of value.messages) {
    if (!record(raw) || !onlyKeys(raw, ['role','content','calls','callId']) || !['user','assistant','tool'].includes(String(raw.role)) || !boundedString(raw.content, 8000)) throw new Error('Message invalide.');
    if (raw.role === 'tool') {
      if (typeof raw.callId !== 'string' || !pending.delete(raw.callId) || raw.calls !== undefined) throw new Error('Observation sans appel d’outil.');
    } else {
      if (raw.callId !== undefined) throw new Error('Identifiant réservé aux résultats d’outil.');
      if (pending.size) throw new Error('Résultat d’outil manquant.');
      if (raw.role === 'user' && previous === 'user') throw new Error('Deux messages utilisateur consécutifs.');
      if (raw.calls !== undefined) {
        if (raw.role !== 'assistant' || !Array.isArray(raw.calls) || !raw.calls.length || raw.calls.length > 4) throw new Error('Appels d’outil invalides.');
        for (const call of raw.calls.map(validateToolCall)) {
          if (pending.has(call.id)) throw new Error('Appel dupliqué.'); pending.add(call.id);
        }
      }
    }
    previous = String(raw.role);
  }
  if (pending.size || value.messages[0]?.role !== 'user' || !['user','tool'].includes(String(value.messages.at(-1)?.role))) throw new Error('Conversation incomplète.');
  return structuredClone(value) as unknown as ModelRequest;
}

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
export const MODEL_TOOLS = [
  { type: 'function', function: { name: 'companion_wave', description: 'Start the companion’s greeting animation. This does not speak, click or move any other application. A static image cannot gain articulated arms.', parameters: schema({}) } },
  { type: 'function', function: { name: 'media_pause', description: 'Pause the media session selected by Windows and observe its state. Does not select a specific video.', parameters: schema({}) } },
  { type: 'function', function: { name: 'media_play', description: 'Resume the media session selected by Windows and observe its state.', parameters: schema({}) } },
  { type: 'function', function: { name: 'open_application', description: 'Ask Windows to open an installed app. Does not join a Discord call or send a message.', parameters: schema({ application: { type: 'string', enum: ['calculator','notepad','discord'] } }, ['application']) } },
  { type: 'function', function: { name: 'open_page', description: 'Open a public HTTPS page in Persona’s separate browser window. Cannot read, click or type into the page. Opening is not proof the page loaded.', parameters: schema({ url: { type: 'string', maxLength: 2048 } }, ['url']) } },
  { type: 'function', function: { name: 'search_web', description: 'Open a search page in Persona’s browser for the user. Does not read or verify the search results.', parameters: schema({ query: { type: 'string', maxLength: 300 } }, ['query']) } },
] as const;
