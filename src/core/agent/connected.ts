import type { AgentEvent, AgentProvider, AgentTask } from './agent';
import { validateModelReply, type AgentCharacter, type AgentTransport, type ModelMessage, type ToolCall, type ToolObservation } from './protocol';

export interface ToolExecutor { execute(call: ToolCall, signal: AbortSignal): Promise<ToolObservation> }
const stopped = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Tâche arrêtée.', 'AbortError'); };

/** Model → validated tools → observations → model. No action is inferred from prose. */
export class ConnectedAgent implements AgentProvider {
  readonly id = 'persona-service';
  readonly tier = 'payg' as const;
  private turns: ModelMessage[][] = [];
  private busy = false;
  constructor(private character: AgentCharacter, private transport: AgentTransport, private tools: ToolExecutor) {}
  async isAvailable() { return true; } // The host creates this provider only after service readiness.
  async *run(task: AgentTask, signal = new AbortController().signal): AsyncIterable<AgentEvent> {
    if (this.busy) { yield { type: 'error', message: 'Une tâche est déjà en cours.' }; return; }
    const prompt = task.prompt.replace(/\u0000/g, '').trim();
    if (!prompt || prompt.length > 4000) { yield { type: 'error', message: 'Demande vide ou trop longue (4000 caractères maximum).' }; return; }
    this.busy = true;
    const turn: ModelMessage[] = [{ role: 'user', content: prompt }];
    // Keep complete turns so a tool observation never loses its corresponding call.
    const previous = this.turns.slice(-4).flat();
    while ((previous.length > 28 || JSON.stringify(previous).length > 24_000) && previous.length) {
      previous.shift();
      while (previous.length && previous[0]!.role !== 'user') previous.shift();
    }
    let actionCount = 0;
    const usedIds = new Set<string>();
    try {
      for (let round = 0; round < 4; round++) {
        stopped(signal);
        yield { type: 'thinking' };
        const reply = validateModelReply(await this.transport.step({ character: this.character, messages: [...previous, ...turn] }, signal));
        stopped(signal);
        if (reply.usage) yield { type: 'usage', ...reply.usage };
        if (!reply.calls.length) {
          if (!reply.text.trim()) throw new Error('Le service n’a fourni aucune réponse.');
          turn.push({ role: 'assistant', content: reply.text });
          this.turns.push(turn); this.turns = this.turns.slice(-4);
          yield { type: 'message', text: reply.text };
          yield { type: 'done' }; return;
        }
        if (round === 3 || actionCount + reply.calls.length > 6) throw new Error('Limite d’actions atteinte. Les actions déjà exécutées figurent dans le journal.');
        // Validate all ids before executing the first action in this response.
        if (reply.calls.some((call) => usedIds.has(call.id))) throw new Error('Le modèle a répété un identifiant d’action.');
        turn.push({ role: 'assistant', content: reply.text, calls: reply.calls });
        for (const call of reply.calls) {
          stopped(signal); usedIds.add(call.id); actionCount++;
          yield { type: 'action', name: call.name, args: call.args, id: call.id };
          let observation: ToolObservation;
          try { observation = await this.tools.execute(call, signal); }
          catch (error) {
            if (signal.aborted) throw error;
            observation = { ok: false, summary: String(error).slice(0, 600) };
          }
          // Preserve the result of a completed action even if stop was requested during it.
          yield { type: 'observation', id: call.id, name: call.name, result: observation };
          turn.push({ role: 'tool', content: JSON.stringify(observation).slice(0, 2400), callId: call.id });
        }
      }
    } catch (error) {
      // Keep observed effects in context after a stop/error; never replay an unknown outcome.
      const answered = new Set(turn.filter((message) => message.role === 'tool').map((message) => message.callId));
      for (const call of turn.flatMap((message) => message.calls ?? [])) if (!answered.has(call.id)) {
        turn.push({ role: 'tool', callId: call.id, content: JSON.stringify({ ok: false, summary: usedIds.has(call.id) ? 'Résultat non reçu ; effet éventuel à vérifier, ne pas répéter automatiquement.' : 'Action non exécutée : tâche interrompue.' }) });
      }
      turn.push({ role: 'assistant', content: 'Tâche interrompue ou en erreur. Consulter les résultats des outils ; aucune réussite supplémentaire n’est confirmée.' });
      this.turns.push(turn); this.turns = this.turns.slice(-4);
      if (signal.aborted) yield { type: 'stopped' };
      else yield { type: 'error', message: error instanceof Error ? error.message : 'L’agent a rencontré une erreur.' };
    } finally { this.busy = false; }
  }
}
