import type { AgentState, Relationship, Memory, PlayerIntention, Village } from '@murasato/shared';

// --- Personality description ---

function describePersonality(p: AgentState['identity']['personality']): string {
  const traits: string[] = [];
  if (p.openness > 70) traits.push('好奇心旺盛');
  else if (p.openness < 30) traits.push('保守的');
  if (p.agreeableness > 70) traits.push('協調的');
  else if (p.agreeableness < 30) traits.push('競争的');
  if (p.conscientiousness > 70) traits.push('計画的');
  else if (p.conscientiousness < 30) traits.push('即興的');
  if (p.courage > 70) traits.push('大胆');
  else if (p.courage < 30) traits.push('慎重');
  if (p.ambition > 70) traits.push('野心的');
  else if (p.ambition < 30) traits.push('知足');
  return traits.join('、') || '平凡';
}

function describePhilosophy(ph: AgentState['identity']['philosophy']): string {
  return `統治観: ${ph.governance} / 経済観: ${ph.economics} / 信条: ${ph.values.join(', ')} / 世界観: ${ph.worldview}`;
}

function formatMemories(memories: Memory[], limit: number): string {
  return memories
    .slice(0, limit)
    .map((m, i) => `${i + 1}. [tick ${m.tick}] ${m.content}`)
    .join('\n');
}

function formatRelationships(rels: Relationship[], agentNames: Map<string, string>): string {
  if (rels.length === 0) return 'まだ深い関係はない';
  return rels
    .slice(0, 5)
    .map(r => {
      const name = agentNames.get(r.targetId) ?? '不明';
      const feeling = r.sentiment > 50 ? '好意的' : r.sentiment > 0 ? 'やや好意的' : r.sentiment > -50 ? 'やや敵対的' : '敵対的';
      return `- ${name}: ${feeling} (信頼${r.trust}, 親密度${r.familiarity}) ${r.roles.length > 0 ? `[${r.roles.join(', ')}]` : ''}`;
    })
    .join('\n');
}

// --- Daily Plan Prompt ---

export interface DailyPlanContext {
  agent: AgentState;
  memories: Memory[];
  relationships: Relationship[];
  agentNames: Map<string, string>;
  village: Village | null;
  nearbyAgents: { id: string; name: string; distance: number }[];
  availableActions: string[];
  intentions: PlayerIntention[];
  tick: number;
}

export function buildDailyPlanPrompt(ctx: DailyPlanContext): { system: string; user: string } {
  const { agent, memories, relationships, agentNames, village, nearbyAgents, availableActions, intentions, tick } = ctx;
  const { identity, needs } = agent;

  const system = `あなたはJRPGの世界に生きるキャラクター「${identity.name}」です。
あなたは自分の性格と信念に基づいて、今日一日の計画を立ててください。
返答は必ず以下のJSON形式のみで返してください。マークダウンのコードブロックは使わないでください。

{
  "innerThought": "今の気持ちや考え（1-2文）",
  "schedule": [
    { "slot": 0, "action": "行動名", "target": "対象（任意）", "reason": "理由" },
    ...24スロット分
  ],
  "socialIntentions": [
    { "targetAgentId": "ID", "intention": "話したいこと" }
  ],
  "philosophyShift": null
}

行動名の選択肢: ${availableActions.join(', ')}`;

  const intentionText = intentions.length > 0
    ? intentions.map(i => `[${i.strength}] ${i.message}`).join('\n')
    : 'なし';

  const user = `=== ${identity.name}の朝 (tick ${tick}) ===

【基本情報】
名前: ${identity.name} / 世代: ${identity.generation} / 年齢: ${identity.age} / 状態: ${identity.status}
性格: ${describePersonality(identity.personality)}
信条: ${describePhilosophy(identity.philosophy)}
所属: ${village ? village.name : '無所属（放浪中）'}

【身体状態】
空腹: ${needs.hunger}/100 / 体力: ${needs.energy}/100 / 社交欲: ${needs.social}/100

【最近の記憶】
${formatMemories(memories, 15)}

【人間関係】
${formatRelationships(relationships, agentNames)}

【周囲の状況】
近くにいる人: ${nearbyAgents.length > 0 ? nearbyAgents.map(a => `${a.name}(${a.distance}マス)`).join(', ') : '誰もいない'}

【天の声（プレイヤーの意図）】
${intentionText}

今日の24スロット分の計画をJSON形式で立ててください。`;

  return { system, user };
}

