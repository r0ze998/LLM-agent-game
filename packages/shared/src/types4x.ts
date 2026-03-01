// === 4X Strategy State Type Definitions ===

import type { Position } from './types.ts';
import type { QueueItem, Effect } from './rules/types.ts';

// --- Resource Types (5 types, consolidated from the original 7) ---

export type ResourceType4X = 'food' | 'wood' | 'stone' | 'iron' | 'gold';

export const RESOURCE_TYPES_4X: ResourceType4X[] = ['food', 'wood', 'stone', 'iron', 'gold'];

export type Resources4X = Record<ResourceType4X, number>;

export function emptyResources(): Resources4X {
  return { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 };
}

// --- Building Instance (placed in a village) ---

export interface BuildingInstance {
  id: string;
  defId: string;               // References BuildingDef.id
  position: Position;
  level: number;
  health: number;
  maxHealth: number;
  builtAtTick: number;
}

// --- Military Unit Stack ---

export interface ArmyUnit {
  defId: string;               // References UnitDef.id
  count: number;
  veterancy: number;           // 0-100 (combat experience)
}

// --- Army (unit of movement and attack) ---

export interface Army {
  id: string;
  villageId: string;
  units: ArmyUnit[];
  position: Position;
  targetPosition?: Position;   // Movement destination
  status: 'idle' | 'moving' | 'attacking' | 'defending';
  cachedPath?: Position[];     // F1: Pathfinding cache
}

// --- Trade Route ---

export interface TradeRoute4X {
  id: string;
  fromVillageId: string;
  toVillageId: string;
  goodsSent: Partial<Resources4X>;
  goodsReceived: Partial<Resources4X>;
  establishedTick: number;
}

// --- Village 4X State (per village) ---

export interface VillageState4X {
  villageId: string;
  ownerId: string | null;      // Player ID or null (AI village)
  ownerAddress?: string;        // Starknet wallet address (F7)
  centerPosition: Position;     // F2: Immutable village center

  // Resources
  resources: Resources4X;
  resourceStorage: Resources4X; // Maximum storage capacity

  // Population
  population: number;
  housingCapacity: number;

  // Progress points
  researchPoints: number;
  culturePoints: number;
  totalCulturePoints: number;  // Cumulative total for victory condition

  // Researched technologies
  researchedTechs: Set<string>;

  // Buildings
  buildings: BuildingInstance[];

  // Military
  armies: Army[];
  garrison: ArmyUnit[];       // Stationed garrison units

  // Queues
  buildQueue: QueueItem[];
  researchQueue: QueueItem[];
  trainQueue: QueueItem[];

  // Trade
  tradeRoutes: TradeRoute4X[];

  // Terrain tiles (village territory)
  territory: Position[];

  // Metadata
  foundedAtTick: number;
  score: number;

  // Economic victory: cumulative gold earned
  totalGoldEarned: number;
}

export function createDefaultVillageState4X(
  villageId: string,
  ownerId: string | null,
  territory: Position[],
  tick: number,
  centerPosition?: Position,
): VillageState4X {
  const center = centerPosition ?? territory[0] ?? { x: 0, y: 0 };
  return {
    villageId,
    ownerId,
    centerPosition: center,
    resources: { food: 50, wood: 30, stone: 20, iron: 0, gold: 0 },
    resourceStorage: { food: 200, wood: 200, stone: 200, iron: 100, gold: 100 },
    population: 5,
    housingCapacity: 10,
    researchPoints: 0,
    culturePoints: 0,
    totalCulturePoints: 0,
    researchedTechs: new Set(),
    buildings: [],
    armies: [],
    garrison: [],
    buildQueue: [],
    researchQueue: [],
    trainQueue: [],
    tradeRoutes: [],
    territory,
    foundedAtTick: tick,
    score: 0,
    totalGoldEarned: 0,
  };
}

// --- Natural Disasters (F4) ---

export type DisasterType = 'drought' | 'flood' | 'plague' | 'locust' | 'earthquake';

