import type { AgentState, DailyPlan, PlayerIntention, Relationship, Village, ConversationResult, ReflectionResult } from '@murasato/shared';
import { CRITICAL_NEED_THRESHOLD, TICKS_PER_DAY } from '@murasato/shared';
import { callLLM, extractJSON } from './llmClient.ts';
import { buildDailyPlanPrompt, buildConversationPrompt, buildReflectionPrompt, type DailyPlanContext, type ConversationContext, type ReflectionContext } from './prompts.ts';
import { MemoryManager } from './memory.ts';

// --- Action types ---

export type AgentAction =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'gather'; resource: string }
  | { type: 'eat' }
  | { type: 'sleep' }
  | { type: 'build'; structure: string }
  | { type: 'farm' }
  | { type: 'craft'; item: string }
  | { type: 'socialize'; targetId: string }
  | { type: 'explore' }
  | { type: 'rest' }
  | { type: 'teach'; targetId: string }
  | { type: 'heal'; targetId: string };

const AVAILABLE_ACTIONS = [
  'move', 'gather', 'eat', 'sleep', 'build', 'farm',
  'craft', 'socialize', 'explore', 'rest', 'teach', 'heal',
];

// --- P2: Instinct (rule-based) ---

function checkInstincts(agent: AgentState): AgentAction | null {
  // Critical hunger → eat
  if (agent.needs.hunger <= CRITICAL_NEED_THRESHOLD) {
    const hasFood = (agent.inventory.food ?? 0) > 0;
    if (hasFood) return { type: 'eat' };
    return { type: 'gather', resource: 'food' };
  }

  // Critical energy → sleep
  if (agent.needs.energy <= CRITICAL_NEED_THRESHOLD) {
    return { type: 'sleep' };
  }

  return null;
}

// --- P1: Daily plan (scheduled) ---

function getScheduledAction(plan: DailyPlan | null, tickOfDay: number): AgentAction | null {
  if (!plan || !plan.schedule) return null;

  const slot = plan.schedule.find(s => s.slot === tickOfDay);
  if (!slot) return null;

  return parseAction(slot.action, slot.target);
}

function parseAction(actionStr: string, target?: string): AgentAction {
  const action = actionStr.toLowerCase().trim();

  if (action.startsWith('move')) {
    // Parse direction
    const dirs: Record<string, { dx: number; dy: number }> = {
      north: { dx: 0, dy: -1 }, south: { dx: 0, dy: 1 },
      east: { dx: 1, dy: 0 }, west: { dx: -1, dy: 0 },
      up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
    };
    const dirPart = action.replace('move', '').trim();
    const dir = dirs[dirPart] ?? { dx: Math.round(Math.random() * 2 - 1), dy: Math.round(Math.random() * 2 - 1) };
    return { type: 'move', ...dir };
  }

  if (action === 'gather') return { type: 'gather', resource: target ?? 'food' };
  if (action === 'eat') return { type: 'eat' };
  if (action === 'sleep') return { type: 'sleep' };
  if (action === 'build') return { type: 'build', structure: target ?? 'house' };
  if (action === 'farm') return { type: 'farm' };
  if (action === 'craft') return { type: 'craft', item: target ?? 'tool' };
  if (action === 'socialize') return { type: 'socialize', targetId: target ?? '' };
  if (action === 'explore') return { type: 'explore' };
  if (action === 'teach') return { type: 'teach', targetId: target ?? '' };
  if (action === 'heal') return { type: 'heal', targetId: target ?? '' };

  return { type: 'rest' };
}

// --- P0: LLM decision (novel situations) ---

export interface DecisionContext {
  agent: AgentState;
  memories: MemoryManager;
  relationships: Relationship[];
  agentNames: Map<string, string>;
  village: Village | null;
  nearbyAgents: { id: string; name: string; distance: number }[];
  intentions: PlayerIntention[];
  tick: number;
}

export async function generateDailyPlan(ctx: DecisionContext): Promise<DailyPlan> {
  const topMemories = ctx.memories.getTopMemories(ctx.tick, 15);

  const promptCtx: DailyPlanContext = {
    agent: ctx.agent,
    memories: topMemories,
    relationships: ctx.relationships,
    agentNames: ctx.agentNames,
    village: ctx.village,
    nearbyAgents: ctx.nearbyAgents,
    availableActions: AVAILABLE_ACTIONS,
    intentions: ctx.intentions,
    tick: ctx.tick,
  };

  const { system, user } = buildDailyPlanPrompt(promptCtx);

  const raw = await callLLM({
    system,
    userMessage: user,
    importance: 'routine',
    cacheKey: `plan_${ctx.agent.identity.id}_day${Math.floor(ctx.tick / TICKS_PER_DAY)}`,
  });

  try {
    return extractJSON<DailyPlan>(raw);
  } catch {
    console.warn(`Failed to parse daily plan for ${ctx.agent.identity.name}, using fallback`);
    return createFallbackPlan(ctx.agent);
  }
}

function createFallbackPlan(agent: AgentState): DailyPlan {
  const schedule = Array.from({ length: 24 }, (_, i) => {
    let action: string;
    if (i < 6) action = 'sleep';
    else if (i < 8) action = 'eat';
    else if (i < 12) action = 'gather';
    else if (i < 14) action = 'eat';
    else if (i < 18) action = 'explore';
    else if (i < 20) action = 'socialize';
    else action = 'rest';
    return { slot: i, action, reason: 'fallback plan' };
  });

  return {
    innerThought: '今日も一日頑張ろう。',
    schedule,
    socialIntentions: [],
  };
}

// --- Main decide function ---

export async function decide(ctx: DecisionContext): Promise<AgentAction> {
  const { agent, tick } = ctx;
  const tickOfDay = tick % TICKS_PER_DAY;

  // P2: Instinct check
  const instinct = checkInstincts(agent);
  if (instinct) return instinct;

  // P1: Check daily plan
  let plan = agent.currentAction ? null : (agent as any)._cachedPlan as DailyPlan | null;

  // Generate new plan at start of day
  if (tickOfDay === 0 || !plan) {
    plan = await generateDailyPlan(ctx);
    (agent as any)._cachedPlan = plan;
  }

  const scheduled = getScheduledAction(plan, tickOfDay);
  if (scheduled) return scheduled;

  // P0: Fallback to exploration
  return { type: 'explore' };
}

// --- Conversation generation ---

export async function generateConversation(ctx: ConversationContext): Promise<ConversationResult> {
  const { system, user } = buildConversationPrompt(ctx);

  const raw = await callLLM({
    system,
    userMessage: user,
    importance: 'social',
  });

  try {
    return extractJSON<ConversationResult>(raw);
  } catch {
    return {
      dialogue: [
        { speakerId: ctx.agent1.identity.id, text: 'こんにちは。' },
        { speakerId: ctx.agent2.identity.id, text: 'ああ、こんにちは。' },
      ],
      sentimentChange: { [ctx.agent1.identity.id]: 1, [ctx.agent2.identity.id]: 1 },
      newMemories: [],
    };
  }
}

// --- Reflection ---

export async function generateReflection(ctx: ReflectionContext): Promise<ReflectionResult> {
  const { system, user } = buildReflectionPrompt(ctx);

  const raw = await callLLM({
    system,
    userMessage: user,
    importance: 'important',
  });

  try {
    return extractJSON<ReflectionResult>(raw);
  } catch {
    return {
      reflection: '色々あったが、前を向いて進もう。',
    };
  }
}
