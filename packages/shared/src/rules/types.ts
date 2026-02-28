// === Effect System — ゲームの「物理法則」を定義する型 ===

import type { Position } from '../types.ts';
import type { ResourceType4X } from '../types4x.ts';

// --- Effect ---

export type EffectType =
  | 'resource_production'   // 資源を毎ティック生産
  | 'resource_storage'      // 資源の最大保有量を増加
  | 'housing'               // 住居容量を追加
  | 'research_points'       // 研究ポイントを毎ティック生産
  | 'culture_points'        // 文化ポイントを毎ティック生産
  | 'tile_yield_mod'        // 特定地形の産出を倍率変更
  | 'attack_bonus'          // 攻撃力ボーナス（加算 or 乗算）
  | 'defense_bonus'         // 防御力ボーナス
  | 'unit_training_speed'   // ユニット訓練速度倍率
  | 'build_speed'           // 建設速度倍率
  | 'population_growth'     // 人口増加率ボーナス
  | 'food_consumption_mod'  // 食料消費倍率
  | 'trade_income'          // 交易金収入
  | 'vision_range'          // 視界範囲ボーナス
  | 'fortification'         // 城壁防御値
  | 'heal_per_tick'         // 毎ティック回復
  | 'unlock_unit'           // ユニット訓練を解放
  | 'unlock_building';      // 建物建設を解放

export type EffectScope = 'village' | 'tile' | 'unit' | 'global';

export type TerrainType4X = 'plains' | 'forest' | 'mountain' | 'water' | 'desert' | 'swamp';

export interface EffectTarget {
  scope: EffectScope;
  resource?: ResourceType4X;
  unitType?: string;
  terrain?: TerrainType4X;
}

export type EffectConditionType =
  | 'has_tech'
  | 'has_building'
  | 'at_war'
  | 'at_peace'
  | 'population_above'
  | 'population_below'
  | 'adjacent_to_terrain';

export interface EffectCondition {
  type: EffectConditionType;
  value: string | number;
}

export interface Effect {
  type: EffectType;
  target: EffectTarget;
  value: number;
  condition?: EffectCondition;
}

// --- Building Definition ---

export type BuildingCategory = 'economy' | 'military' | 'culture' | 'infrastructure';

export interface BuildingDef {
  id: string;
  name: string;
  nameJa: string;
  category: BuildingCategory;
  cost: Partial<Record<ResourceType4X, number>>;
  buildTicks: number;
  maxPerVillage: number;       // 0 = unlimited
  effects: Effect[];
  requires: {
    tech?: string;
    building?: string;
    population?: number;
  };
}

// --- Technology Definition ---

export type TechBranch = 'agriculture' | 'military' | 'culture';

export interface TechDef {
  id: string;
  name: string;
  nameJa: string;
  branch: TechBranch;
  tier: number;                // 1-10
  researchCost: number;        // 研究ポイント
  effects: Effect[];
  requires: {
    tech?: string;             // 前提技術
  };
}

// --- Unit Definition ---

export interface UnitDef {
  id: string;
  name: string;
  nameJa: string;
  attack: number;
  defense: number;
  hp: number;
  speed: number;               // タイル/ティック
  range: number;               // 射程 (1 = 近接)
  trainCost: Partial<Record<ResourceType4X, number>>;
  trainTicks: number;
  upkeepPerTick: Partial<Record<ResourceType4X, number>>;
  requires: {
    tech?: string;
    building?: string;
  };
  tags: string[];              // 'melee' | 'ranged' | 'cavalry' | 'siege'
}

// --- Victory Condition ---

export type VictoryType = 'domination' | 'culture' | 'diplomacy' | 'technology' | 'economic' | 'score';

export interface VictoryConditionDef {
  type: VictoryType;
  name: string;
  nameJa: string;
  description: string;
  check: {
    metric: string;            // 判定するメトリクス
    threshold: number;         // 閾値
    comparison: 'gte' | 'lte' | 'eq';
  };
}

// --- Terrain Rule ---

export interface TerrainRuleDef {
  terrain: TerrainType4X;
  yields: Partial<Record<ResourceType4X, number>>;
  movementCost: number;
  defenseBonus: number;        // 防御時ボーナス倍率
  attackPenalty: number;       // 攻撃時ペナルティ倍率
  buildable: boolean;
}

// --- Queue Item (建設/研究/訓練の共通型) ---

export type QueueType = 'building' | 'research' | 'training';

export interface QueueItem {
  id: string;
  queueType: QueueType;
  defId: string;               // BuildingDef.id / TechDef.id / UnitDef.id
  remainingTicks: number;
  totalTicks: number;
  position?: Position;         // 建設の場合、配置位置
}
