// === Geometry ===

export interface Position {
  x: number;
  y: number;
}

// === Agent ===

export interface AgentIdentity {
  id: string;
  name: string;
  generation: number;
  parentIds: string[];
  personality: PersonalityAxes;
  philosophy: Philosophy;
  skills: SkillMap;
  age: number;
  lifespan: number;
  status: AgentLifeStatus;
}

export type AgentLifeStatus = 'child' | 'adult' | 'elder' | 'dead';

export interface PersonalityAxes {
  openness: number;
  agreeableness: number;
  conscientiousness: number;
  courage: number;
  ambition: number;
}

export interface Philosophy {
  governance: GovernanceType;
  economics: EconomicsType;
  values: string[];
  worldview: string;
}

export type GovernanceType = 'democratic' | 'meritocratic' | 'authoritarian' | 'anarchist' | 'theocratic';
export type EconomicsType = 'collectivist' | 'market' | 'gift_economy' | 'feudal';

export type SkillType =
  | 'farming' | 'building' | 'crafting' | 'leadership'
  | 'combat' | 'diplomacy' | 'teaching' | 'healing';

export type SkillMap = Record<SkillType, number>;

export interface AgentNeeds {
  hunger: number;
  energy: number;
  social: number;
}

export interface AgentState {
  identity: AgentIdentity;
  needs: AgentNeeds;
  position: Position;
  currentAction: string | null;
  villageId: string | null;
  inventory: Partial<Record<ResourceType, number>>;
}

// === Memory ===

export type MemoryTier = 'working' | 'episodic' | 'longterm';

export interface Memory {
  id: string;
  agentId: string;
  tier: MemoryTier;
  content: string;
  importance: number;
  tick: number;
  accessCount: number;
  tags: string[];
}

// === Relationship ===

export interface Relationship {
  agentId: string;
  targetId: string;
  sentiment: number;      // -100 to 100
  trust: number;          // 0 to 100
  familiarity: number;    // 0 to 100
  roles: string[];        // e.g. 'parent', 'spouse', 'rival', 'friend'
  lastInteractionTick: number;
}

// === World ===

export type TerrainType = 'plains' | 'forest' | 'mountain' | 'water' | 'desert' | 'swamp';
export type ResourceType = 'food' | 'wood' | 'stone' | 'ore' | 'herbs' | 'clay' | 'fiber';
export type StructureType =
  | 'house' | 'farm' | 'workshop' | 'warehouse' | 'market'
  | 'meeting_hall' | 'school' | 'temple' | 'wall' | 'watchtower' | 'well' | 'road';

export interface Tile {
  terrain: TerrainType;
  elevation: number;
  fertility: number;
  resources: Partial<Record<ResourceType, number>>;
  structureId: string | null;
}

export interface Structure {
  id: string;
  type: StructureType;
  position: Position;
  level: number;
  health: number;
  maxHealth: number;
  villageId: string;
  builderId: string;
  builtAtTick: number;
}

export interface Chunk {
  cx: number;
  cy: number;
  tiles: Tile[][];
  version: number;
}

// === Village ===

export interface Village {
  id: string;
  name: string;
  founderId: string;
  governance: GovernanceSystem;
  culture: CultureState;
  population: string[];
  territory: Position[];
  resources: Record<ResourceType, number>;
  laws: string[];
  foundedAtTick: number;
}

export interface GovernanceSystem {
  type: GovernanceType;
  leaderId: string | null;
  councilIds: string[];
  electionIntervalTicks: number | null;
  lastElectionTick: number | null;
}

export interface CultureState {
  traditions: string[];
  stories: string[];
  taboos: string[];
  namingStyle: string;
  greetingStyle: string;
  architectureStyle: string;
}

// === Diplomacy ===

export type DiplomaticStatus = 'friendly' | 'neutral' | 'hostile' | 'allied' | 'war';

export interface DiplomaticRelation {
  villageId1: string;
  villageId2: string;
  status: DiplomaticStatus;
  tension: number;          // 0-100 (high = closer to war)
  tradeActive: boolean;
  lastInteractionTick: number;
}

