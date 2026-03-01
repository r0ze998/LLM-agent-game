import type {
  AgentState, Relationship, Memory, PlayerIntention, Village, VillageState4X,
  Covenant, Invention, Institution, ClauseType, AutonomousWorldState,
} from '@murasato/shared';
import { CLAUSE_PARAM_BOUNDS, EFFECT_BOUNDS, INVENTION_LIMITS, INSTITUTION_LIMITS } from '@murasato/shared';

// --- Personality description ---

function describePersonality(p: AgentState['identity']['personality']): string {
  const traits: string[] = [];
  if (p.openness > 70) traits.push('curious');
  else if (p.openness < 30) traits.push('conservative');
  if (p.agreeableness > 70) traits.push('cooperative');
  else if (p.agreeableness < 30) traits.push('competitive');
  if (p.conscientiousness > 70) traits.push('methodical');
  else if (p.conscientiousness < 30) traits.push('spontaneous');
  if (p.courage > 70) traits.push('bold');
  else if (p.courage < 30) traits.push('cautious');
  if (p.ambition > 70) traits.push('ambitious');
  else if (p.ambition < 30) traits.push('content');
  return traits.join(', ') || 'ordinary';
}

function describePhilosophy(ph: AgentState['identity']['philosophy']): string {
  return `Governance: ${ph.governance} / Economics: ${ph.economics} / Values: ${ph.values.join(', ')} / Worldview: ${ph.worldview}`;
}

function formatMemories(memories: Memory[], limit: number): string {
  return memories
    .slice(0, limit)
    .map((m, i) => `${i + 1}. [tick ${m.tick}] ${m.content}`)
    .join('\n');
}

