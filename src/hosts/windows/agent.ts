import type { AgentTransport, ConnectionStatus, ToolCall, ToolObservation } from '../../core/agent/protocol';
import { record, validateModelReply, validateToolCall } from '../../core/agent/protocol';
import type { ToolExecutor } from '../../core/agent/connected';
import type { DesktopBridge } from './desktop';

export function nativeAgentTransport(bridge: DesktopBridge): AgentTransport {
  return { async step(request, signal) {
    signal.throwIfAborted();
    const requestId = crypto.randomUUID();
    const abort = () => { void bridge.invoke('agent_cancel', { requestId }).catch(() => undefined); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      const response = await bridge.invoke('agent_step', { requestId, request });
      signal.throwIfAborted(); return validateModelReply(response);
    } finally { signal.removeEventListener('abort', abort); }
  } };
}
export function nativeToolExecutor(bridge: DesktopBridge, wave?: () => boolean): ToolExecutor {
  return { async execute(call: ToolCall, signal): Promise<ToolObservation> {
    signal.throwIfAborted();
    const validated = validateToolCall(call);
    if (validated.name === 'companion_wave') {
      return wave?.() ? { ok: true, summary: 'Animation de salut déclenchée dans la scène. Une image fixe reste animée en entier ; elle ne gagne pas de bras articulés.' } : { ok: false, summary: 'Le compagnon est masqué ou la scène n’est pas disponible.' };
    }
    const result = await bridge.invoke('agent_tool', { call: validated });
    if (!record(result) || typeof result.ok !== 'boolean' || typeof result.summary !== 'string' || result.summary.length > 2000) throw new Error('Le résultat de l’action n’a pas pu être vérifié.');
    return { ok: result.ok, summary: result.summary, ...(result.data !== undefined ? { data: result.data } : {}) };
  } };
}
export async function nativeAgentStatus(bridge: DesktopBridge): Promise<ConnectionStatus> {
  try {
    const value = await bridge.invoke('agent_status');
    if (record(value) && ['ready','notConfigured','notPaired','unavailable'].includes(String(value.state)) && typeof value.detail === 'string') return { state: value.state as ConnectionStatus['state'], detail: value.detail.slice(0, 400), paired: typeof value.paired === 'boolean' ? value.paired : value.state === 'ready' };
  } catch { /* A missing/unreachable service keeps the local companion usable. */ }
  return { state: 'notConfigured', detail: 'Le service IA Persona reste à connecter.' };
}
