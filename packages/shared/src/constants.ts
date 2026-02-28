// === World ===
export const MAP_SIZE = 128;
export const CHUNK_SIZE = 16;
export const TILE_SIZE = 16;

// === Time ===
export const TICKS_PER_DAY = 24;
export const TICKS_PER_MONTH = 720;
export const TICKS_PER_YEAR = 8640;

// === Agent Lifecycle ===
export const DEFAULT_LIFESPAN_MIN = 800;
export const DEFAULT_LIFESPAN_MAX = 1500;
export const MATURITY_AGE = 200;
export const ELDER_AGE_RATIO = 0.75; // becomes elder at 75% of lifespan

// === Population ===
export const MAX_AGENTS = 100;
export const INITIAL_AGENTS = 8;
export const VISION_RANGE = 5;

// === Needs ===
export const HUNGER_DECAY_PER_TICK = 1;
export const ENERGY_DECAY_PER_TICK = 2;
export const SOCIAL_DECAY_PER_TICK = 0.5;
export const EAT_RESTORE = 30;
export const SLEEP_RESTORE = 50;
export const SOCIAL_RESTORE = 20;
export const CRITICAL_NEED_THRESHOLD = 20;

// === Resources ===
export const RESOURCE_REGEN_INTERVAL = 48; // ticks between resource regen
export const BASE_FOOD_PER_FARM_TICK = 3;
export const GATHER_BASE_AMOUNT = 5;

// === Building ===
export const BUILD_TICKS: Record<string, number> = {
  house: 10,
  farm: 8,
  workshop: 15,
  warehouse: 12,
  market: 20,
  meeting_hall: 25,
  school: 20,
  temple: 30,
  wall: 5,
  watchtower: 10,
  well: 8,
  road: 3,
};

// === Village ===
export const VILLAGE_FOUNDING_MIN_AGENTS = 3;
export const VILLAGE_FOUNDING_MIN_TICKS = 20;
export const ELECTION_INTERVAL_TICKS = 480; // 20 in-game days

// === Reproduction ===
export const REPRODUCTION_MIN_SENTIMENT = 50;
export const REPRODUCTION_MIN_FOOD_SURPLUS = 50;

// === LLM ===
export const DAILY_PLAN_MODEL = 'claude-haiku-4-5-20251001';
export const SOCIAL_MODEL = 'claude-haiku-4-5-20251001';
export const IMPORTANT_MODEL = 'claude-haiku-4-5-20251001';
export const MAX_WORKING_MEMORY = 20;
export const MAX_EPISODIC_MEMORY = 200;
export const REFLECTION_INTERVAL = 50;
export const LLM_RATE_LIMIT = 50; // requests per second
export const LLM_MAX_RETRIES = 3;

// === Simulation ===
export const DEFAULT_TICK_INTERVAL_MS = 2000;
export const SPEED_OPTIONS = [0, 0.5, 1, 2, 4, 8] as const;

// === Personality Ranges ===
export const PERSONALITY_MIN = 0;
export const PERSONALITY_MAX = 100;
export const PERSONALITY_MUTATION_RANGE = 15; // child personality = parent midpoint +/- this

// === Pathfinding ===
export const TERRAIN_MOVEMENT_COST: Record<string, number> = {
  plains: 1,
  forest: 2,
  mountain: 4,
  water: Infinity,
  desert: 2,
  swamp: 3,
};

// === Terrain Generation Thresholds ===
export const ELEVATION_WATER = 0.3;
export const ELEVATION_PLAINS = 0.45;
export const ELEVATION_FOREST = 0.6;
export const ELEVATION_MOUNTAIN = 0.8;
// desert/swamp determined by secondary noise

// === 4X Strategy Constants ===

