import type { AgentState, Relationship, Memory, ConversationResult, DialogueLine, GameEvent } from '@murasato/shared';
import { VISION_RANGE } from '@murasato/shared';
import { callLLM, extractJSON, LLMBudgetExceeded } from '../agent/llmClient.ts';
import { getOrCreateRelationship, adjustSentiment, adjustTrust, adjustFamiliarity, calculateCompatibility } from './relationships.ts';
import { MemoryManager } from '../agent/memory.ts';

// --- Conversation triggers ---

export interface ConversationOpportunity {
  agent1: AgentState;
  agent2: AgentState;
  situation: string;
  priority: number; // Higher = more likely to happen
}

export function findConversationOpportunities(
  agents: AgentState[],
  relationships: Map<string, Relationship[]>,
  tick: number,
): ConversationOpportunity[] {
  const living = agents.filter(a => a.identity.status !== 'dead');
  const opportunities: ConversationOpportunity[] = [];
  const used = new Set<string>();

  for (let i = 0; i < living.length; i++) {
    const a1 = living[i];
    if (used.has(a1.identity.id)) continue;

    for (let j = i + 1; j < living.length; j++) {
      const a2 = living[j];
      if (used.has(a2.identity.id)) continue;

      const dist = Math.abs(a1.position.x - a2.position.x) + Math.abs(a1.position.y - a2.position.y);
      if (dist > 8) continue;

      const rel12 = relationships.get(a1.identity.id)?.find(r => r.targetId === a2.identity.id);
      const rel21 = relationships.get(a2.identity.id)?.find(r => r.targetId === a1.identity.id);

      // Determine situation and priority
      const { situation, priority } = determineSituation(a1, a2, rel12, rel21, dist, tick);

      // Probability check
      const roll = Math.random();
      if (roll > priority) continue;

      opportunities.push({ agent1: a1, agent2: a2, situation, priority });
      used.add(a1.identity.id);
      used.add(a2.identity.id);
    }
  }

  return opportunities.sort((a, b) => b.priority - a.priority);
}

function determineSituation(
  a1: AgentState,
  a2: AgentState,
  rel12: Relationship | undefined,
  rel21: Relationship | undefined,
  distance: number,
  tick: number,
): { situation: string; priority: number } {
  // First meeting
  if (!rel12 || rel12.familiarity < 5) {
    return {
      situation: `${a1.identity.name} and ${a2.identity.name} meet for the first time.`,
      priority: 0.6,
    };
  }

  // Long time no see
  const ticksSince = tick - (rel12.lastInteractionTick ?? 0);
  if (ticksSince > 50) {
    return {
      situation: `${a1.identity.name} and ${a2.identity.name} reunite after a long time apart.`,
      priority: 0.5,
    };
  }

  // Rivals meet
  if ((rel12.sentiment ?? 0) < -30) {
    return {
      situation: `${a1.identity.name} and ${a2.identity.name} are glaring at each other.`,
      priority: 0.45,
    };
  }

  // Close friends
  if ((rel12.sentiment ?? 0) > 50) {
    return {
      situation: `Close companions ${a1.identity.name} and ${a2.identity.name} are chatting together.`,
      priority: 0.4,
    };
  }

  // Default casual encounter
  return {
    situation: `${a1.identity.name} and ${a2.identity.name} happen to pass by each other.`,
    priority: 0.3,
  };
}

// --- Generate conversation with LLM ---

export interface AgentSoulContext {
  soul?: string;
  rules?: string[];
}