function formatRelationships(rels: Relationship[], agentNames: Map<string, string>): string {
  if (rels.length === 0) return 'No deep relationships yet';
  return rels
    .slice(0, 5)
    .map(r => {
      const name = agentNames.get(r.targetId) ?? 'Unknown';
      const feeling = r.sentiment > 50 ? 'friendly' : r.sentiment > 0 ? 'somewhat friendly' : r.sentiment > -50 ? 'somewhat hostile' : 'hostile';
      return `- ${name}: ${feeling} (trust ${r.trust}, familiarity ${r.familiarity}) ${r.roles.length > 0 ? `[${r.roles.join(', ')}]` : ''}`;
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

  let systemParts = [`You are "${identity.name}", a character living in a JRPG world.
Plan your day based on your personality and beliefs.`];

  if (soulText) {
    systemParts.push(`\n=== Your Soul ===\n${soulText}`);
  }

  if (behaviorRules && behaviorRules.length > 0) {
    systemParts.push(`\n=== Behavior Rules (must follow) ===\n${behaviorRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  systemParts.push(`\nReply with ONLY the following JSON format. Do not use markdown code blocks.

{
  "innerThought": "Current feelings or thoughts (1-2 sentences)",
  "schedule": [
    { "slot": 0, "action": "action name", "target": "target (optional)", "reason": "reason" },
    ...24 slots total
  ],
  "socialIntentions": [
    { "targetAgentId": "ID", "intention": "what you want to talk about" }
  ],
  "philosophyShift": null
}

Available actions: ${availableActions.join(', ')}`);

  const system = systemParts.join('\n');

  const intentionText = intentions.length > 0
    ? intentions.map(i => `[${i.strength}] ${i.message}`).join('\n')
    : 'None';

  let userParts = [`=== ${identity.name}'s Morning (tick ${tick}) ===

[Basic Info]
Name: ${identity.name} / Gen: ${identity.generation} / Age: ${identity.age} / Status: ${identity.status}
Personality: ${describePersonality(identity.personality)}
Beliefs: ${describePhilosophy(identity.philosophy)}
Affiliation: ${village ? village.name : 'Unaffiliated (wandering)'}`];

  if (backstory) {
    userParts.push(`\n[Soul Memories (Past Life)]\n${backstory}`);
  }

  userParts.push(`
[Physical State]
Hunger: ${needs.hunger}/100 / Energy: ${needs.energy}/100 / Social: ${needs.social}/100

[Recent Memories]
${formatMemories(memories, 15)}

[Relationships]
${formatRelationships(relationships, agentNames)}

[Surroundings]
Nearby: ${nearbyAgents.length > 0 ? nearbyAgents.map(a => `${a.name}(${a.distance} tiles)`).join(', ') : 'No one nearby'}

[Divine Voice (Player Intentions)]
${intentionText}

Plan your 24 time slots for today in JSON format.`);

  // 4X strategy context — let agents be aware of village strategic state
  if (villageStrategy) {
    userParts.push(`
[Village Strategy]
Population: ${villageStrategy.population} / Military: ${villageStrategy.militaryStrength}
Resources: Food ${villageStrategy.resources.food ?? 0}, Wood ${villageStrategy.resources.wood ?? 0}, Stone ${villageStrategy.resources.stone ?? 0}, Iron ${villageStrategy.resources.iron ?? 0}, Gold ${villageStrategy.resources.gold ?? 0}
War status: ${villageStrategy.atWar ? 'At war' : 'At peace'}
Researched techs: ${villageStrategy.researchedTechs.length > 0 ? villageStrategy.researchedTechs.join(', ') : 'None'}
Note: gather_iron, defend, and patrol are also available actions.`);
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

  const system = `You are a conversation simulator in a JRPG world.
Generate a conversation between two characters who have just met.
Create natural dialogue based on each character's personality, relationship, and situation.
Reply with ONLY the following JSON format.

{
  "dialogue": [
    { "speakerId": "speaker ID", "text": "dialogue line" },
    ...3-6 turns
  ],
  "sentimentChange": { "agent1 toward agent2 change": number, "agent2 toward agent1 change": number },
  "newMemories": [
    { "agentId": "ID", "content": "memory content", "importance": 0.0-1.0 }
  ]
}`;

  const sent12 = relationship12 ? `affinity ${relationship12.sentiment}, trust ${relationship12.trust}` : 'first meeting';
  const sent21 = relationship21 ? `affinity ${relationship21.sentiment}, trust ${relationship21.trust}` : 'first meeting';

  const user = `=== Encounter ===

${agent1.identity.name} (Personality: ${describePersonality(agent1.identity.personality)})
-> Feelings toward ${agent2.identity.name}: ${sent12}

${agent2.identity.name} (Personality: ${describePersonality(agent2.identity.personality)})
-> Feelings toward ${agent1.identity.name}: ${sent21}

Situation: ${situation}

Use "${agent1.identity.id}" and "${agent2.identity.id}" as the keys for sentimentChange.`;

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

  let systemParts = [`You are "${agent.identity.name}", living in a JRPG world.
Reflect on recent events and update your thoughts and beliefs.`];

  if (soulText) {
    systemParts.push(`\n=== Your Soul ===\n${soulText}`);
  }
  if (behaviorRules && behaviorRules.length > 0) {
    systemParts.push(`\n=== Behavior Rules ===\n${behaviorRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  systemParts.push(`\nReply with ONLY the following JSON format.

{
  "reflection": "Reflection text (2-3 sentences)",
  "beliefChange": null or { "governance"?: "new governance view", "economics"?: "new economics view", "values"?: ["new values"], "worldview"?: "new worldview" },
  "newInsight": null or "A new insight (1 sentence)"
}`);

  const system = systemParts.join('\n');

  let userParts = [`=== ${agent.identity.name}'s Reflection ===

Personality: ${describePersonality(agent.identity.personality)}
Current beliefs: ${describePhilosophy(agent.identity.philosophy)}`];

  if (backstory) {
    userParts.push(`\n[Soul Memories (Past Life)]\n${backstory}`);
  }

  userParts.push(`
[Recent Events]
${formatMemories(recentMemories, 20)}

Based on these experiences, provide your reflection in JSON format.`);

  const user = userParts.join('\n');

  return { system, user };
}

// --- Name Generation Prompt ---

export function buildNamePrompt(parentNames: string[], culturalStyle: string): { system: string; user: string } {
  const system = `You are a JRPG character name generator. Follow the cultural naming style and return exactly one name for a new character. Reply with the name only (no quotes, no explanation). Names should be romanized Japanese (e.g., Akira, Yuki, Sakura).`;

  const user = `Parents: ${parentNames.join(' and ')}
Cultural style: ${culturalStyle}
Return exactly one name for the new child.`;

  return { system, user };
}

// --- Strategy Prompt (4X village leader decision) ---

export interface StrategyOption {
  id: string;
  name: string;
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
  let systemParts = [`You are "${identity.name}", a village leader living in a JRPG world.
As the leader of ${villageName}, you decide the village's strategy.
Judge what needs to be done based on your personality, beliefs, and memories.
There is no "correct answer." Make decisions that reflect who you are.`];

  if (ctx.soulText) {
    systemParts.push(`\n=== Your Soul ===\n${ctx.soulText}`);
  }
  if (ctx.behaviorRules && ctx.behaviorRules.length > 0) {
    systemParts.push(`\n=== Behavior Rules ===\n${ctx.behaviorRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  systemParts.push(`\nReply with ONLY the following JSON format. Do not use markdown code blocks.

{
  "innerThought": "Your thoughts on the current situation (1-3 sentences, reflecting your personality)",
  "build": "ID of building to construct (null if none)",
  "buildReason": "Why you chose this building (1 sentence)",
  "research": "ID of tech to research (null if none)",
  "researchReason": "Why you chose this tech (1 sentence)",
  "train": "ID of unit to train (null if none)",
  "trainReason": "Why you chose this unit (1 sentence)",
  "diplomacy": null or { "targetVillageId": "ID", "action": "declare_war|propose_alliance|propose_peace|break_alliance", "reason": "reason" }
}`);

  const system = systemParts.join('\n');

  // --- User prompt ---
  const garrison = vs.garrison.map(u => `${u.defId}x${u.count}`).join(', ') || 'None';
  const armies = vs.armies.map(a => `Army(${a.units.map(u => `${u.defId}x${u.count}`).join(', ')})`).join(', ') || 'None';
  const techs = vs.researchedTechs.size > 0 ? [...vs.researchedTechs].join(', ') : 'None';
  const buildings = vs.buildings.map(b => b.defId).join(', ') || 'None';
  const buildQueue = vs.buildQueue.length > 0 ? vs.buildQueue.map(q => q.defId).join(', ') : 'None';
  const researchQueue = vs.researchQueue.length > 0 ? vs.researchQueue.map(q => q.defId).join(', ') : 'None';
  const trainQueue = vs.trainQueue.length > 0 ? vs.trainQueue.map(q => q.defId).join(', ') : 'None';

  let userParts = [`=== ${villageName} Strategy Meeting (tick ${tick}) ===

[You (Village Leader)]
Name: ${identity.name} / Personality: ${describePersonality(identity.personality)}
Beliefs: ${describePhilosophy(identity.philosophy)}

[Village State]
Population: ${vs.population} / Housing cap: ${vs.housingCapacity}
Food: ${vs.resources.food} / Wood: ${vs.resources.wood} / Stone: ${vs.resources.stone} / Iron: ${vs.resources.iron} / Gold: ${vs.resources.gold}
Research points: ${Math.floor(vs.researchPoints)} / Culture points: ${vs.totalCulturePoints}
Score: ${vs.score}

[Military]
Garrison: ${garrison}
Armies: ${armies}

[Existing Buildings] ${buildings}
[Researched Techs] ${techs}
[In-progress Queues] Build: ${buildQueue} / Research: ${researchQueue} / Train: ${trainQueue}`];

  // Recent memories
  if (memories.length > 0) {
    userParts.push(`\n[Recent Memories]\n${formatMemories(memories, 10)}`);
  }

  // Relationships with other village leaders
  if (relationships.length > 0) {
    userParts.push(`\n[Relationships]\n${formatRelationships(relationships, agentNames)}`);
  }

  // Neighbor villages
  if (ctx.neighborVillages.length > 0) {
    userParts.push(`\n[Neighboring Villages]`);
    for (const nv of ctx.neighborVillages) {
      const powerLabel = nv.militaryPower > 100 ? 'powerful' : nv.militaryPower > 50 ? 'moderate' : 'weak';
      userParts.push(`- ${nv.name}: Military power ${powerLabel}(${Math.floor(nv.militaryPower)}) / Diplomacy: ${nv.diplomaticStatus}`);
    }
  }

  // Available options
  if (ctx.availableBuildings.length > 0) {
    userParts.push(`\n[Available Buildings]`);
    for (const b of ctx.availableBuildings) {
      userParts.push(`- ${b.id}: ${b.name} (${b.description})`);
    }
  } else {
    userParts.push(`\n[Available Buildings] None (insufficient resources or prerequisites not met)`);
  }

  if (ctx.availableTechs.length > 0) {
    userParts.push(`\n[Available Techs]`);
    for (const t of ctx.availableTechs) {
      userParts.push(`- ${t.id}: ${t.name} (${t.description})`);
    }
  } else {
    userParts.push(`\n[Available Techs] None`);
  }

  if (ctx.availableUnits.length > 0) {
    userParts.push(`\n[Available Units]`);
    for (const u of ctx.availableUnits) {
      userParts.push(`- ${u.id}: ${u.name} (${u.description})`);
    }
  } else {
    userParts.push(`\n[Available Units] None`);
  }

  userParts.push(`\nDecide your strategy based on your personality and beliefs. Reply in JSON format.`);

  const user = userParts.join('\n');

  return { system, user };
}

// === Layer 1: Covenant Prompt ===

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
    '- building_ban: { buildingDefId: "building ID" }',
    '- military_pact: { sharedDefense: true/false }',
    '- non_aggression: { durationTicks: number }',
    '- immigration_policy: { open: true/false }',
  ].join('\n');

  const system = `You are "${identity.name}", the village leader of ${villageName}.
You can enact laws, treaties, and economic policies for the village.
Personality: ${describePersonality(identity.personality)}
Beliefs: ${describePhilosophy(identity.philosophy)}

Available clause types and parameter ranges:
${clauseTypeList}
${additionalClauses}

Reply with ONLY the following JSON format.
{
  "innerThought": "Why this law is needed (1-2 sentences)",
  "propose": {
    "name": "Name of the law/treaty",
    "description": "Brief description",
    "scope": "village | bilateral | global",
    "targetVillageId": "Target village ID (only for bilateral)",
    "clauses": [{ "type": "clause type", "params": { ... } }]
  }
}
If you have no proposal, set "propose": null.`;

  const activeCovenantList = ctx.activeCovenants.length > 0
    ? ctx.activeCovenants.map(c => `- ${c.name}: ${c.clauses.map(cl => cl.type).join(', ')}`).join('\n')
    : 'None';

  const neighborList = ctx.neighborVillages.length > 0
    ? ctx.neighborVillages.map(n => `- ${n.name} (${n.diplomaticStatus})`).join('\n')
    : 'None';

  const user = `=== ${villageName} Legislative Session (tick ${tick}) ===

[Village State]
Population: ${villageState.population} / Food: ${villageState.resources.food} / Gold: ${villageState.resources.gold}
Culture: ${villageState.totalCulturePoints} / Military: ${villageState.garrison.reduce((s, u) => s + u.count, 0)} troops

[Current Laws & Treaties]
${activeCovenantList}

[Neighboring Villages]
${neighborList}

Would you like to propose a new law, treaty, or economic policy for the village's development?`;

  return { system, user };
}

// === Layer 2: Invention Prompt ===

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
    description: string;
    definition: Record<string, unknown>;
  } | null;
}

export function buildInventionPrompt(ctx: InventionPromptContext): { system: string; user: string } {
  const { leader, villageName, villageState, tick } = ctx;
  const { identity } = leader;

  // Generate effect bounds description
  const boundsDesc = Object.entries(EFFECT_BOUNDS)
    .filter(([type]) => !type.startsWith('unlock_'))
    .map(([type, bounds]) => `  ${type}: [${bounds.min}, ${bounds.max}]`)
    .join('\n');

  const system = `You are "${identity.name}", the village leader of ${villageName} and a great inventor.
You can invent new buildings, technologies, and units to solve the village's challenges.
Personality: ${describePersonality(identity.personality)}

[Physics Constraints (must obey)]
- Effect value ranges:
${boundsDesc}
- Buildings: min cost 1, min build time 1 tick, max ${INVENTION_LIMITS.maxEffectsPerInvention} effects
- Techs: min research cost 5
- Units: min upkeep food:0.5/tick

Reply with ONLY the following JSON format.
{
  "innerThought": "Why this invention is needed (1-2 sentences)",
  "invent": {
    "type": "building | tech | unit",
    "name": "English ID (snake_case)",
    "description": "description",
    "definition": {
      // For building: { cost: { food: N, wood: N, ... }, buildTicks: N, maxPerVillage: N, effects: [...], requires: {} }
      // For tech: { branch: "agriculture|military|culture", tier: N, researchCost: N, effects: [...], requires: {} }
      // For unit: { attack: N, defense: N, hp: N, speed: N, range: N, trainCost: {...}, trainTicks: N, upkeepPerTick: { food: 0.5, ... }, requires: {}, tags: [...] }
    }
  }
}
If you have no invention, set "invent": null.`;

  const existingInvList = ctx.existingInventions.length > 0
    ? ctx.existingInventions.map(i => `- ${i.name} (${i.type}): ${i.description}`).join('\n')
    : 'None';

  const user = `=== ${villageName} Laboratory (tick ${tick}) ===

[Village Challenges]
Population: ${villageState.population} / Housing cap: ${villageState.housingCapacity}
Food: ${villageState.resources.food} / Wood: ${villageState.resources.wood} / Stone: ${villageState.resources.stone} / Iron: ${villageState.resources.iron} / Gold: ${villageState.resources.gold}
Research points: ${Math.floor(villageState.researchPoints)}
Researched techs: ${villageState.researchedTechs.size > 0 ? [...villageState.researchedTechs].join(', ') : 'None'}

[Existing Inventions]
${existingInvList}

Think of a groundbreaking invention to solve the village's challenges.`;

  return { system, user };
}

// === Layer 3: Institution Prompt ===

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

  const system = `You are "${identity.name}", the village leader of ${villageName}.
You can found cross-village organizations (trade guilds, religious orders, military alliances, academies, etc.).
Personality: ${describePersonality(identity.personality)}
Beliefs: ${describePhilosophy(identity.philosophy)}

[Institution Effect Constraints]
- Max ${INSTITUTION_LIMITS.maxMemberEffects} effects
- Effect value ranges:
${boundsDesc}

Reply with ONLY the following JSON format.
{
  "innerThought": "Why this organization is needed (1-2 sentences)",
  "found": {
    "name": "Organization name",
    "type": "guild | religion | alliance | academy | custom",
    "description": "Organization description",
    "charter": "Organization charter (written by the agent)",
    "memberEffects": [
      { "type": "effect_type", "target": { "scope": "village", "resource": "optional" }, "value": number }
    ],
    "joinRequirements": [
      { "type": "min_population | has_tech | has_building | min_culture", "params": { ... } }
    ]
  },
  "joinInstitutionId": "ID of existing organization to join (null if none)"
}
If neither founding nor joining, set "found": null, "joinInstitutionId": null.`;

  const existingInstList = ctx.existingInstitutions.length > 0
    ? ctx.existingInstitutions.map(i =>
        `- ${i.name} (${i.type}): ${i.memberVillageIds.length} members / ${i.description}`
      ).join('\n')
    : 'None';

  const neighborList = ctx.neighborVillages.length > 0
    ? ctx.neighborVillages.map(n => `- ${n.name} (${n.diplomaticStatus})`).join('\n')
    : 'None';

  const user = `=== ${villageName} Diplomatic Council (tick ${tick}) ===

[Village State]
Population: ${villageState.population} / Culture: ${villageState.totalCulturePoints} / Gold: ${villageState.resources.gold}

[Neighboring Villages]
${neighborList}

[Existing Organizations]
${existingInstList}

Would you like to found a new organization or join an existing one?`;

  return { system, user };
}