// Population
export const FOOD_PER_POP_PER_TICK = 0.5;    // 1人口あたりの食料消費/tick
export const POP_GROWTH_BASE_RATE = 0.02;     // 基本人口増加率/tick (食料余剰時)
export const POP_STARVATION_RATE = 0.05;      // 飢餓時の人口減少率/tick
export const BASE_HOUSING_CAPACITY = 10;       // 建物なしの基本住居数
export const POP_RESEARCH_CONTRIBUTION = 0.1;  // 1人口あたりの研究ポイント/tick

// Resources
export const DEFAULT_RESOURCE_STORAGE = 200;   // デフォルト資源上限
export const TERRITORY_RADIUS = 5;             // 村中心からの領土半径

// Combat
export const COMBAT_RANDOM_MIN = 0.8;          // 戦闘ランダム係数の下限
export const COMBAT_RANDOM_MAX = 1.2;          // 戦闘ランダム係数の上限
export const ATTACKER_LOSS_RATE = 0.40;        // 敗北時の攻撃側損害率
export const DEFENDER_LOSS_RATE = 0.30;        // 敗北時の防御側損害率
export const VETERANCY_GAIN_PER_BATTLE = 10;   // 戦闘ごとの練度上昇

// Victory
export const SCORE_VICTORY_TICK = 12000;       // スコア勝利の判定ターン (500日)
export const CULTURE_VICTORY_THRESHOLD = 1000;
export const DOMINATION_RATIO = 0.75;
export const DIPLOMACY_ALLIANCE_RATIO = 0.60;
export const ECONOMIC_VICTORY_REVENUE_USD = 0.10; // 経済勝利に必要な累計USDC収益

// AI Strategy
export const AI_TICK_INTERVAL = 5;             // AI村のコマンド発行間隔
export const AI_MILITARY_THREAT_THRESHOLD = 0.6; // 軍事優先に切り替える脅威閾値

// === Resource Degradation (F3a) ===
export const DEGRADATION_PER_GATHER = 0.02;
export const DEGRADATION_NATURAL_RECOVERY = 0.001;
export const DEGRADATION_REGEN_PENALTY_MAX = 0.8;
export const DEFOREST_THRESHOLD = 0.8;
export const OVERFARM_FERTILITY_LOSS = 0.001;

// === Territory (F2) ===
export const TERRITORY_EXPANSION_CULTURE_THRESHOLD = 50;
export const TERRITORY_EXPANSION_CHECK_INTERVAL = 100;
export const TERRITORY_CONTEST_TENSION_GAIN = 5;
export const OUTPOST_CLAIM_RADIUS = 3;
// MAX_TERRITORY_RADIUS is defined in rules/physics.ts

// === Army Movement (F1) ===
export const ARMY_ATTACK_TRIGGER_RANGE = 1;
export const ARMY_PATH_RECOMPUTE_INTERVAL = 10;

// === Spatial Trade (F6) ===
export const TRADE_DISTANCE_COST_FACTOR = 0.05;
export const TRADE_ROAD_BONUS = 0.02;
export const TRADE_ROAD_MAX_BONUS = 0.30;

// === Natural Disasters (F4) ===
export const DISASTER_CHECK_INTERVAL = 500;
export const DISASTER_BASE_PROBABILITY = 0.15;

// === Migration (F7) ===
export const MIGRATION_FAMINE_THRESHOLD = 10;
export const MIGRATION_OVERCROWD_RATIO = 1.5;
export const MIGRATION_DISSATISFACTION_THRESHOLD = 60;
export const MIGRATION_PHILOSOPHY_MISMATCH_WEIGHT = 30;
export const MIGRATION_WAR_COURAGE_THRESHOLD = 30;

// === LLM Budget (F11) ===
export const LLM_BUDGET_PER_HOUR_USD = 1.0;
export const LLM_PAUSE_DURATION_MS = 300000;

// === x402 Payment ===
export const X402_DEFAULT_TRADE_FEE_USD = '0.0001';
export const X402_ALLIANCE_FEE_USD = '0.001';
export const X402_TRIBUTE_MIN_USD = '0.0005';