export async function generateConversation(
  a1: AgentState,
  a2: AgentState,
  rel12: Relationship | null,
  rel21: Relationship | null,
  situation: string,
  sharedVillage: boolean,
  soulContexts?: { a1?: AgentSoulContext; a2?: AgentSoulContext },
): Promise<ConversationResult> {
  const descP = (a: AgentState) => {
    const p = a.identity.personality;
    const traits: string[] = [];
    if (p.openness > 60) traits.push('curious');
    else if (p.openness < 40) traits.push('conservative');
    if (p.agreeableness > 60) traits.push('gentle');
    else if (p.agreeableness < 40) traits.push('confrontational');
    if (p.courage > 60) traits.push('brave');
    else if (p.courage < 40) traits.push('cautious');
    return traits.join(', ') || 'ordinary';
  };

  const rel12Desc = rel12
    ? `sentiment ${rel12.sentiment}/trust ${rel12.trust}/familiarity ${rel12.familiarity}${rel12.roles.length > 0 ? ` [${rel12.roles.join(',')}]` : ''}`
    : 'first meeting';
  const rel21Desc = rel21
    ? `sentiment ${rel21.sentiment}/trust ${rel21.trust}/familiarity ${rel21.familiarity}`
    : 'first meeting';

  const sc1 = soulContexts?.a1;
  const sc2 = soulContexts?.a2;

  let systemParts = [`You are a conversation simulator for a JRPG world.
Generate a conversation between two characters. Stay faithful to their personalities, relationships, and the situation.
${sharedVillage ? 'The two are fellow villagers from the same village.' : 'The two are from different villages (or unaffiliated).'}`];

  if (sc1?.soul || sc2?.soul) {
    systemParts.push('');
    if (sc1?.soul) systemParts.push(`=== ${a1.identity.name}'s Soul ===\n${sc1.soul}`);
    if (sc2?.soul) systemParts.push(`=== ${a2.identity.name}'s Soul ===\n${sc2.soul}`);
  }

  if (sc1?.rules?.length || sc2?.rules?.length) {
    systemParts.push('');
    if (sc1?.rules?.length) systemParts.push(`${a1.identity.name}'s behavioral rules: ${sc1.rules.join(' / ')}`);
    if (sc2?.rules?.length) systemParts.push(`${a2.identity.name}'s behavioral rules: ${sc2.rules.join(' / ')}`);
  }

  systemParts.push(`
Reply in the following JSON format only:
{
  "dialogue": [{ "speakerId": "ID", "text": "line of dialogue" }],
  "sentimentChange": { "ID1": number(-10~+10), "ID2": number(-10~+10) },
  "trustChange": { "ID1": number(-5~+5), "ID2": number(-5~+5) },
  "newMemories": [{ "agentId": "ID", "content": "memory", "importance": 0.0-1.0 }],
  "informationExchange": ["shared information"]
}`);

  const system = systemParts.join('\n');

  const user = `=== ${situation} ===

[${a1.identity.name}] (ID: ${a1.identity.id})
Personality: ${descP(a1)} / Beliefs: ${a1.identity.philosophy.values.join(',')}
${a1.identity.name} -> ${a2.identity.name}: ${rel12Desc}
Current action: ${a1.currentAction ?? 'none'}

[${a2.identity.name}] (ID: ${a2.identity.id})
Personality: ${descP(a2)} / Beliefs: ${a2.identity.philosophy.values.join(',')}
${a2.identity.name} -> ${a1.identity.name}: ${rel21Desc}
Current action: ${a2.currentAction ?? 'none'}

Generate a short conversation of 2-4 turns in JSON format. Keep dialogue lines short and natural. Use IDs as keys for sentimentChange and trustChange.`;

  try {
    const raw = await callLLM({ system, userMessage: user, importance: 'social', maxTokens: 2048 });
    const parsed = extractJSON<ConversationResult & { trustChange?: Record<string, number>; informationExchange?: string[] }>(raw);

    return {
      dialogue: parsed.dialogue ?? [],
      sentimentChange: parsed.sentimentChange ?? {},
      newMemories: parsed.newMemories ?? [],
    };
  } catch (err) {
    if (err instanceof LLMBudgetExceeded) {
      console.warn(`LLM budget exceeded, using fallback conversation (${a1.identity.name}x${a2.identity.name})`);
    } else {
      console.warn(`Conversation LLM failed (${a1.identity.name}x${a2.identity.name}):`, (err as Error).message?.slice(0, 200));
    }
    // F11: Template-based fallback conversation
    return generateFallbackConversation(a1, a2, rel12);
  }
}

