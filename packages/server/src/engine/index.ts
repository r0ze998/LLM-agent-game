// === 4X Engine — Initialization + re-exports ===

export { aggregateEffects, processVillageTick } from './ruleEngine.ts';
export type { AggregatedEffects, TickResult } from './ruleEngine.ts';
export { resolveCombat, conquerVillage } from './combatEngine.ts';
export { processCommand } from './commandProcessor.ts';
export type { World4XRef } from './commandProcessor.ts';
export { checkVictory, computeScoreRanking } from './victoryChecker.ts';
export type { VictoryCheckContext } from './victoryChecker.ts';
export { generateAICommands } from './aiStrategy.ts';
