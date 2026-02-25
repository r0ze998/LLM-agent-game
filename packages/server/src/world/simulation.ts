import type {
  AgentState, GameEvent, GameEventType, Position, Relationship,
  Village, PlayerIntention, ResourceType, StructureType,
} from '@murasato/shared';
import {
  HUNGER_DECAY_PER_TICK, ENERGY_DECAY_PER_TICK, SOCIAL_DECAY_PER_TICK,
  SLEEP_RESTORE, SOCIAL_RESTORE, VISION_RANGE, TICKS_PER_DAY,
  REPRODUCTION_MIN_SENTIMENT, REPRODUCTION_MIN_FOOD_SURPLUS,
  TERRAIN_MOVEMENT_COST, MAX_AGENTS,
} from '@murasato/shared';
import type { WorldMap } from './map.ts';
import { gatherFromTile, addToInventory, eatFood, farmTile, regenerateResources } from './resources.ts';
import { canBuild, createStructure, getBuildCost } from './building.ts';
import { decide, type DecisionContext, type AgentAction } from '../agent/decisionEngine.ts';
import { MemoryManager } from '../agent/memory.ts';
import { ageAgent, createChildAgent, growSkill, educateChild, getSkillForAction, checkGrowthMilestones } from '../agent/lifecycle.ts';
import { checkVillageForming, foundVillage, runElection, proposeLaw, voteLaw, leaveVillage } from '../social/governance.ts';
import { findConversationOpportunities, generateConversation as genConversation, applyConversationResults, createConversationEvent } from '../social/conversation.ts';
import { getOrCreateRelationship, setParentChildRoles, setSpouseRoles, decaySentiment } from '../social/relationships.ts';
import { checkCulturalExchange, applyCulturalExchange, evolveCulture } from '../social/culture.ts';
import { DiplomacyManager, processDiplomacy } from '../social/diplomacy.ts';

// --- World State ---

export interface WorldState {
  gameId: string;
  map: WorldMap;
  agents: Map<string, AgentState>;
  villages: Map<string, Village>;
  structures: Map<string, import('@murasato/shared').Structure>;
  relationships: Map<string, Relationship[]>; // keyed by agentId
  intentions: PlayerIntention[];
  diplomacy: DiplomacyManager;
  tick: number;

  get livingAgents(): AgentState[];
}

export function createWorldState(gameId: string, map: WorldMap): WorldState {
  const state: WorldState = {
    gameId,
    map,
    agents: new Map(),
    villages: new Map(),
    structures: new Map(),
    relationships: new Map(),
    intentions: [],
    diplomacy: new DiplomacyManager(),
    tick: 0,

    get livingAgents() {
      return [...this.agents.values()].filter(a => a.identity.status !== 'dead');
    },
  };
  return state;
}

// --- Tick Result ---

export interface TickResult {
  tick: number;
  actions: Map<string, AgentAction>;
  events: GameEvent[];
  changedChunks: Set<string>; // "cx,cy"
}

function createEvent(gameId: string, type: GameEventType, tick: number, actorIds: string[], description: string, data: Record<string, unknown> = {}): GameEvent {
  return {
    id: `evt_${crypto.randomUUID()}`,
    gameId,
    type,
    tick,
    actorIds,
    description,
    data,
  };
}

// --- Main tick ---