// --- Conversation Prompt ---

export interface ConversationContext {
  agent1: AgentState;
  agent2: AgentState;
  relationship12: Relationship | null;
  relationship21: Relationship | null;
  agent1Memories: Memory[];
  agent2Memories: Memory[];
  situation: string;
}

export function buildConversationPrompt(ctx: ConversationContext): { system: string; user: string } {
  const { agent1, agent2, relationship12, relationship21, situation } = ctx;

  const system = `あなたはJRPGの世界の会話シミュレーターです。
二人のキャラクターの出会いの会話を生成してください。
各キャラクターの性格・関係性・状況に基づいた自然な会話を作ってください。
返答は必ず以下のJSON形式のみで返してください。

{
  "dialogue": [
    { "speakerId": "発言者ID", "text": "セリフ" },
    ...3-6ターン
  ],
  "sentimentChange": { "agent1→agent2の変化": 数値, "agent2→agent1の変化": 数値 },
  "newMemories": [
    { "agentId": "ID", "content": "記憶内容", "importance": 0.0-1.0 }
  ]
}`;

  const sent12 = relationship12 ? `好感度${relationship12.sentiment}, 信頼${relationship12.trust}` : '初対面';
  const sent21 = relationship21 ? `好感度${relationship21.sentiment}, 信頼${relationship21.trust}` : '初対面';

  const user = `=== 出会い ===

${agent1.identity.name}（性格: ${describePersonality(agent1.identity.personality)}）
→ ${agent2.identity.name}への感情: ${sent12}

${agent2.identity.name}（性格: ${describePersonality(agent2.identity.personality)}）
→ ${agent1.identity.name}への感情: ${sent21}

状況: ${situation}

sentimentChangeのキーは "${agent1.identity.id}" と "${agent2.identity.id}" を使ってください。`;

  return { system, user };
}

// --- Reflection Prompt ---

export interface ReflectionContext {
  agent: AgentState;
  recentMemories: Memory[];
}

export function buildReflectionPrompt(ctx: ReflectionContext): { system: string; user: string } {
  const { agent, recentMemories } = ctx;

  const system = `あなたはJRPGの世界に生きる「${agent.identity.name}」です。
最近の出来事を振り返り、自分の考えや信念を更新してください。
返答は必ず以下のJSON形式のみで返してください。

{
  "reflection": "振り返りの文章（2-3文）",
  "beliefChange": null または { "governance"?: "新しい統治観", "economics"?: "新しい経済観", "values"?: ["新しい価値観"], "worldview"?: "新しい世界観" },
  "newInsight": null または "新しい洞察（1文）"
}`;

  const user = `=== ${agent.identity.name}の振り返り ===

性格: ${describePersonality(agent.identity.personality)}
現在の信条: ${describePhilosophy(agent.identity.philosophy)}

【最近の出来事】
${formatMemories(recentMemories, 20)}

これらの経験を踏まえて、振り返りをJSON形式で返してください。`;

  return { system, user };
}

// --- Name Generation Prompt ---

export function buildNamePrompt(parentNames: string[], culturalStyle: string): { system: string; user: string } {
  const system = `あなたはJRPGの世界のキャラクター命名者です。
文化的な命名スタイルに従い、新しいキャラクターの名前を1つだけ返してください。
返答は名前のみ（引用符なし、説明なし）。`;

  const user = `両親: ${parentNames.join('と')}
文化スタイル: ${culturalStyle}
新しい子供の名前を1つだけ返してください。`;

  return { system, user };
}
