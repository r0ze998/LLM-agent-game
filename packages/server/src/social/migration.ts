// === F7: Agent Migration System ===

import type { AgentState, Village, Position } from '@murasato/shared';
import type { VillageState4X } from '@murasato/shared';
import {
  MIGRATION_FAMINE_THRESHOLD,
  MIGRATION_OVERCROWD_RATIO,
  MIGRATION_DISSATISFACTION_THRESHOLD,
  MIGRATION_PHILOSOPHY_MISMATCH_WEIGHT,
  MIGRATION_WAR_COURAGE_THRESHOLD,
} from '@murasato/shared';

// --- Dissatisfaction calculation ---

export function computeDissatisfaction(
  agent: AgentState,
  village: Village | null,
  vs4x: VillageState4X | null,
  isAtWar: boolean,
): number {
  let score = 0;

  // Famine: low food per capita
  if (vs4x && vs4x.population > 0) {
    const foodPerCapita = vs4x.resources.food / vs4x.population;
    if (foodPerCapita < MIGRATION_FAMINE_THRESHOLD) {
      score += 30 * (1 - foodPerCapita / MIGRATION_FAMINE_THRESHOLD);
    }
  }

  // War pressure: low-courage agents dislike war
  if (isAtWar && agent.identity.personality.courage < MIGRATION_WAR_COURAGE_THRESHOLD) {
    score += 20 * (1 - agent.identity.personality.courage / 100);
  }

  // Philosophy mismatch with village governance
  if (village && agent.identity.philosophy.governance !== village.governance.type) {
    score += MIGRATION_PHILOSOPHY_MISMATCH_WEIGHT * (1 - agent.identity.personality.agreeableness / 100);
  }

  // Overcrowding
  if (vs4x && vs4x.population > vs4x.housingCapacity * MIGRATION_OVERCROWD_RATIO) {
    score += 15;
  }

  return Math.min(100, Math.max(0, score));
}

// --- Find best migration target ---

export function findMigrationTarget(
  agent: AgentState,
  villages: Map<string, Village>,
  villageStates: Map<string, VillageState4X>,
): string | null {
  let bestVillageId: string | null = null;
  let bestScore = -Infinity;

  for (const [vid, village] of villages) {
    if (vid === agent.villageId) continue;
    const vs = villageStates.get(vid);
    if (!vs) continue;

    // Score based on: food availability, housing room, philosophy match
    let score = 0;
    if (vs.population > 0) {
      score += (vs.resources.food / vs.population) * 2;
    }
    if (vs.population < vs.housingCapacity) {
      score += 10;
    }
    if (agent.identity.philosophy.governance === village.governance.type) {
      score += 15;
    }

    // Prefer closer villages (use center distance)
    const dist = Math.abs(agent.position.x - vs.centerPosition.x) +
                 Math.abs(agent.position.y - vs.centerPosition.y);
    score -= dist * 0.2;

    if (score > bestScore) {
      bestScore = score;
      bestVillageId = vid;
    }
  }

  return bestVillageId;
}

// --- Check for homeless agents near villages for recruitment ---

export function checkHomelessRecruitment(
  agents: AgentState[],
  villages: Map<string, Village>,
  villageStates: Map<string, VillageState4X>,
): { agentId: string; villageId: string }[] {
  const results: { agentId: string; villageId: string }[] = [];

  const homeless = agents.filter(a =>
    !a.villageId && a.identity.status !== 'dead' && a.identity.status !== 'child',
  );

  for (const agent of homeless) {
    for (const [vid, village] of villages) {
      const vs = villageStates.get(vid);
      if (!vs) continue;

      // Check if agent is near the village (within 3 tiles of center)
      const dist = Math.abs(agent.position.x - vs.centerPosition.x) +
                   Math.abs(agent.position.y - vs.centerPosition.y);
      if (dist > 3) continue;

      // Check housing capacity
      if (vs.population >= vs.housingCapacity) continue;

      // 10% chance per check
      if (Math.random() > 0.1) continue;

      results.push({ agentId: agent.identity.id, villageId: vid });
      break; // One village per agent
    }
  }

  return results;
}