export interface TradeAgreement {
  id: string;
  fromVillageId: string;
  toVillageId: string;
  offer: Partial<Record<ResourceType, number>>;
  request: Partial<Record<ResourceType, number>>;
  establishedTick: number;
  intervalTicks: number;    // how often trade executes
}

// === Player Intention ===

export type IntentionType = 'guide' | 'value' | 'warning' | 'question' | 'name' | 'relationship';
export type IntentionStrength = 'whisper' | 'suggestion' | 'decree';

export interface PlayerIntention {
  id: string;
  type: IntentionType;
  target: IntentionTarget;
  message: string;
  strength: IntentionStrength;
  tick: number;
  expiresAtTick: number;
}

export interface IntentionTarget {
  type: 'agent' | 'village' | 'world';
  id?: string;
}

// === Game ===

export type GameStatus = 'created' | 'running' | 'paused' | 'finished';

export interface GameConfig {
  seed: number;
  mapSize: number;
  initialAgents: number;
  maxAgents: number;
  tickIntervalMs: number;
}

export interface GameState {
  id: string;
  status: GameStatus;
  tick: number;
  config: GameConfig;
  dayOfYear: number;
  year: number;
}

// === Events ===

export type GameEventType =
  | 'birth' | 'death' | 'founding' | 'election'
  | 'war' | 'peace' | 'discovery' | 'construction'
  | 'conversation' | 'reproduction' | 'migration'
  | 'trade' | 'alliance' | 'diplomacy';

export interface GameEvent {
  id: string;
  gameId: string;
  type: GameEventType;
  tick: number;
  actorIds: string[];
  description: string;
  data: Record<string, unknown>;
}

// === WebSocket Messages ===

export type WSClientMessage =
  | { type: 'subscribe_chunks'; chunks: { cx: number; cy: number }[] }
  | { type: 'unsubscribe_chunks'; chunks: { cx: number; cy: number }[] }
  | { type: 'send_intention'; intention: Omit<PlayerIntention, 'id' | 'tick'> };

export type WSServerMessage =
  | { type: 'tick'; tick: number; dayOfYear: number; year: number }
  | { type: 'chunk_update'; chunk: Chunk }
  | { type: 'agents_update'; agents: AgentState[] }
  | { type: 'event'; event: GameEvent }
  | { type: 'dialogue'; agentId: string; targetId: string; lines: DialogueLine[] }
  | { type: 'agent_thought'; agentId: string; thought: string }
  | { type: 'village_update'; village: Village }
  | { type: 'stats_update'; stats: WorldStats }
  | { type: 'error'; message: string };

export interface DialogueLine {
  speakerId: string;
  text: string;
}

// === LLM Decision Types ===

export interface DailyPlan {
  innerThought: string;
  schedule: ScheduleSlot[];
  socialIntentions: SocialIntention[];
  philosophyShift?: Partial<Philosophy>;
}

export interface ScheduleSlot {
  slot: number;
  action: string;
  target?: string;
  reason: string;
}

export interface SocialIntention {
  targetAgentId: string;
  intention: string;
}

export interface ConversationResult {
  dialogue: DialogueLine[];
  sentimentChange: Record<string, number>;
  newMemories: { agentId: string; content: string; importance: number }[];
}

export interface ReflectionResult {
  reflection: string;
  beliefChange?: Partial<Philosophy>;
  newInsight?: string;
}

// === Statistics / Dashboard ===

export interface WorldStats {
  tick: number;
  population: number;
  livingCount: number;
  deadCount: number;
  villageCount: number;
  generationMax: number;
  philosophyDistribution: Record<GovernanceType, number>;
  economicsDistribution: Record<EconomicsType, number>;
  avgHunger: number;
  avgEnergy: number;
  avgSocial: number;
  populationHistory: { tick: number; count: number }[];
}

export interface SaveData {
  version: number;
  gameState: GameState;
  agents: AgentState[];
  villages: Village[];
  structures: Structure[];
  relationships: { agentId: string; relations: Relationship[] }[];
  events: GameEvent[];
  intentions: PlayerIntention[];
  diplomacy: DiplomaticRelation[];
  trades: TradeAgreement[];
  mapSeed: number;
  tick: number;
}

// === API Response Types ===

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
