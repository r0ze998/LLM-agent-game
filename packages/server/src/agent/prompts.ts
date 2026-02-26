import type {
  AgentState, Relationship, Memory, PlayerIntention, Village, VillageState4X,
  Covenant, Invention, Institution, ClauseType, AutonomousWorldState,
} from '@murasato/shared';
import { CLAUSE_PARAM_BOUNDS, EFFECT_BOUNDS, INVENTION_LIMITS, INSTITUTION_LIMITS } from '@murasato/shared';

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
  soulText?: string;
  behaviorRules?: string[];
  backstory?: string;
  // 4X Strategy context
  villageStrategy?: {
    resources: Record<string, number>;
    population: number;
    militaryStrength: number;
    atWar: boolean;
    researchedTechs: string[];
  };
}

export function buildDailyPlanPrompt(ctx: DailyPlanContext): { system: string; user: string } {
  const { agent, memories, relationships, agentNames, village, nearbyAgents, availableActions, intentions, tick, soulText, behaviorRules, backstory, villageStrategy } = ctx;
  const { identity, needs } = agent;

  let systemParts = [`あなたはJRPGの世界に生きるキャラクター「${identity.name}」です。
あなたは自分の性格と信念に基づいて、今日一日の計画を立ててください。`];

  if (soulText) {
    systemParts.push(`\n=== あなたの魂 ===\n${soulText}`);
  }

  if (behaviorRules && behaviorRules.length > 0) {
    systemParts.push(`\n=== 行動規則（必ず従うこと） ===\n${behaviorRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  systemParts.push(`\n返答は必ず以下のJSON形式のみで返してください。マークダウンのコードブロックは使わないでください。

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

行動名の選択肢: ${availableActions.join(', ')}`);

  const system = systemParts.join('\n');

  const intentionText = intentions.length > 0
    ? intentions.map(i => `[${i.strength}] ${i.message}`).join('\n')
    : 'なし';

  let userParts = [`=== ${identity.name}の朝 (tick ${tick}) ===

【基本情報】
名前: ${identity.name} / 世代: ${identity.generation} / 年齢: ${identity.age} / 状態: ${identity.status}
性格: ${describePersonality(identity.personality)}
信条: ${describePhilosophy(identity.philosophy)}
所属: ${village ? village.name : '無所属（放浪中）'}`];

  if (backstory) {
    userParts.push(`\n【魂の記憶（前世）】\n${backstory}`);
  }

  userParts.push(`
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

今日の24スロット分の計画をJSON形式で立ててください。`);

  // 4X strategy context — エージェントが村の戦略状態を認識できるように
  if (villageStrategy) {
    userParts.push(`
【村の戦略状況】
人口: ${villageStrategy.population} / 軍事力: ${villageStrategy.militaryStrength}
資源: 食料${villageStrategy.resources.food ?? 0}, 木材${villageStrategy.resources.wood ?? 0}, 石材${villageStrategy.resources.stone ?? 0}, 鉄${villageStrategy.resources.iron ?? 0}, 金${villageStrategy.resources.gold ?? 0}
戦争状態: ${villageStrategy.atWar ? '交戦中' : '平和'}
研究済み技術: ${villageStrategy.researchedTechs.length > 0 ? villageStrategy.researchedTechs.join(', ') : 'なし'}
※ gather_iron（鉄採集）、defend（防衛）、patrol（巡回）も選択可能です。`);
  }

  const user = userParts.join('\n');

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
  soulText?: string;
  behaviorRules?: string[];
  backstory?: string;
}

export function buildReflectionPrompt(ctx: ReflectionContext): { system: string; user: string } {
  const { agent, recentMemories, soulText, behaviorRules, backstory } = ctx;

  let systemParts = [`あなたはJRPGの世界に生きる「${agent.identity.name}」です。
最近の出来事を振り返り、自分の考えや信念を更新してください。`];

  if (soulText) {
    systemParts.push(`\n=== あなたの魂 ===\n${soulText}`);
  }
  if (behaviorRules && behaviorRules.length > 0) {
    systemParts.push(`\n=== 行動規則 ===\n${behaviorRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  systemParts.push(`\n返答は必ず以下のJSON形式のみで返してください。

{
  "reflection": "振り返りの文章（2-3文）",
  "beliefChange": null または { "governance"?: "新しい統治観", "economics"?: "新しい経済観", "values"?: ["新しい価値観"], "worldview"?: "新しい世界観" },
  "newInsight": null または "新しい洞察（1文）"
}`);

  const system = systemParts.join('\n');

  let userParts = [`=== ${agent.identity.name}の振り返り ===

性格: ${describePersonality(agent.identity.personality)}
現在の信条: ${describePhilosophy(agent.identity.philosophy)}`];

  if (backstory) {
    userParts.push(`\n【魂の記憶（前世）】\n${backstory}`);
  }

  userParts.push(`
【最近の出来事】
${formatMemories(recentMemories, 20)}

これらの経験を踏まえて、振り返りをJSON形式で返してください。`);

  const user = userParts.join('\n');

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

// --- Strategy Prompt (4X village leader decision) ---

export interface StrategyOption {
  id: string;
  nameJa: string;
  description: string;
}

export interface StrategyPromptContext {
  leader: AgentState;
  villageName: string;
  villageState: VillageState4X;
  memories: Memory[];
  relationships: Relationship[];
  agentNames: Map<string, string>;
  availableBuildings: StrategyOption[];
  availableTechs: StrategyOption[];
  availableUnits: StrategyOption[];
  neighborVillages: {
    id: string;
    name: string;
    militaryPower: number;
    diplomaticStatus: string;
    villageId: string;
  }[];
  tick: number;
  soulText?: string;
  behaviorRules?: string[];
}

export interface StrategyDecision {
  innerThought: string;
  build: string | null;
  buildReason: string;
  research: string | null;
  researchReason: string;
  train: string | null;
  trainReason: string;
  diplomacy: {
    targetVillageId: string;
    action: 'declare_war' | 'propose_alliance' | 'propose_peace' | 'break_alliance';
    reason: string;
  } | null;
}

export function buildStrategyPrompt(ctx: StrategyPromptContext): { system: string; user: string } {
  const { leader, villageName, villageState, memories, relationships, agentNames, tick } = ctx;
  const { identity } = leader;
  const vs = villageState;

  // --- System prompt ---
  let systemParts = [`あなたはJRPGの世界に生きる村長「${identity.name}」です。
あなたは${villageName}の指導者として、村の戦略を決定します。
あなたの性格・信念・記憶に基づいて、今何をすべきか判断してください。
「正解」はありません。あなたらしい判断をしてください。`];

  if (ctx.soulText) {
    systemParts.push(`\n=== あなたの魂 ===\n${ctx.soulText}`);
  }
  if (ctx.behaviorRules && ctx.behaviorRules.length > 0) {
    systemParts.push(`\n=== 行動規則 ===\n${ctx.behaviorRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  systemParts.push(`\n返答は必ず以下のJSON形式のみで返してください。マークダウンのコードブロックは使わないでください。

{
  "innerThought": "今の状況についての考え（1-3文。あなたの性格が反映されること）",
  "build": "建設する建物のID（不要ならnull）",
  "buildReason": "なぜその建物を選んだか（1文）",
  "research": "研究する技術のID（不要ならnull）",
  "researchReason": "なぜその技術を選んだか（1文）",
  "train": "訓練するユニットのID（不要ならnull）",
  "trainReason": "なぜそのユニットを選んだか（1文）",
  "diplomacy": null または { "targetVillageId": "ID", "action": "declare_war|propose_alliance|propose_peace|break_alliance", "reason": "理由" }
}`);

  const system = systemParts.join('\n');

  // --- User prompt ---
  const garrison = vs.garrison.map(u => `${u.defId}×${u.count}`).join(', ') || 'なし';
  const armies = vs.armies.map(a => `軍(${a.units.map(u => `${u.defId}×${u.count}`).join(', ')})`).join(', ') || 'なし';
  const techs = vs.researchedTechs.size > 0 ? [...vs.researchedTechs].join(', ') : 'なし';
  const buildings = vs.buildings.map(b => b.defId).join(', ') || 'なし';
  const buildQueue = vs.buildQueue.length > 0 ? vs.buildQueue.map(q => q.defId).join(', ') : 'なし';
  const researchQueue = vs.researchQueue.length > 0 ? vs.researchQueue.map(q => q.defId).join(', ') : 'なし';
  const trainQueue = vs.trainQueue.length > 0 ? vs.trainQueue.map(q => q.defId).join(', ') : 'なし';

  let userParts = [`=== ${villageName}の戦略会議 (tick ${tick}) ===

【あなた（村長）の情報】
名前: ${identity.name} / 性格: ${describePersonality(identity.personality)}
信条: ${describePhilosophy(identity.philosophy)}

【村の状態】
人口: ${vs.population} / 住居上限: ${vs.housingCapacity}
食料: ${vs.resources.food} / 木材: ${vs.resources.wood} / 石材: ${vs.resources.stone} / 鉄: ${vs.resources.iron} / 金: ${vs.resources.gold}
研究ポイント: ${Math.floor(vs.researchPoints)} / 文化ポイント: ${vs.totalCulturePoints}
スコア: ${vs.score}

【軍事】
駐留部隊: ${garrison}
派遣軍: ${armies}

【既存施設】${buildings}
【研究済み技術】${techs}
【進行中キュー】建設: ${buildQueue} / 研究: ${researchQueue} / 訓練: ${trainQueue}`];

  // Recent memories
  if (memories.length > 0) {
    userParts.push(`\n【最近の記憶】\n${formatMemories(memories, 10)}`);
  }

  // Relationships with other village leaders
  if (relationships.length > 0) {
    userParts.push(`\n【人間関係】\n${formatRelationships(relationships, agentNames)}`);
  }

  // Neighbor villages
  if (ctx.neighborVillages.length > 0) {
    userParts.push(`\n【周辺の村】`);
    for (const nv of ctx.neighborVillages) {
      const powerLabel = nv.militaryPower > 100 ? '強大' : nv.militaryPower > 50 ? '中程度' : '弱小';
      userParts.push(`- ${nv.name}: 軍事力${powerLabel}(${Math.floor(nv.militaryPower)}) / 外交: ${nv.diplomaticStatus}`);
    }
  }

  // Available options
  if (ctx.availableBuildings.length > 0) {
    userParts.push(`\n【建設可能な建物】`);
    for (const b of ctx.availableBuildings) {
      userParts.push(`- ${b.id}: ${b.nameJa}（${b.description}）`);
    }
  } else {
    userParts.push(`\n【建設可能な建物】なし（資源不足または前提条件未達）`);
  }

  if (ctx.availableTechs.length > 0) {
    userParts.push(`\n【研究可能な技術】`);
    for (const t of ctx.availableTechs) {
      userParts.push(`- ${t.id}: ${t.nameJa}（${t.description}）`);
    }
  } else {
    userParts.push(`\n【研究可能な技術】なし`);
  }

  if (ctx.availableUnits.length > 0) {
    userParts.push(`\n【訓練可能なユニット】`);
    for (const u of ctx.availableUnits) {
      userParts.push(`- ${u.id}: ${u.nameJa}（${u.description}）`);
    }
  } else {
    userParts.push(`\n【訓練可能なユニット】なし`);
  }

  userParts.push(`\nあなたの性格と信念に基づいて、戦略を決定してください。JSON形式で返答してください。`);

  const user = userParts.join('\n');

  return { system, user };
}

// === Layer 1: Covenant (契約) プロンプト ===

export interface CovenantPromptContext {
  leader: AgentState;
  villageName: string;
  villageState: VillageState4X;
  neighborVillages: { id: string; name: string; diplomaticStatus: string }[];
  activeCovenants: Covenant[];
  tick: number;
}

export interface CovenantDecision {
  innerThought: string;
  propose: {
    name: string;
    description: string;
    scope: 'village' | 'bilateral' | 'global';
    targetVillageId?: string;
    clauses: { type: ClauseType; params: Record<string, number | string | boolean> }[];
  } | null;
}

export function buildCovenantPrompt(ctx: CovenantPromptContext): { system: string; user: string } {
  const { leader, villageName, villageState, tick } = ctx;
  const { identity } = leader;

  const clauseTypeList = Object.entries(CLAUSE_PARAM_BOUNDS)
    .map(([type, bounds]) => {
      const paramDesc = Object.entries(bounds)
        .map(([key, range]) => `${key}: ${range.min}-${range.max}`)
        .join(', ');
      return `- ${type}: {${paramDesc}}`;
    })
    .join('\n');

  const additionalClauses = [
    '- building_ban: { buildingDefId: "建物ID" }',
    '- military_pact: { sharedDefense: true/false }',
    '- non_aggression: { durationTicks: 数値 }',
    '- immigration_policy: { open: true/false }',
  ].join('\n');

  const system = `あなたは${villageName}の村長「${identity.name}」です。
あなたは村の法律・条約・経済政策を制定できます。
性格: ${describePersonality(identity.personality)}
信条: ${describePhilosophy(identity.philosophy)}

利用可能な条項タイプとパラメータ範囲:
${clauseTypeList}
${additionalClauses}

返答は必ず以下のJSON形式のみで返してください。
{
  "innerThought": "なぜこの法律が必要か（1-2文）",
  "propose": {
    "name": "法律・条約の名前",
    "description": "簡潔な説明",
    "scope": "village | bilateral | global",
    "targetVillageId": "bilateral時のみ対象村ID",
    "clauses": [{ "type": "条項タイプ", "params": { ... } }]
  }
}
提案しない場合は "propose": null としてください。`;

  const activeCovenantList = ctx.activeCovenants.length > 0
    ? ctx.activeCovenants.map(c => `- ${c.name}: ${c.clauses.map(cl => cl.type).join(', ')}`).join('\n')
    : 'なし';

  const neighborList = ctx.neighborVillages.length > 0
    ? ctx.neighborVillages.map(n => `- ${n.name} (${n.diplomaticStatus})`).join('\n')
    : 'なし';

  const user = `=== ${villageName}の立法会議 (tick ${tick}) ===

【村の状態】
人口: ${villageState.population} / 食料: ${villageState.resources.food} / 金: ${villageState.resources.gold}
文化: ${villageState.totalCulturePoints} / 軍事: ${villageState.garrison.reduce((s, u) => s + u.count, 0)}名

【現行の法律・条約】
${activeCovenantList}

【周辺の村】
${neighborList}

村の発展のために新しい法律・条約・経済政策を提案しますか？`;

  return { system, user };
}

// === Layer 2: Invention (発明) プロンプト ===

export interface InventionPromptContext {
  leader: AgentState;
  villageName: string;
  villageState: VillageState4X;
  existingInventions: Invention[];
  tick: number;
}

export interface InventionDecision {
  innerThought: string;
  invent: {
    type: 'building' | 'tech' | 'unit';
    name: string;
    nameJa: string;
    description: string;
    definition: Record<string, unknown>;
  } | null;
}

export function buildInventionPrompt(ctx: InventionPromptContext): { system: string; user: string } {
  const { leader, villageName, villageState, tick } = ctx;
  const { identity } = leader;

  // Effect バウンドの説明を生成
  const boundsDesc = Object.entries(EFFECT_BOUNDS)
    .filter(([type]) => !type.startsWith('unlock_'))
    .map(([type, bounds]) => `  ${type}: [${bounds.min}, ${bounds.max}]`)
    .join('\n');

  const system = `あなたは${villageName}の村長「${identity.name}」であり、偉大な発明家でもあります。
あなたは村の課題を解決するために、新しい建物・技術・ユニットを発明できます。
性格: ${describePersonality(identity.personality)}

【物理法則の制約（絶対遵守）】
- Effect値の範囲:
${boundsDesc}
- 建物: 最低コスト1, 最低建設時間1tick, 最大Effect数${INVENTION_LIMITS.maxEffectsPerInvention}
- 技術: 最低研究コスト5
- ユニット: 最低維持費 food:0.5/tick

返答は必ず以下のJSON形式のみで返してください。
{
  "innerThought": "なぜこの発明が必要か（1-2文）",
  "invent": {
    "type": "building | tech | unit",
    "name": "英語ID（snake_case）",
    "nameJa": "日本語名",
    "description": "説明",
    "definition": {
      // buildingの場合: { cost: { food: N, wood: N, ... }, buildTicks: N, maxPerVillage: N, effects: [...], requires: {} }
      // techの場合: { branch: "agriculture|military|culture", tier: N, researchCost: N, effects: [...], requires: {} }
      // unitの場合: { attack: N, defense: N, hp: N, speed: N, range: N, trainCost: {...}, trainTicks: N, upkeepPerTick: { food: 0.5, ... }, requires: {}, tags: [...] }
    }
  }
}
発明しない場合は "invent": null としてください。`;

  const existingInvList = ctx.existingInventions.length > 0
    ? ctx.existingInventions.map(i => `- ${i.name} (${i.type}): ${i.description}`).join('\n')
    : 'なし';

  const user = `=== ${villageName}の研究所 (tick ${tick}) ===

【村の課題】
人口: ${villageState.population} / 住居上限: ${villageState.housingCapacity}
食料: ${villageState.resources.food} / 木材: ${villageState.resources.wood} / 石材: ${villageState.resources.stone} / 鉄: ${villageState.resources.iron} / 金: ${villageState.resources.gold}
研究ポイント: ${Math.floor(villageState.researchPoints)}
研究済み技術: ${villageState.researchedTechs.size > 0 ? [...villageState.researchedTechs].join(', ') : 'なし'}

【既存の発明】
${existingInvList}

村の課題を解決する画期的な発明を考えてください。`;

  return { system, user };
}

// === Layer 3: Institution (制度) プロンプト ===

export interface InstitutionPromptContext {
  leader: AgentState;
  villageName: string;
  villageState: VillageState4X;
  neighborVillages: { id: string; name: string; diplomaticStatus: string }[];
  existingInstitutions: Institution[];
  tick: number;
}

export interface InstitutionDecision {
  innerThought: string;
  found: {
    name: string;
    type: 'guild' | 'religion' | 'alliance' | 'academy' | 'custom';
    description: string;
    charter: string;
    memberEffects: { type: string; target: { scope: string; resource?: string }; value: number }[];
    joinRequirements: { type: string; params: Record<string, number | string> }[];
  } | null;
  joinInstitutionId: string | null;
}

export function buildInstitutionPrompt(ctx: InstitutionPromptContext): { system: string; user: string } {
  const { leader, villageName, villageState, tick } = ctx;
  const { identity } = leader;

  const boundsDesc = Object.entries(EFFECT_BOUNDS)
    .filter(([type]) => !type.startsWith('unlock_'))
    .slice(0, 10)
    .map(([type, bounds]) => `  ${type}: [${bounds.min}, ${bounds.max}]`)
    .join('\n');

  const system = `あなたは${villageName}の村長「${identity.name}」です。
あなたは村を超えた組織（交易ギルド、宗教団体、軍事同盟、学術院など）を創設できます。
性格: ${describePersonality(identity.personality)}
信条: ${describePhilosophy(identity.philosophy)}

【制度のEffect制約】
- 最大${INSTITUTION_LIMITS.maxMemberEffects}個のEffect
- Effect値の範囲:
${boundsDesc}

返答は必ず以下のJSON形式のみで返してください。
{
  "innerThought": "なぜこの組織が必要か（1-2文）",
  "found": {
    "name": "組織名",
    "type": "guild | religion | alliance | academy | custom",
    "description": "組織の説明",
    "charter": "組織の憲章（エージェントが書く）",
    "memberEffects": [
      { "type": "effect_type", "target": { "scope": "village", "resource": "optional" }, "value": 数値 }
    ],
    "joinRequirements": [
      { "type": "min_population | has_tech | has_building | min_culture", "params": { ... } }
    ]
  },
  "joinInstitutionId": "加入したい既存組織のID（なければnull）"
}
創設も加入もしない場合は "found": null, "joinInstitutionId": null としてください。`;

  const existingInstList = ctx.existingInstitutions.length > 0
    ? ctx.existingInstitutions.map(i =>
        `- ${i.name} (${i.type}): メンバー${i.memberVillageIds.length}村 / ${i.description}`
      ).join('\n')
    : 'なし';

  const neighborList = ctx.neighborVillages.length > 0
    ? ctx.neighborVillages.map(n => `- ${n.name} (${n.diplomaticStatus})`).join('\n')
    : 'なし';

  const user = `=== ${villageName}の外交会議 (tick ${tick}) ===

【村の状態】
人口: ${villageState.population} / 文化: ${villageState.totalCulturePoints} / 金: ${villageState.resources.gold}

【周辺の村】
${neighborList}

【既存の組織】
${existingInstList}

新しい組織を創設するか、既存の組織に加入しますか？`;

  return { system, user };
}