// --- F11: Template-based fallback conversation by relationship state ---

const FALLBACK_GREETINGS: Record<string, string[]> = {
  first_meeting: [
    'Nice to meet you. And you are...?',
    'Oh, an unfamiliar face.',
    'Hello. Are you from around here?',
  ],
  friendly: [
    'Hey, how have you been?',
    'Oh! Good to see you.',
    'Nice weather. How are things?',
  ],
  hostile: [
    '...What do you want.',
    'Hmph, you again.',
    'Stay away from me.',
  ],
  default: [
    'Hey.',
    'Hello.',
    'Hi there.',
  ],
};

const FALLBACK_RESPONSES: Record<string, string[]> = {
  first_meeting: [
    'Yes, I live here. Pleased to meet you.',
    'Hello, nice to meet you. Hope we get along.',
  ],
  friendly: [
    'Yeah, doing alright. How about you?',
    'Thanks. Been pretty busy lately.',
  ],
  hostile: [
    '...Get lost if you have nothing to say.',
    'I have nothing to say to you.',
  ],
  default: [
    'Oh, hello.',
    'Hi there.',
  ],
};

export function generateFallbackConversation(
  a1: AgentState,
  a2: AgentState,
  rel12: Relationship | null,
): ConversationResult {
  const compat = calculateCompatibility(a1, a2);
  let state: string;
  if (!rel12 || rel12.familiarity < 5) state = 'first_meeting';
  else if (rel12.sentiment > 30) state = 'friendly';
  else if (rel12.sentiment < -30) state = 'hostile';
  else state = 'default';

  const greetings = FALLBACK_GREETINGS[state];
  const responses = FALLBACK_RESPONSES[state];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  const response = responses[Math.floor(Math.random() * responses.length)];
  const change = compat > 0.6 ? 2 : compat > 0.4 ? 1 : -1;

  return {
    dialogue: [
      { speakerId: a1.identity.id, text: greeting },
      { speakerId: a2.identity.id, text: response },
    ],
    sentimentChange: { [a1.identity.id]: change, [a2.identity.id]: change },
    newMemories: [],
  };
}

// --- Apply conversation results to world state ---

export function applyConversationResults(
  result: ConversationResult,
  a1: AgentState,
  a2: AgentState,
  relationships: Map<string, Relationship[]>,
  tick: number,
  gameId: string = '',
): void {
  // Apply sentiment changes
  for (const [agentId, change] of Object.entries(result.sentimentChange)) {
    const targetId = agentId === a1.identity.id ? a2.identity.id : a1.identity.id;
    const rel = getOrCreateRelationship(relationships, agentId, targetId, tick);
    adjustSentiment(rel, change);
    adjustFamiliarity(rel, 3);
    adjustTrust(rel, Math.sign(change));
    rel.lastInteractionTick = tick;
  }

  // Store memories
  for (const mem of result.newMemories) {
    const memManager = new MemoryManager(mem.agentId, gameId);
    memManager.addMemory(mem.content, mem.importance, tick, 'episodic');
  }
}

// --- Create conversation event ---

export function createConversationEvent(
  gameId: string,
  a1: AgentState,
  a2: AgentState,
  result: ConversationResult,
  tick: number,
): GameEvent {
  const turns = result.dialogue.length;
  const summary = turns > 0
    ? `${a1.identity.name} and ${a2.identity.name} had a conversation (${turns} turns)`
    : `${a1.identity.name} and ${a2.identity.name} had a conversation`;
  return {
    id: `evt_${crypto.randomUUID()}`,
    gameId,
    type: 'conversation',
    tick,
    actorIds: [a1.identity.id, a2.identity.id],
    description: summary,
    data: { dialogue: result.dialogue, sentimentChange: result.sentimentChange },
  };
}
