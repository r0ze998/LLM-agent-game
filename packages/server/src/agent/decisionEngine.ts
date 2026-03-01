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
  | { type: 'heal'; targetId: string }
  | { type: 'migrate'; targetVillageId: string };  // F7: Migration

const AVAILABLE_ACTIONS = [
  'move', 'gather', 'eat', 'sleep', 'build', 'farm',
  'craft', 'socialize', 'explore', 'rest', 'teach', 'heal',
  // 4X-aware actions — agents choose based on village strategic state
  'gather_iron', 'defend', 'patrol',
  // F7: Migration
  'migrate',
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
  // 4X-aware actions map to existing action types
  if (action === 'gather_iron') return { type: 'gather', resource: 'ore' };
  if (action === 'defend' || action === 'patrol') return { type: 'explore' };
  // F7: Migration
  if (action === 'migrate') return { type: 'migrate', targetVillageId: target ?? '' };

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
  soulText?: string;
  behaviorRules?: string[];
  backstory?: string;
  // 4X Strategy context (if agent belongs to a village with 4X state)
  villageStrategy?: {
    resources: Record<string, number>;
    population: number;
    militaryStrength: number;
    atWar: boolean;
    researchedTechs: string[];
  };
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
    soulText: ctx.soulText,
    behaviorRules: ctx.behaviorRules,
    backstory: ctx.backstory,
    villageStrategy: ctx.villageStrategy,
  };

  const { system, user } = buildDailyPlanPrompt(promptCtx);

  try {
    const raw = await callLLM({
      system,
      userMessage: user,
      importance: 'routine',
      cacheKey: `plan_${ctx.agent.identity.id}_day${Math.floor(ctx.tick / TICKS_PER_DAY)}`,
      maxTokens: 2048,
    });
    return extractJSON<DailyPlan>(raw);
  } catch (err) {
    console.warn(`LLM unavailable for ${ctx.agent.identity.name}, using rule-based plan`, (err as Error).message?.slice(0, 120));
    return createFallbackPlan(ctx.agent);
  }
}

function createFallbackPlan(agent: AgentState): DailyPlan {
  const schedule = Array.from({ length: 24 }, (_, i) => {
    let action: string;
    let target: string | undefined;

    if (i < 5) {
      action = 'sleep';
    } else if (i === 5 || i === 12 || i === 19) {
      // Mealtime: eat if food available, otherwise gather
      action = (agent.inventory.food ?? 0) > 0 ? 'eat' : 'gather';
      if (action === 'gather') target = 'food';
    } else if (i >= 6 && i < 12) {
      // Morning: main work — branch based on skills
      action = pickWorkAction(agent);
      target = pickWorkTarget(agent, action);
    } else if (i >= 13 && i < 17) {
      // Early afternoon: exploration + resource gathering
      action = i % 2 === 0 ? 'explore' : 'gather';
      if (action === 'gather') target = pickGatherTarget(agent);
    } else if (i >= 17 && i < 19) {
      // Evening: socializing
      action = 'socialize';
    } else {
      // Night: rest
      action = 'rest';
    }

    return { slot: i, action, target, reason: 'rule-based' };
  });

  return {
    innerThought: 'Another day — let me focus on what needs to be done.',
    schedule,
    socialIntentions: [],
  };
}

function pickWorkAction(agent: AgentState): string {
  const skills = agent.identity.skills;
  // Find highest skill
  let bestSkill = 'farming';
  let bestLevel = 0;
  for (const [skill, level] of Object.entries(skills)) {
    if (level > bestLevel) {
      bestLevel = level;
      bestSkill = skill;
    }
  }

  const skillToAction: Record<string, string> = {
    farming: 'farm',
    building: 'build',
    crafting: 'craft',
    healing: 'gather',   // gather herbs
    teaching: 'teach',
    leadership: 'socialize',
    combat: 'explore',
    diplomacy: 'socialize',
  };

  const action = skillToAction[bestSkill] ?? 'gather';

  // If building but no materials, gather instead
  if (action === 'build') {
    const hasWood = (agent.inventory.wood ?? 0) >= 5;
    const hasStone = (agent.inventory.stone ?? 0) >= 3;
    if (!hasWood || !hasStone) return 'gather';
  }

  // If crafting but no materials, gather instead
  if (action === 'craft') {
    const hasWood = (agent.inventory.wood ?? 0) >= 2;
    const hasStone = (agent.inventory.stone ?? 0) >= 1;
    if (!hasWood || !hasStone) return 'gather';
  }

  return action;
}

function pickWorkTarget(agent: AgentState, action: string): string | undefined {
  if (action === 'build') return 'house';
  if (action === 'gather') return pickGatherTarget(agent);
  if (action === 'craft') return 'tool';
  return undefined;
}

function pickGatherTarget(agent: AgentState): string {
  // Prioritize what the agent lacks most
  const resources: { type: string; amount: number }[] = [
    { type: 'food', amount: agent.inventory.food ?? 0 },
    { type: 'wood', amount: agent.inventory.wood ?? 0 },
    { type: 'stone', amount: agent.inventory.stone ?? 0 },
  ];
  resources.sort((a, b) => a.amount - b.amount);
  return resources[0].type;
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
        { speakerId: ctx.agent1.identity.id, text: 'Hello there.' },
        { speakerId: ctx.agent2.identity.id, text: 'Oh, hello.' },
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
      reflection: 'A lot has happened, but I will keep moving forward.',
    };
  }
}
