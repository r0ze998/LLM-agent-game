import type { WorldStats, GovernanceType, EconomicsType, AgentState, Village } from '@murasato/shared';
import type { WorldState } from '../world/simulation.ts';

// Population history (kept in memory per game)
const populationHistory = new Map<string, { tick: number; count: number }[]>();

export function recordPopulation(gameId: string, tick: number, count: number): void {
  const history = populationHistory.get(gameId) ?? [];
  // Sample every 10 ticks
  if (tick % 10 === 0) {
    history.push({ tick, count });
    // Keep last 1000 entries
    if (history.length > 1000) history.shift();
    populationHistory.set(gameId, history);
  }
}

export function computeWorldStats(world: WorldState): WorldStats {
  const living = world.livingAgents;
  const dead = [...world.agents.values()].filter(a => a.identity.status === 'dead');

  const govDist: Record<GovernanceType, number> = {
    democratic: 0, meritocratic: 0, authoritarian: 0, anarchist: 0, theocratic: 0,
  };
  const econDist: Record<EconomicsType, number> = {
    collectivist: 0, market: 0, gift_economy: 0, feudal: 0,
  };

  let totalHunger = 0, totalEnergy = 0, totalSocial = 0;
  let maxGen = 0;

  for (const agent of living) {
    govDist[agent.identity.philosophy.governance]++;
    econDist[agent.identity.philosophy.economics]++;
    totalHunger += agent.needs.hunger;
    totalEnergy += agent.needs.energy;
    totalSocial += agent.needs.social;
    if (agent.identity.generation > maxGen) maxGen = agent.identity.generation;
  }

  const n = Math.max(1, living.length);

  recordPopulation(world.gameId, world.tick, living.length);

  return {
    tick: world.tick,
    population: world.agents.size,
    livingCount: living.length,
    deadCount: dead.length,
    villageCount: world.villages.size,
    generationMax: maxGen,
    philosophyDistribution: govDist,
    economicsDistribution: econDist,
    avgHunger: totalHunger / n,
    avgEnergy: totalEnergy / n,
    avgSocial: totalSocial / n,
    populationHistory: populationHistory.get(world.gameId) ?? [],
  };
}