export async function tick(world: WorldState): Promise<TickResult> {
  world.tick++;
  const events: GameEvent[] = [];
  const changedChunks = new Set<string>();
  const actions = new Map<string, AgentAction>();

  // 1. World updates
  regenerateResources(world.map, world.tick);
  updateAgentNeeds(world);

  // 2. Agent decisions (batched)
  const living = world.livingAgents;
  const decisions = await Promise.all(
    living.map(async (agent) => {
      try {
        const ctx = buildDecisionContext(world, agent);
        const action = await decide(ctx);
        return { agentId: agent.identity.id, action };
      } catch (err) {
        console.error(`Decision error for ${agent.identity.name}:`, err);
        return { agentId: agent.identity.id, action: { type: 'rest' } as AgentAction };
      }
    }),
  );

  // 3. Execute actions + skill growth
  for (const { agentId, action } of decisions) {
    actions.set(agentId, action);
    const agent = world.agents.get(agentId);
    if (!agent || agent.identity.status === 'dead') continue;

    const result = executeAction(world, agent, action);
    if (result.event) events.push(result.event);
    if (result.changedChunk) changedChunks.add(result.changedChunk);

    // Skill growth from actions
    const skill = getSkillForAction(action.type);
    if (skill) growSkill(agent, skill, 0.05);

    // Check growth milestones
    const milestone = checkGrowthMilestones(agent);
    if (milestone) {
      events.push(createEvent(world.gameId, 'discovery', world.tick,
        [agentId], milestone.description, { type: milestone.type }));
    }
  }

  // 4. Social: conversations (using Phase 2 conversation system)
  const opportunities = findConversationOpportunities(living, world.relationships, world.tick);
  for (const opp of opportunities.slice(0, 3)) { // Cap at 3 conversations per tick
    try {
      const rel12 = getRelationship(world, opp.agent1.identity.id, opp.agent2.identity.id);
      const rel21 = getRelationship(world, opp.agent2.identity.id, opp.agent1.identity.id);
      const sharedVillage = opp.agent1.villageId != null && opp.agent1.villageId === opp.agent2.villageId;

      const result = await genConversation(opp.agent1, opp.agent2, rel12, rel21, opp.situation, sharedVillage);
      applyConversationResults(result, opp.agent1, opp.agent2, world.relationships, world.tick, world.gameId);
      events.push(createConversationEvent(world.gameId, opp.agent1, opp.agent2, result, world.tick));

      // Cultural exchange between agents of different villages
      const v1 = opp.agent1.villageId ? world.villages.get(opp.agent1.villageId) ?? null : null;
      const v2 = opp.agent2.villageId ? world.villages.get(opp.agent2.villageId) ?? null : null;
      const exchange = checkCulturalExchange(opp.agent1, opp.agent2, v1, v2);
      if (exchange) {
        const adopted = applyCulturalExchange(exchange);
        if (adopted) {
          events.push(createEvent(world.gameId, 'discovery', world.tick,
            [exchange.carrierAgent.identity.id],
            `${exchange.carrierAgent.identity.name}が${exchange.fromVillage.name}の${exchange.memeType}を${exchange.toVillage.name}に伝えた`,
            { memeType: exchange.memeType, content: exchange.content },
          ));
        }
      }
    } catch (err) {
      console.error('Conversation error:', err);
    }
  }

  // 5. Education: children near adults learn
  for (const child of living.filter(a => a.identity.status === 'child')) {
    const nearbyAdults = living.filter(a =>
      a.identity.id !== child.identity.id &&
      a.identity.status !== 'dead' && a.identity.status !== 'child' &&
      Math.abs(a.position.x - child.position.x) + Math.abs(a.position.y - child.position.y) <= 2,
    );
    if (nearbyAdults.length > 0 && Math.random() < 0.3) {
      const teacher = nearbyAdults[Math.floor(Math.random() * nearbyAdults.length)];
      educateChild(child, teacher);
    }
  }

  // 6. Lifecycle checks
  for (const agent of living) {
    agent.identity.age++;
    const newStatus = ageAgent(agent);
    if (newStatus !== agent.identity.status) {
      const oldStatus = agent.identity.status;
      agent.identity.status = newStatus;

      if (newStatus === 'dead') {
        events.push(createEvent(world.gameId, 'death', world.tick,
          [agent.identity.id],
          `${agent.identity.name}が生涯を終えた（享年${agent.identity.age}）`,
        ));
        // Remove from village on death
        if (agent.villageId) {
          const village = world.villages.get(agent.villageId);
          if (village) leaveVillage(agent, village);
        }
      } else if (newStatus === 'adult' && oldStatus === 'child') {
        events.push(createEvent(world.gameId, 'discovery', world.tick,
          [agent.identity.id],
          `${agent.identity.name}が成人した`,
        ));
      } else if (newStatus === 'elder' && oldStatus === 'adult') {
        events.push(createEvent(world.gameId, 'discovery', world.tick,
          [agent.identity.id],
          `${agent.identity.name}が長老になった`,
        ));
      }
    }

    // Starvation death
    if (agent.needs.hunger <= 0 && agent.identity.status !== 'dead') {
      agent.identity.status = 'dead';
      events.push(createEvent(world.gameId, 'death', world.tick,
        [agent.identity.id],
        `${agent.identity.name}が飢えで倒れた`,
      ));
      if (agent.villageId) {
        const village = world.villages.get(agent.villageId);
        if (village) leaveVillage(agent, village);
      }
    }
  }

  // 7. Reproduction check
  const reproductionEvents = await checkReproduction(world);
  events.push(...reproductionEvents);

  // 8. Village founding check
  const foundingResults = checkVillageForming(world.livingAgents, world.tick);
  for (const result of foundingResults) {
    if (!result.ready) continue;
    try {
      const { village, event } = await foundVillage(world.gameId, result.cluster, world.tick);
      world.villages.set(village.id, village);
      events.push(event);
    } catch (err) {
      console.error('Village founding error:', err);
    }
  }

  // 9. Village governance: elections + law proposals (every 100 ticks)
  if (world.tick % 100 === 0) {
    for (const village of world.villages.values()) {
      // Elections
      const electionResult = await runElection(world.gameId, village, world.agents, world.tick);
      if (electionResult) events.push(electionResult.event);

      // Occasional law proposals
      if (Math.random() < 0.2) {
        const leader = village.governance.leaderId ? world.agents.get(village.governance.leaderId) : null;
        if (leader) {
          const situation = `人口${village.population.length}、食料${village.resources.food ?? 0}`;
          const law = await proposeLaw(village, leader, situation);
          if (law) {
            const members = village.population
              .map(id => world.agents.get(id))
              .filter((a): a is AgentState => !!a && a.identity.status !== 'dead');
            const passed = voteLaw(village, members, law);
            events.push(createEvent(world.gameId, 'election', world.tick,
              [leader.identity.id],
              `${village.name}で法律「${law}」が${passed ? '可決' : '否決'}された`,
              { law, passed },
            ));
          }
        }
      }

      // Cultural evolution
      const recentEvents = events.filter(e => e.data?.villageId === village.id || e.actorIds.some(id => village.population.includes(id)));
      const members = village.population
        .map(id => world.agents.get(id))
        .filter((a): a is AgentState => !!a && a.identity.status !== 'dead');
      const cultureEvents = await evolveCulture(village, members, recentEvents, world.tick);
      for (const ce of cultureEvents) {
        ce.gameId = world.gameId;
        events.push(ce);
      }
    }
  }

  // 10. Diplomacy between villages (every 50 ticks)
  if (world.tick % 50 === 0 && world.villages.size >= 2) {
    const dipEvents = await processDiplomacy(world.diplomacy, world.villages, world.agents, world.gameId, world.tick);
    events.push(...dipEvents);
  }

  // 11. Relationship decay
  if (world.tick % 50 === 0) {
    for (const rels of world.relationships.values()) {
      decaySentiment(rels, world.tick);
    }
  }

  // 12. Expire old intentions
  world.intentions = world.intentions.filter(i => i.expiresAtTick > world.tick);

  return { tick: world.tick, actions, events, changedChunks };
}

