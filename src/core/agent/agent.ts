/**
 * Agent Interface — future connection to AI tools and models. Nothing here runs today:
 * the free companion works entirely without it. Kept as a contract so hosts and UI can be
 * wired once, then providers (local model, cloud pay-as-you-go…) plug in later.
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
  | { type: 'action'; name: string; args: Record<string, unknown> }
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
