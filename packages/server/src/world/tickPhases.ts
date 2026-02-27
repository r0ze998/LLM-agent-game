/**
 * Tick phase helpers — agent needs, decision context, relationships, reproduction
 * Extracted from simulation.ts
 */
import type {
  AgentState, GameEvent, Relationship, ResourceType,
} from '@murasato/shared';
import {
  HUNGER_DECAY_PER_TICK, ENERGY_DECAY_PER_TICK, SOCIAL_DECAY_PER_TICK,
  VISION_RANGE, MAX_AGENTS,
  REPRODUCTION_MIN_SENTIMENT, REPRODUCTION_MIN_FOOD_SURPLUS,
} from '@murasato/shared';
import type { DecisionContext } from '../agent/decisionEngine.ts';
import { MemoryManager } from '../agent/memory.ts';
import { createChildAgent } from '../agent/lifecycle.ts';
import { setParentChildRoles, setSpouseRoles } from '../social/relationships.ts';
import type { WorldState } from './simulation.ts';
import { createEvent } from './simulation.ts';

// --- Need updates ---

export function updateAgentNeeds(world: WorldState): void {
  for (const agent of world.livingAgents) {
    agent.needs.hunger = Math.max(0, agent.needs.hunger - HUNGER_DECAY_PER_TICK);
    agent.needs.energy = Math.max(0, agent.needs.energy - ENERGY_DECAY_PER_TICK);
    agent.needs.social = Math.max(0, agent.needs.social - SOCIAL_DECAY_PER_TICK);
  }
}

// --- Decision context ---

export function buildDecisionContext(world: WorldState, agent: AgentState): DecisionContext {
  const agentNames = new Map<string, string>();
  for (const [id, a] of world.agents) {
    agentNames.set(id, a.identity.name);
  }

  const nearbyAgents = world.livingAgents
    .filter(a => a.identity.id !== agent.identity.id)
    .map(a => ({
      id: a.identity.id,
      name: a.identity.name,
      distance: Math.abs(a.position.x - agent.position.x) + Math.abs(a.position.y - agent.position.y),
    }))
    .filter(a => a.distance <= VISION_RANGE)
    .sort((a, b) => a.distance - b.distance);

  const village = agent.villageId ? world.villages.get(agent.villageId) ?? null : null;
  const relationships = world.relationships.get(agent.identity.id) ?? [];
  const relevantIntentions = world.intentions.filter(i =>
    (i.target.type === 'world') ||
    (i.target.type === 'agent' && i.target.id === agent.identity.id) ||
    (i.target.type === 'village' && i.target.id === agent.villageId),
  );

  // Look up blueprint soul/rules/backstory
  let soulText: string | undefined;
  let behaviorRules: string[] | undefined;
  let backstory: string | undefined;
  if (agent.identity.blueprintId) {
    const bp = world.blueprints.get(agent.identity.blueprintId);
    if (bp) {
      soulText = bp.soul;
      behaviorRules = bp.rules.length > 0 ? bp.rules : undefined;
      backstory = bp.backstory ?? undefined;
    }
  }

  // Build 4X strategy context if agent belongs to a village with 4X state
  let villageStrategy: DecisionContext['villageStrategy'] = undefined;
  if (agent.villageId) {
    const vs = world.villageStates4X.get(agent.villageId);
    if (vs) {
      const totalMilitary = vs.garrison.reduce((s, u) => s + u.count, 0)
        + vs.armies.reduce((s, a) => a.units.reduce((s2, u) => s2 + u.count, s), 0);
      const atWar = world.diplomacy.getAllRelations()
        .some(r => r.status === 'war' &&
          (r.villageId1 === agent.villageId || r.villageId2 === agent.villageId));

      villageStrategy = {
        resources: { ...vs.resources },
        population: vs.population,
        militaryStrength: totalMilitary,
        atWar,
        researchedTechs: [...vs.researchedTechs],
      };
    }
  }

  // F10c: Inject elder wisdom for young adults
  const memMgr = new MemoryManager(agent.identity.id, world.gameId);
  if (agent.villageId && agent.identity.status === 'adult' && agent.identity.age < 200) {
    const wisdomPool = world.villageWisdom.get(agent.villageId) ?? [];
    const wisdomSample = wisdomPool.sort(() => Math.random() - 0.5).slice(0, 3);
    for (const wisdom of wisdomSample) {
      memMgr.addMemory(`[長老の教え] ${wisdom.content}`, 0.6, world.tick, 'longterm', ['elder_wisdom']);
    }
  }

  return {
    agent,
    memories: memMgr,
    relationships,
    agentNames,
    village,
    nearbyAgents,
    intentions: relevantIntentions,
    tick: world.tick,
    soulText,
    behaviorRules,
    backstory,
    villageStrategy,
  };
}

