import { pgTable, text, integer, real, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

// === Games ===

export const games = pgTable('games', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('created'), // created | running | paused | finished
  tick: integer('tick').notNull().default(0),
  seed: integer('seed').notNull(),
  config: jsonb('config').notNull(), // GameConfig
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;

// === Agents ===

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  name: text('name').notNull(),
  generation: integer('generation').notNull().default(0),
  parentIds: jsonb('parent_ids').notNull().default([]),           // string[]
  personality: jsonb('personality').notNull(),                     // PersonalityAxes
  philosophy: jsonb('philosophy').notNull(),                      // Philosophy
  skills: jsonb('skills').notNull(),                              // SkillMap
  age: integer('age').notNull().default(0),
  lifespan: integer('lifespan').notNull(),
  status: text('status').notNull().default('child'),              // AgentLifeStatus
  hunger: integer('hunger').notNull().default(100),
  energy: integer('energy').notNull().default(100),
  social: integer('social').notNull().default(50),
  posX: integer('pos_x').notNull(),
  posY: integer('pos_y').notNull(),
  currentAction: text('current_action'),
  villageId: text('village_id'),
  inventory: jsonb('inventory').notNull().default({}),            // Record<ResourceType, number>
  dailyPlan: jsonb('daily_plan'),                                 // DailyPlan | null
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

// === Memories ===

export const memories = pgTable('memories', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  gameId: text('game_id').notNull().references(() => games.id),
  tier: text('tier').notNull(),                                   // working | episodic | longterm
  content: text('content').notNull(),
  importance: real('importance').notNull().default(0.5),
  tick: integer('tick').notNull(),
  accessCount: integer('access_count').notNull().default(0),
  tags: jsonb('tags').notNull().default([]),                      // string[]
});

export type MemoryRow = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

// === Relationships ===

export const relationships = pgTable('relationships', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  targetId: text('target_id').notNull().references(() => agents.id),
  sentiment: integer('sentiment').notNull().default(0),           // -100 to 100
  trust: integer('trust').notNull().default(0),                   // 0 to 100
  familiarity: integer('familiarity').notNull().default(0),       // 0 to 100
  roles: jsonb('roles').notNull().default([]),                    // string[]
  lastInteractionTick: integer('last_interaction_tick').notNull().default(0),
});

export type RelationshipRow = typeof relationships.$inferSelect;
export type NewRelationship = typeof relationships.$inferInsert;

// === Villages ===

export const villages = pgTable('villages', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  name: text('name').notNull(),
  founderId: text('founder_id').notNull(),
  governance: jsonb('governance').notNull(),                      // GovernanceSystem
  culture: jsonb('culture').notNull(),                            // CultureState
  population: jsonb('population').notNull().default([]),          // string[]
  territory: jsonb('territory').notNull().default([]),            // Position[]
  resources: jsonb('resources').notNull().default({}),            // Record<ResourceType, number>
  laws: jsonb('laws').notNull().default([]),                      // string[]
  foundedAtTick: integer('founded_at_tick').notNull(),
});

export type VillageRow = typeof villages.$inferSelect;
export type NewVillage = typeof villages.$inferInsert;

// === Structures ===

export const structures = pgTable('structures', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  type: text('type').notNull(),                                   // StructureType
  posX: integer('pos_x').notNull(),
  posY: integer('pos_y').notNull(),
  level: integer('level').notNull().default(1),
  health: integer('health').notNull(),
  maxHealth: integer('max_health').notNull(),
  villageId: text('village_id').notNull().references(() => villages.id),
  builderId: text('builder_id').notNull(),
  builtAtTick: integer('built_at_tick').notNull(),
});

export type StructureRow = typeof structures.$inferSelect;
export type NewStructure = typeof structures.$inferInsert;

// === Events (Chronicle) ===

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  type: text('type').notNull(),                                   // GameEventType
  tick: integer('tick').notNull(),
  actorIds: jsonb('actor_ids').notNull().default([]),             // string[]
  description: text('description').notNull(),
  data: jsonb('data').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type EventRow = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

// === Player Intentions ===

export const playerIntentions = pgTable('player_intentions', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  type: text('type').notNull(),                                   // IntentionType
  targetType: text('target_type').notNull(),                      // agent | village | world
  targetId: text('target_id'),
  message: text('message').notNull(),
  strength: text('strength').notNull(),                           // whisper | suggestion | decree
  tick: integer('tick').notNull(),
  expiresAtTick: integer('expires_at_tick').notNull(),
  acknowledged: boolean('acknowledged').notNull().default(false),
  result: text('result'),                                         // what happened
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type PlayerIntentionRow = typeof playerIntentions.$inferSelect;
export type NewPlayerIntention = typeof playerIntentions.$inferInsert;
