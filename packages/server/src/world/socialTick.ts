/**
 * Social tick functions — elder wisdom, reflection, governance drift
 * Extracted from simulation.ts (F10c/F10d/F10e)
 */
import type { AgentState, Village } from '@murasato/shared';
import { MemoryManager } from '../agent/memory.ts';
import type { WorldState } from './simulation.ts';

// === F10c: Elder wisdom pool ===

export function extractElderWisdom(agent: AgentState, world: WorldState): void {
  if (!agent.villageId) return;
  const memMgr = new MemoryManager(agent.identity.id, world.gameId);
  const topMemories = memMgr.getTopMemories(world.tick, 3)
    .filter(m => m.tier === 'longterm');

  if (topMemories.length === 0) return;

  const existing = world.villageWisdom.get(agent.villageId) ?? [];
  existing.push(...topMemories);
  // Cap at 20
  while (existing.length > 20) existing.shift();
  world.villageWisdom.set(agent.villageId, existing);
}

// === F10d: Reflection check ===

export function shouldReflect(agent: AgentState, tick: number): boolean {
  return agent.identity.status !== 'dead' &&
         agent.identity.status !== 'child' &&
         tick % 100 === 0;
}

// === F10e: Governance drift ===

export function evaluateGovernanceDrift(village: Village, members: AgentState[]): void {
  if (members.length < 3) return;
  const livingAdults = members.filter(a => a.identity.status === 'adult' || a.identity.status === 'elder');
  if (livingAdults.length < 3) return;

  const govCounts: Record<string, number> = {};
  for (const a of livingAdults) {
    govCounts[a.identity.philosophy.governance] = (govCounts[a.identity.philosophy.governance] ?? 0) + 1;
  }

  for (const [gov, count] of Object.entries(govCounts)) {
    if (count / livingAdults.length > 0.6 && gov !== village.governance.type) {
      village.governance.type = gov as any;
      break;
    }
  }
}