// --- Relationship lookup ---

export function getRelationship(world: WorldState, agentId: string, targetId: string): Relationship | null {
  const rels = world.relationships.get(agentId) ?? [];
  return rels.find(r => r.targetId === targetId) ?? null;
}

// --- Reproduction ---

// === F10a: Village-influenced child philosophy ===
// === F10b: Generational rebellion ===

export function computePhilosophyVariance(members: AgentState[]): number {
  if (members.length < 2) return 0;
  const govCounts: Record<string, number> = {};
  for (const m of members) {
    govCounts[m.identity.philosophy.governance] = (govCounts[m.identity.philosophy.governance] ?? 0) + 1;
  }
  const maxCount = Math.max(...Object.values(govCounts));
  return 1 - maxCount / members.length;
}

export async function checkReproduction(world: WorldState): Promise<GameEvent[]> {
  const events: GameEvent[] = [];
  const living = world.livingAgents.filter(a => a.identity.status === 'adult');

  // Population cap
  if (world.livingAgents.length >= MAX_AGENTS) return events;

  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) {
      const a1 = living[i];
      const a2 = living[j];

      // Check proximity
      const dist = Math.abs(a1.position.x - a2.position.x) + Math.abs(a1.position.y - a2.position.y);
      if (dist > 1) continue;

      // Check relationship — both sides need positive sentiment
      const rel12 = getRelationship(world, a1.identity.id, a2.identity.id);
      const rel21 = getRelationship(world, a2.identity.id, a1.identity.id);
      if (!rel12 || rel12.sentiment < REPRODUCTION_MIN_SENTIMENT) continue;
      if (!rel21 || rel21.sentiment < REPRODUCTION_MIN_SENTIMENT) continue;

      // Check food surplus (village + personal)
      let totalFood = (a1.inventory.food ?? 0) + (a2.inventory.food ?? 0);
      if (a1.villageId) {
        const village = world.villages.get(a1.villageId);
        if (village) totalFood += (village.resources.food ?? 0);
      }
      if (totalFood < REPRODUCTION_MIN_FOOD_SURPLUS) continue;

      // Random chance per tick (2%)
      if (Math.random() > 0.02) continue;

      // Create child
      const namingStyle = a1.villageId
        ? (world.villages.get(a1.villageId)?.culture.namingStyle ?? '和風')
        : '和風';

      // F10a: Village governance influence on child philosophy
      const childVillage = a1.villageId ? world.villages.get(a1.villageId) : null;
      const villageGov = childVillage?.governance.type;

      // F10b: Generational rebellion — low variance → higher mutation
      let mutMult = 1.0;
      if (childVillage) {
        const villageMembers = childVillage.population
          .map(id => world.agents.get(id))
          .filter((a): a is AgentState => !!a && a.identity.status !== 'dead');
        const variance = computePhilosophyVariance(villageMembers);
        if (variance < 0.2) mutMult = 2.5;
      }

      try {
        const child = await createChildAgent(a1, a2, namingStyle, villageGov, mutMult);
        world.agents.set(child.identity.id, child as AgentState);

        // Set up family relationships
        setParentChildRoles(world.relationships, a1.identity.id, child.identity.id, world.tick);
        setParentChildRoles(world.relationships, a2.identity.id, child.identity.id, world.tick);
        setSpouseRoles(world.relationships, a1.identity.id, a2.identity.id, world.tick);

        // Add child to village
        if (child.villageId) {
          const village = world.villages.get(child.villageId);
          if (village && !village.population.includes(child.identity.id)) {
            village.population.push(child.identity.id);
          }
        }

        const villageName = child.villageId ? world.villages.get(child.villageId)?.name : undefined;
        events.push(createEvent(world.gameId, 'birth', world.tick,
          [a1.identity.id, a2.identity.id, child.identity.id],
          `${a1.identity.name}と${a2.identity.name}の子「${child.identity.name}」が生まれた（第${child.identity.generation}世代${villageName ? `、${villageName}` : ''}）`,
          { childId: child.identity.id, childName: child.identity.name, generation: child.identity.generation, villageName },
        ));
      } catch (err) {
        console.error('Reproduction error:', err);
      }
    }
  }

  return events;
}
