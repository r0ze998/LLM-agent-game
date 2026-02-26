import type { AgentState, AgentBlueprint, DeployedBlueprintMeta, PersonalityAxes, Philosophy, SkillMap, SkillType, Position } from '@murasato/shared';
import {
  DEFAULT_LIFESPAN_MIN, DEFAULT_LIFESPAN_MAX, MATURITY_AGE,
  ELDER_AGE_RATIO, PERSONALITY_MUTATION_RANGE, PERSONALITY_MIN, PERSONALITY_MAX,
} from '@murasato/shared';
import { callLLM, extractJSON } from './llmClient.ts';
import { buildNamePrompt } from './prompts.ts';
import { MemoryManager } from './memory.ts';

function generateId(): string {
  return `agent_${crypto.randomUUID()}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPersonality(): PersonalityAxes {
  return {
    openness: randomRange(20, 80),
    agreeableness: randomRange(20, 80),
    conscientiousness: randomRange(20, 80),
    courage: randomRange(20, 80),
    ambition: randomRange(20, 80),
  };
}

const GOVERNANCE_OPTIONS: Philosophy['governance'][] = ['democratic', 'meritocratic', 'authoritarian', 'anarchist', 'theocratic'];
const ECONOMICS_OPTIONS: Philosophy['economics'][] = ['collectivist', 'market', 'gift_economy', 'feudal'];
const VALUE_POOL = [
  '勤勉', '自由', '平等', '名誉', '知恵', '勇気', '慈悲', '秩序',
  '創造', '伝統', '調和', '正義', '忍耐', '友情', '冒険', '平和',
];

function randomPhilosophy(): Philosophy {
  const values = [...VALUE_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  return {
    governance: GOVERNANCE_OPTIONS[Math.floor(Math.random() * GOVERNANCE_OPTIONS.length)],
    economics: ECONOMICS_OPTIONS[Math.floor(Math.random() * ECONOMICS_OPTIONS.length)],
    values,
    worldview: '世界はまだ見ぬ可能性に満ちている。',
  };
}

function randomSkills(): SkillMap {
  const types: SkillType[] = ['farming', 'building', 'crafting', 'leadership', 'combat', 'diplomacy', 'teaching', 'healing'];
  const skills = {} as SkillMap;
  for (const type of types) {
    skills[type] = randomRange(1, 10);
  }
  return skills;
}

const GENESIS_NAMES = [
  'アキラ', 'ユキ', 'サクラ', 'タケシ', 'ミドリ', 'リュウ', 'カエデ', 'ヒロシ',
  'ハナ', 'ケンジ', 'ミサキ', 'ソラ', 'アヤメ', 'シンジ', 'ナツミ', 'コウタ',
];

// --- Create genesis agent ---

export function createGenesisAgent(index: number, x: number, y: number): Omit<AgentState, 'currentAction'> & { currentAction: null } {
  return {
    identity: {
      id: generateId(),
      name: GENESIS_NAMES[index % GENESIS_NAMES.length],
      generation: 0,
      parentIds: [],
      personality: randomPersonality(),
      philosophy: randomPhilosophy(),
      skills: randomSkills(),
      age: MATURITY_AGE, // start as adults
      lifespan: randomRange(DEFAULT_LIFESPAN_MIN, DEFAULT_LIFESPAN_MAX),
      status: 'adult',
    },
    needs: { hunger: 80, energy: 100, social: 50 },
    position: { x, y },
    currentAction: null,
    villageId: null,
    inventory: { food: 10, wood: 5 },
  };
}

// --- Derive attributes from soul text via LLM ---

interface DerivedAttributes {
  name: string;
  personality: PersonalityAxes;
  philosophy: Philosophy;
  skills: SkillMap;
}

export async function deriveBlueprintAttributes(soul: string): Promise<DerivedAttributes> {
  const system = `あなたはJRPGキャラクターの魂テキストから属性を抽出するAIです。
与えられた魂の描写から、キャラクターの名前・性格・信条・スキルをJSON形式で返してください。
返答は必ず以下のJSON形式のみで返してください。マークダウンのコードブロックは使わないでください。

{
  "name": "カタカナの名前（2-4文字）",
  "personality": {
    "openness": 0-100,
    "agreeableness": 0-100,
    "conscientiousness": 0-100,
    "courage": 0-100,
    "ambition": 0-100
  },
  "philosophy": {
    "governance": "democratic|meritocratic|authoritarian|anarchist|theocratic",
    "economics": "collectivist|market|gift_economy|feudal",
    "values": ["価値観1", "価値観2", "価値観3"],
    "worldview": "世界観を一文で"
  },
  "skills": {
    "farming": 1-30, "building": 1-30, "crafting": 1-30, "leadership": 1-30,
    "combat": 1-30, "diplomacy": 1-30, "teaching": 1-30, "healing": 1-30
  }
}

魂の描写に基づいて、最も適切な値を設定してください。`;

  const user = `=== 魂の描写 ===\n${soul}`;

  try {
    const raw = await callLLM({ system, userMessage: user, importance: 'routine', maxTokens: 512 });
    return extractJSON<DerivedAttributes>(raw);
  } catch {
    // Fallback: random attributes with a generic name
    return {
      name: `召喚${Math.floor(Math.random() * 1000)}`,
      personality: randomPersonality(),
      philosophy: randomPhilosophy(),
      skills: randomSkills(),
    };
  }
}

// --- Create blueprint agent (OpenClaw-style summoning) ---

export async function createBlueprintAgent(
  gameId: string,
  blueprint: AgentBlueprint,
  spawnPos: Position,
  tick: number,
): Promise<{ agent: AgentState; meta: DeployedBlueprintMeta }> {
  const blueprintId = `bp_${crypto.randomUUID()}`;

  // Derive attributes from soul text
  const derived = await deriveBlueprintAttributes(blueprint.soul);

  // User overrides take precedence
  const personality: PersonalityAxes = {
    ...derived.personality,
    ...(blueprint.personality ?? {}),
  };
  const philosophy: Philosophy = {
    ...derived.philosophy,
    ...(blueprint.philosophy ?? {}),
  };
  const skills: SkillMap = {
    ...derived.skills,
    ...(blueprint.skills ?? {}),
  } as SkillMap;
  const name = blueprint.name ?? derived.name;

  const agentId = generateId();

  const agent: AgentState = {
    identity: {
      id: agentId,
      name,
      generation: 0,
      parentIds: [],
      personality,
      philosophy,
      skills,
      age: MATURITY_AGE,
      lifespan: randomRange(DEFAULT_LIFESPAN_MIN, DEFAULT_LIFESPAN_MAX),
      status: 'adult',
      blueprintId,
    },
    needs: { hunger: 80, energy: 100, social: 50 },
    position: spawnPos,
    currentAction: null,
    villageId: null,
    inventory: { food: 10, wood: 5 },
  };

  // Store backstory as longterm memory
  if (blueprint.backstory) {
    const mem = new MemoryManager(agentId, gameId);
    mem.addMemory(blueprint.backstory, 0.9, tick, 'longterm', ['backstory', 'blueprint']);
  }

  const meta: DeployedBlueprintMeta = {
    blueprintId,
    agentId,
    soul: blueprint.soul,
    rules: blueprint.rules ?? [],
    backstory: blueprint.backstory ?? null,
    deployedAtTick: tick,
  };

  return { agent, meta };
}

// --- Create child agent ---

export async function createChildAgent(
  parent1: AgentState,
  parent2: AgentState,
  namingStyle: string,
): Promise<Omit<AgentState, 'currentAction'> & { currentAction: null }> {
  const personality = blendPersonality(parent1.identity.personality, parent2.identity.personality);
  const philosophy = blendPhilosophy(parent1.identity.philosophy, parent2.identity.philosophy);
  const skills = blendSkills(parent1.identity.skills, parent2.identity.skills);

  let name: string;
  try {
    const { system, user } = buildNamePrompt(
      [parent1.identity.name, parent2.identity.name],
      namingStyle,
    );
    const raw = await callLLM({ system, userMessage: user, importance: 'routine', maxTokens: 64 });
    name = raw.trim().replace(/["""]/g, '');
  } catch {
    name = `子${Math.floor(Math.random() * 1000)}`;
  }

  return {
    identity: {
      id: generateId(),
      name,
      generation: Math.max(parent1.identity.generation, parent2.identity.generation) + 1,
      parentIds: [parent1.identity.id, parent2.identity.id],
      personality,
      philosophy,
      skills,
      age: 0,
      lifespan: randomRange(DEFAULT_LIFESPAN_MIN, DEFAULT_LIFESPAN_MAX),
      status: 'child',
    },
    needs: { hunger: 80, energy: 100, social: 70 },
    position: { ...parent1.position },
    currentAction: null,
    villageId: parent1.villageId,
    inventory: {},
  };
}

// --- Aging ---

export function ageAgent(agent: AgentState): AgentState['identity']['status'] {
  const { age, lifespan } = agent.identity;
  if (age >= lifespan) return 'dead';
  if (age >= lifespan * ELDER_AGE_RATIO) return 'elder';
  if (age >= MATURITY_AGE) return 'adult';
  return 'child';
}

// --- Skill growth through practice ---

export function growSkill(agent: AgentState, skill: SkillType, amount: number = 0.1): void {
  const current = agent.identity.skills[skill];
  // Diminishing returns: harder to improve at higher levels
  const growth = amount / (1 + current * 0.1);
  agent.identity.skills[skill] = Math.min(100, current + growth);
}

// --- Education: child learns from nearby adult ---

export function educateChild(
  child: AgentState,
  teacher: AgentState,
): { skill: SkillType; amount: number } | null {
  if (child.identity.status !== 'child') return null;
  if (teacher.identity.status === 'dead' || teacher.identity.status === 'child') return null;

  // Teacher's best skill
  const skills = teacher.identity.skills;
  let bestSkill: SkillType = 'farming';
  let bestVal = 0;
  for (const [skill, val] of Object.entries(skills) as [SkillType, number][]) {
    if (val > bestVal) {
      bestVal = val;
      bestSkill = skill;
    }
  }

  // Teaching effectiveness based on teacher's teaching skill
  const effectiveness = 0.2 + teacher.identity.skills.teaching * 0.05;
  const amount = effectiveness * (bestVal / 100);

  growSkill(child, bestSkill, amount);
  growSkill(teacher, 'teaching', 0.05); // Teacher also improves

  return { skill: bestSkill, amount };
}

// --- Growth milestones ---

export interface GrowthEvent {
  type: 'maturity' | 'elder' | 'skill_mastery';
  description: string;
}

export function checkGrowthMilestones(agent: AgentState): GrowthEvent | null {
  // Check for skill mastery (any skill reaches 50+)
  for (const [skill, val] of Object.entries(agent.identity.skills) as [SkillType, number][]) {
    if (val >= 50 && val < 50.5) { // Just crossed threshold
      return {
        type: 'skill_mastery',
        description: `${agent.identity.name}が${skillName(skill)}の達人になった`,
      };
    }
  }
  return null;
}

function skillName(skill: SkillType): string {
  const names: Record<SkillType, string> = {
    farming: '農業', building: '建築', crafting: '工芸', leadership: '指導力',
    combat: '戦闘', diplomacy: '外交', teaching: '教育', healing: '医療',
  };
  return names[skill] ?? skill;
}

// --- Action-based skill growth mapping ---

export function getSkillForAction(action: string): SkillType | null {
  const map: Record<string, SkillType> = {
    gather: 'farming',
    farm: 'farming',
    build: 'building',
    craft: 'crafting',
    socialize: 'diplomacy',
    teach: 'teaching',
    heal: 'healing',
    explore: 'combat', // exploring builds survival skills
  };
  return map[action] ?? null;
}

// --- Blending helpers ---

function blendPersonality(p1: PersonalityAxes, p2: PersonalityAxes): PersonalityAxes {
  const blend = (a: number, b: number) =>
    clamp(Math.round((a + b) / 2 + (Math.random() * 2 - 1) * PERSONALITY_MUTATION_RANGE), PERSONALITY_MIN, PERSONALITY_MAX);

  return {
    openness: blend(p1.openness, p2.openness),
    agreeableness: blend(p1.agreeableness, p2.agreeableness),
    conscientiousness: blend(p1.conscientiousness, p2.conscientiousness),
    courage: blend(p1.courage, p2.courage),
    ambition: blend(p1.ambition, p2.ambition),
  };
}

function blendPhilosophy(ph1: Philosophy, ph2: Philosophy): Philosophy {
  const governance = Math.random() < 0.5 ? ph1.governance : ph2.governance;
  const economics = Math.random() < 0.5 ? ph1.economics : ph2.economics;
  const allValues = [...new Set([...ph1.values, ...ph2.values])];
  const values = allValues.sort(() => Math.random() - 0.5).slice(0, 3);

  return {
    governance,
    economics,
    values,
    worldview: Math.random() < 0.5 ? ph1.worldview : ph2.worldview,
  };
}

function blendSkills(s1: SkillMap, s2: SkillMap): SkillMap {
  const types: SkillType[] = ['farming', 'building', 'crafting', 'leadership', 'combat', 'diplomacy', 'teaching', 'healing'];
  const skills = {} as SkillMap;
  for (const type of types) {
    skills[type] = Math.max(1, Math.round((s1[type] + s2[type]) / 2 + (Math.random() * 4 - 2)));
  }
  return skills;
}
