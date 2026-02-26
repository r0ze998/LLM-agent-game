import type { AgentState, Relationship, Memory, ConversationResult, DialogueLine, GameEvent } from '@murasato/shared';
import { VISION_RANGE } from '@murasato/shared';
import { callLLM, extractJSON } from '../agent/llmClient.ts';
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
      situation: `${a1.identity.name}と${a2.identity.name}が初めて出会った。`,
      priority: 0.6,
    };
  }

  // Long time no see
  const ticksSince = tick - (rel12.lastInteractionTick ?? 0);
  if (ticksSince > 50) {
    return {
      situation: `${a1.identity.name}と${a2.identity.name}が久しぶりに再会した。`,
      priority: 0.5,
    };
  }

  // Rivals meet
  if ((rel12.sentiment ?? 0) < -30) {
    return {
      situation: `${a1.identity.name}と${a2.identity.name}がにらみ合っている。`,
      priority: 0.45,
    };
  }

  // Close friends
  if ((rel12.sentiment ?? 0) > 50) {
    return {
      situation: `親しい仲間の${a1.identity.name}と${a2.identity.name}が談笑している。`,
      priority: 0.4,
    };
  }

  // Default casual encounter
  return {
    situation: `${a1.identity.name}と${a2.identity.name}が近くを通りかかった。`,
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
    if (p.openness > 60) traits.push('好奇心旺盛');
    else if (p.openness < 40) traits.push('保守的');
    if (p.agreeableness > 60) traits.push('温和');
    else if (p.agreeableness < 40) traits.push('対抗的');
    if (p.courage > 60) traits.push('勇敢');
    else if (p.courage < 40) traits.push('慎重');
    return traits.join('、') || '普通';
  };

  const rel12Desc = rel12
    ? `好感度${rel12.sentiment}/信頼${rel12.trust}/親密度${rel12.familiarity}${rel12.roles.length > 0 ? ` [${rel12.roles.join(',')}]` : ''}`
    : '初対面';
  const rel21Desc = rel21
    ? `好感度${rel21.sentiment}/信頼${rel21.trust}/親密度${rel21.familiarity}`
    : '初対面';

  const sc1 = soulContexts?.a1;
  const sc2 = soulContexts?.a2;

  let systemParts = [`あなたはJRPGの世界の会話シミュレーターです。
二人のキャラクターの会話を生成してください。性格・関係性・状況に忠実に。
${sharedVillage ? '二人は同じ村の仲間です。' : '二人は異なる村（または無所属）です。'}`];

  if (sc1?.soul || sc2?.soul) {
    systemParts.push('');
    if (sc1?.soul) systemParts.push(`=== ${a1.identity.name}の魂 ===\n${sc1.soul}`);
    if (sc2?.soul) systemParts.push(`=== ${a2.identity.name}の魂 ===\n${sc2.soul}`);
  }

  if (sc1?.rules?.length || sc2?.rules?.length) {
    systemParts.push('');
    if (sc1?.rules?.length) systemParts.push(`${a1.identity.name}の行動規則: ${sc1.rules.join(' / ')}`);
    if (sc2?.rules?.length) systemParts.push(`${a2.identity.name}の行動規則: ${sc2.rules.join(' / ')}`);
  }

  systemParts.push(`
返答は以下のJSON形式のみ:
{
  "dialogue": [{ "speakerId": "ID", "text": "セリフ" }],
  "sentimentChange": { "ID1": 数値(-10~+10), "ID2": 数値(-10~+10) },
  "trustChange": { "ID1": 数値(-5~+5), "ID2": 数値(-5~+5) },
  "newMemories": [{ "agentId": "ID", "content": "記憶", "importance": 0.0-1.0 }],
  "informationExchange": ["共有された情報"]
}`);

  const system = systemParts.join('\n');

  const user = `=== ${situation} ===

【${a1.identity.name}】(ID: ${a1.identity.id})
性格: ${descP(a1)} / 信条: ${a1.identity.philosophy.values.join(',')}
${a1.identity.name}→${a2.identity.name}: ${rel12Desc}
今の行動: ${a1.currentAction ?? '特になし'}

【${a2.identity.name}】(ID: ${a2.identity.id})
性格: ${descP(a2)} / 信条: ${a2.identity.philosophy.values.join(',')}
${a2.identity.name}→${a1.identity.name}: ${rel21Desc}
今の行動: ${a2.currentAction ?? '特になし'}

2-4ターンの短い会話をJSON形式で生成してください。セリフは短く自然に。sentimentChangeとtrustChangeのキーはIDを使ってください。`;

  try {
    const raw = await callLLM({ system, userMessage: user, importance: 'social', maxTokens: 2048 });
    const parsed = extractJSON<ConversationResult & { trustChange?: Record<string, number>; informationExchange?: string[] }>(raw);

    return {
      dialogue: parsed.dialogue ?? [],
      sentimentChange: parsed.sentimentChange ?? {},
      newMemories: parsed.newMemories ?? [],
    };
  } catch (err) {
    console.warn(`Conversation LLM failed (${a1.identity.name}×${a2.identity.name}):`, (err as Error).message?.slice(0, 200));
    // Fallback conversation
    const compat = calculateCompatibility(a1, a2);
    const change = compat > 0.6 ? 2 : compat > 0.4 ? 1 : -1;

    return {
      dialogue: [
        { speakerId: a1.identity.id, text: 'やあ。' },
        { speakerId: a2.identity.id, text: 'こんにちは。' },
      ],
      sentimentChange: { [a1.identity.id]: change, [a2.identity.id]: change },
      newMemories: [],
    };
  }
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
    ? `${a1.identity.name}と${a2.identity.name}が会話した（${turns}ターン）`
    : `${a1.identity.name}と${a2.identity.name}が会話した`;
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