// --- Need updates ---

function updateAgentNeeds(world: WorldState): void {
  for (const agent of world.livingAgents) {
    agent.needs.hunger = Math.max(0, agent.needs.hunger - HUNGER_DECAY_PER_TICK);
    agent.needs.energy = Math.max(0, agent.needs.energy - ENERGY_DECAY_PER_TICK);
    agent.needs.social = Math.max(0, agent.needs.social - SOCIAL_DECAY_PER_TICK);
  }
}

// --- Action execution ---

interface ActionResult {
  event?: GameEvent;
  changedChunk?: string;
}

function executeAction(world: WorldState, agent: AgentState, action: AgentAction): ActionResult {
  const chunkKey = (p: Position) => `${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`;

  switch (action.type) {
    case 'move': {
      const newX = agent.position.x + action.dx;
      const newY = agent.position.y + action.dy;
      if (newX >= 0 && newX < world.map.size && newY >= 0 && newY < world.map.size) {
        const tile = world.map.tiles[newY][newX];
        const cost = TERRAIN_MOVEMENT_COST[tile.terrain] ?? Infinity;
        if (cost < Infinity) {
          agent.position = { x: newX, y: newY };
          return { changedChunk: chunkKey(agent.position) };
        }
      }
      return {};
    }

    case 'gather': {
      const tile = world.map.tiles[agent.position.y][agent.position.x];
      const resource = action.resource as ResourceType;
      const skillLevel = agent.identity.skills.farming ?? 1;
      const amount = gatherFromTile(tile, resource, skillLevel);
      if (amount > 0) {
        addToInventory(agent, resource, amount);
        agent.currentAction = `${resource}を${amount}個採集`;
      }
      return { changedChunk: chunkKey(agent.position) };
    }

    case 'eat': {
      eatFood(agent);
      agent.currentAction = '食事中';
      return {};
    }

    case 'sleep': {
      agent.needs.energy = Math.min(100, agent.needs.energy + SLEEP_RESTORE);
      agent.currentAction = '睡眠中';
      return {};
    }

    case 'farm': {
      const tile = world.map.tiles[agent.position.y][agent.position.x];
      const amount = farmTile(tile, agent.identity.skills.farming ?? 1);
      if (amount > 0) {
        addToInventory(agent, 'food', amount);
        agent.currentAction = `農作業中（食料+${amount}）`;
      }
      return { changedChunk: chunkKey(agent.position) };
    }

    case 'build': {
      const type = action.structure as StructureType;
      const check = canBuild(world.map, agent.position, type, agent.inventory);
      if (check.ok) {
        // Deduct costs
        const costs = getBuildCost(type);
        for (const [resource, amount] of Object.entries(costs)) {
          agent.inventory[resource as ResourceType] = (agent.inventory[resource as ResourceType] ?? 0) - (amount ?? 0);
        }

        const structure = createStructure(type, agent.position, agent.villageId ?? '', agent.identity.id, world.tick);
        world.structures.set(structure.id, structure);
        world.map.tiles[agent.position.y][agent.position.x].structureId = structure.id;
        agent.currentAction = `${type}を建設中`;

        return {
          event: createEvent(world.gameId, 'construction', world.tick,
            [agent.identity.id],
            `${agent.identity.name}が${type}を建設した`,
            { structureId: structure.id, type },
          ),
          changedChunk: chunkKey(agent.position),
        };
      }
      return {};
    }

    case 'socialize': {
      agent.needs.social = Math.min(100, agent.needs.social + SOCIAL_RESTORE);
      agent.currentAction = '交流中';
      return {};
    }

    case 'explore': {
      // Random walk
      const dx = Math.round(Math.random() * 2 - 1);
      const dy = Math.round(Math.random() * 2 - 1);
      const newX = Math.max(0, Math.min(world.map.size - 1, agent.position.x + dx));
      const newY = Math.max(0, Math.min(world.map.size - 1, agent.position.y + dy));
      const tile = world.map.tiles[newY][newX];
      if ((TERRAIN_MOVEMENT_COST[tile.terrain] ?? Infinity) < Infinity) {
        agent.position = { x: newX, y: newY };
      }
      agent.currentAction = '探索中';
      return { changedChunk: chunkKey(agent.position) };
    }

    case 'rest':
    default: {
      agent.needs.energy = Math.min(100, agent.needs.energy + 5);
      agent.currentAction = '休憩中';
      return {};
    }
  }
}

// --- Helpers ---

function buildDecisionContext(world: WorldState, agent: AgentState): DecisionContext {
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

  return {
    agent,
    memories: new MemoryManager(agent.identity.id, world.gameId),
    relationships,
    agentNames,
    village,
    nearbyAgents,
    intentions: relevantIntentions,
    tick: world.tick,
  };
}

function getRelationship(world: WorldState, agentId: string, targetId: string): Relationship | null {
  const rels = world.relationships.get(agentId) ?? [];
  return rels.find(r => r.targetId === targetId) ?? null;
}

async function checkReproduction(world: WorldState): Promise<GameEvent[]> {
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

      try {
        const child = await createChildAgent(a1, a2, namingStyle);
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

        events.push(createEvent(world.gameId, 'birth', world.tick,
          [a1.identity.id, a2.identity.id, child.identity.id],
          `${a1.identity.name}と${a2.identity.name}に子供「${child.identity.name}」が生まれた（第${child.identity.generation}世代）`,
          { childId: child.identity.id, generation: child.identity.generation },
        ));
      } catch (err) {
        console.error('Reproduction error:', err);
      }
    }
  }

  return events;
}
