/**
 * Agent providers are optional. ConnectedAgent executes validated tools through
 * a host and obtains model replies from the Persona service. NO_AGENT is the fallback.
 */

/** Offer tiers. No payment logic exists: this only labels which features belong where. */
export type Tier = 'free' | 'payg' | 'premium';

export const FEATURE_TIERS = {
  companion: 'free',
  animations: 'free',
  localGreetings: 'free',
  avatarImport: 'free',
  agentTasks: 'payg',
  aiProfileGeneration: 'payg',
  voice: 'premium',
  localModel: 'premium',
  advancedCustomization: 'premium',
} as const satisfies Record<string, Tier>;

export interface AgentTask {
  id: string;
  /** What the user asked for, in natural language. */
  prompt: string;
  /** Page context the host chose to share (never sent without the user's consent). */
  context?: { url?: string; title?: string; selection?: string };
}

export type AgentEvent =
  | { type: 'thinking' }
  | { type: 'message'; text: string }
  | { type: 'action'; name: string; args: Record<string, unknown>; id?: string }
  | { type: 'observation'; id: string; name: string; result: import('./protocol').ToolObservation }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'stopped' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface AgentProvider {
  readonly id: string;
  readonly tier: Tier;
  isAvailable(): Promise<boolean>;
  run(task: AgentTask, signal?: AbortSignal): AsyncIterable<AgentEvent>;
}

/** Default provider: says it is unavailable. The companion keeps working normally. */
export const NO_AGENT: AgentProvider = {
  id: 'none',
  tier: 'free',
  async isAvailable() { return false; },
  async *run() {
    yield { type: 'error', message: 'Aucun agent IA n’est configuré.' } as AgentEvent;
  },
};