export interface Disaster {
  id: string;
  type: DisasterType;
  centerPosition: Position;
  radius: number;
  remainingTicks: number;
  severity: number;             // 0-1
  affectedVillageIds: string[];
}

// --- Combat Result ---

export interface CombatResult {
  attackerVillageId: string;
  defenderVillageId: string;
  attackerWon: boolean;
  attackerLosses: ArmyUnit[];
  defenderLosses: ArmyUnit[];
  attackPower: number;
  defensePower: number;
  effectiveRatio: number;
  position: Position;
}

// --- Victory Event ---

export interface VictoryEvent {
  winnerId: string;            // Player ID or village ID
  villageId: string;
  victoryType: string;
  tick: number;
  score: number;
}

// --- Layer 1: Covenants ---

export type ClauseType =
  | 'tax_rate'           // { resource: ResourceType4X, rate: 0.0-0.5 }
  | 'trade_tariff'       // { rate: 0.0-0.3 }
  | 'conscription'       // { ratio: 0.0-0.2 }
  | 'resource_sharing'   // { resource: ResourceType4X, percent: 0.0-0.5 }
  | 'building_ban'       // { buildingDefId: string }
  | 'building_subsidy'   // { buildingDefId: string, discount: 0.0-0.5 }
  | 'research_focus'     // { branch: 'agriculture'|'military'|'culture', bonus: 0.1-0.5 }
  | 'military_pact'      // { sharedDefense: boolean }
  | 'non_aggression'     // { durationTicks: number }
  | 'tribute'            // { resource: ResourceType4X, amount: number, intervalTicks: number }
  | 'immigration_policy' // { open: boolean }
  | 'rationing'          // { resource: 'food', consumption_mod: 0.5-1.0 }
  | 'festival';          // { culture_bonus: 1-5, food_cost: number }

export interface CovenantClause {
  type: ClauseType;
  params: Record<string, number | string | boolean>;
}

export interface Covenant {
  id: string;
  villageId: string;
  scope: 'village' | 'bilateral' | 'global';
  targetVillageId?: string;
  name: string;
  description: string;
  clauses: CovenantClause[];
  proposedByAgentId: string;
  ratifiedByAgentIds: string[];
  enactedAtTick: number;
  expiresAtTick: number | null;
  repealedAtTick: number | null;
  relevance: number;            // 1.0 -> 0.0 (decays via oblivion rule)
}

// --- Layer 2: Inventions ---

export interface Invention {
  id: string;
  type: 'building' | 'tech' | 'unit';
  inventorAgentId: string;
  originVillageId: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;  // Serialized BuildingDef | TechDef | UnitDef
  inventedAtTick: number;
  knownByVillages: string[];
  relevance: number;            // Decays via oblivion rule
}

// --- Layer 3: Institutions ---

export type InstitutionType = 'guild' | 'religion' | 'alliance' | 'academy' | 'custom';

export interface JoinRequirement {
  type: 'min_population' | 'has_tech' | 'has_building' | 'min_culture' | 'approval';
  params: Record<string, number | string>;
}

export interface Institution {
  id: string;
  name: string;
  type: InstitutionType;
  founderAgentId: string;
  description: string;
  charter: string;
  memberVillageIds: string[];
  memberEffects: Effect[];
  joinRequirements: JoinRequirement[];
  foundedAtTick: number;
  treasury: Partial<Record<ResourceType4X, number>>;
  relevance: number;            // Decays via oblivion rule
}

// --- Autonomous World State (stores all layers) ---

export interface AutonomousWorldState {
  covenants: Map<string, Covenant>;
  inventions: Map<string, Invention>;
  institutions: Map<string, Institution>;
}

export function createAutonomousWorldState(): AutonomousWorldState {
  return {
    covenants: new Map(),
    inventions: new Map(),
    institutions: new Map(),
  };
}

// --- 4X Serialization (Set -> Array) ---

export interface VillageState4XSerialized extends Omit<VillageState4X, 'researchedTechs'> {
  researchedTechs: string[];
}
