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
export const IMPORTANT_MODEL = 'claude-sonnet-4-6';
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
