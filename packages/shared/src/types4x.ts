// === 4X ストラテジー用の状態型定義 ===

import type { Position } from './types.ts';
import type { QueueItem, Effect } from './rules/types.ts';

// --- 資源タイプ（5種: 旧7種から統合） ---

export type ResourceType4X = 'food' | 'wood' | 'stone' | 'iron' | 'gold';

export const RESOURCE_TYPES_4X: ResourceType4X[] = ['food', 'wood', 'stone', 'iron', 'gold'];

export type Resources4X = Record<ResourceType4X, number>;

export function emptyResources(): Resources4X {
  return { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 };
}

// --- 建物インスタンス（村に建った実体） ---

export interface BuildingInstance {
  id: string;
  defId: string;               // BuildingDef.id を参照
  position: Position;
  level: number;
  health: number;
  maxHealth: number;
  builtAtTick: number;
}

// --- 軍事ユニットスタック ---

export interface ArmyUnit {
  defId: string;               // UnitDef.id を参照
  count: number;
  veterancy: number;           // 0-100 (戦闘経験)
}

// --- 軍隊（移動・攻撃の単位） ---

export interface Army {
  id: string;
  villageId: string;
  units: ArmyUnit[];
  position: Position;
  targetPosition?: Position;   // 移動目標
  status: 'idle' | 'moving' | 'attacking' | 'defending';
  cachedPath?: Position[];     // F1: Pathfinding cache
}

// --- 交易路 ---

export interface TradeRoute4X {
  id: string;
  fromVillageId: string;
  toVillageId: string;
  goodsSent: Partial<Resources4X>;
  goodsReceived: Partial<Resources4X>;
  establishedTick: number;
}

// --- 村の4X状態（1村あたり） ---

export interface VillageState4X {
  villageId: string;
  ownerId: string | null;      // プレイヤーID or null (AI村)
  ownerAddress?: string;        // Starknet wallet address (F7)
  centerPosition: Position;     // F2: Immutable village center

  // 資源
  resources: Resources4X;
  resourceStorage: Resources4X; // 最大保有量

  // 人口
  population: number;
  housingCapacity: number;

  // 進捗ポイント
  researchPoints: number;
  culturePoints: number;
  totalCulturePoints: number;  // 勝利条件用の累計

  // 研究済み技術
  researchedTechs: Set<string>;

  // 建物
  buildings: BuildingInstance[];

  // 軍隊
  armies: Army[];
  garrison: ArmyUnit[];       // 駐留部隊

  // キュー
  buildQueue: QueueItem[];
  researchQueue: QueueItem[];
  trainQueue: QueueItem[];

  // 交易
  tradeRoutes: TradeRoute4X[];

  // 地形タイル（村の領土）
  territory: Position[];

  // メタ
  foundedAtTick: number;
  score: number;

  // 経済勝利用: 累計ゴールド獲得量
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

// --- 自然災害 (F4) ---

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

// --- 戦闘結果 ---

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

// --- 勝利イベント ---

export interface VictoryEvent {
  winnerId: string;            // プレイヤーID or 村ID
  villageId: string;
  victoryType: string;
  tick: number;
  score: number;
}

// --- Layer 1: 契約 (Covenants) ---

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
  relevance: number;            // 1.0 → 0.0 (忘却法則で減衰)
}

// --- Layer 2: 発明 (Inventions) ---

export interface Invention {
  id: string;
  type: 'building' | 'tech' | 'unit';
  inventorAgentId: string;
  originVillageId: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;  // BuildingDef | TechDef | UnitDef をシリアライズ
  inventedAtTick: number;
  knownByVillages: string[];
  relevance: number;            // 忘却法則で減衰
}

// --- Layer 3: 制度 (Institutions) ---

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
  relevance: number;            // 忘却法則で減衰
}

// --- Autonomous World State (4層を格納) ---

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

// --- 4Xシリアライズ用（Set → Array） ---

export interface VillageState4XSerialized extends Omit<VillageState4X, 'researchedTechs'> {
  researchedTechs: string[];
}
