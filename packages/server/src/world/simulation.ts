import type {
  AgentState, DeployedBlueprintMeta, GameEvent, GameEventType, Position, Relationship,
  Village, PlayerIntention, ResourceType, StructureType, InformationPiece, Memory,
} from '@murasato/shared';
import {
  HUNGER_DECAY_PER_TICK, ENERGY_DECAY_PER_TICK, SOCIAL_DECAY_PER_TICK,
  SLEEP_RESTORE, SOCIAL_RESTORE, VISION_RANGE, TICKS_PER_DAY,
  REPRODUCTION_MIN_SENTIMENT, REPRODUCTION_MIN_FOOD_SURPLUS,
  TERRAIN_MOVEMENT_COST, MAX_AGENTS, AI_TICK_INTERVAL,
  TERRITORY_EXPANSION_CULTURE_THRESHOLD, TERRITORY_EXPANSION_CHECK_INTERVAL,
  TERRITORY_CONTEST_TENSION_GAIN, OUTPOST_CLAIM_RADIUS, MAX_TERRITORY_RADIUS,
  ARMY_ATTACK_TRIGGER_RANGE, ARMY_PATH_RECOMPUTE_INTERVAL,
  TRADE_DISTANCE_COST_FACTOR, TRADE_ROAD_BONUS, TRADE_ROAD_MAX_BONUS,
  DISASTER_CHECK_INTERVAL, DISASTER_BASE_PROBABILITY,
  MIGRATION_DISSATISFACTION_THRESHOLD,
} from '@murasato/shared';
import {
  createDefaultVillageState4X,
  createAutonomousWorldState,
  type VillageState4X,
  type AutonomousWorldState,
  type Covenant,
  type Institution,
  type Disaster,
  type DisasterType,
} from '@murasato/shared';
import { TERRITORY_RADIUS, RELEVANCE_DECAY_RATE } from '@murasato/shared';
import type { WorldMap } from './map.ts';
import { findPath, getNextStep } from './pathfinding.ts';
import { gatherFromTile, addToInventory, eatFood, farmTile, regenerateResources, findNearbyResource, mapTo4XResource } from './resources.ts';
import { canBuild, createStructure, getBuildCost } from './building.ts';
import { decide, generateReflection, type DecisionContext, type AgentAction } from '../agent/decisionEngine.ts';
import type { ReflectionContext } from '../agent/prompts.ts';
import { MemoryManager } from '../agent/memory.ts';
import { ageAgent, createChildAgent, growSkill, educateChild, getSkillForAction, checkGrowthMilestones } from '../agent/lifecycle.ts';
import { checkVillageForming, foundVillage, runElection, proposeLaw, voteLaw, leaveVillage, markPlayerOwned } from '../social/governance.ts';
import { findConversationOpportunities, generateConversation as genConversation, applyConversationResults, createConversationEvent } from '../social/conversation.ts';
import { getOrCreateRelationship, setParentChildRoles, setSpouseRoles, decaySentiment } from '../social/relationships.ts';
import { checkCulturalExchange, applyCulturalExchange, evolveCulture } from '../social/culture.ts';
import { DiplomacyManager, processDiplomacy, areAtWar } from '../social/diplomacy.ts';
import { computeDissatisfaction, findMigrationTarget, checkHomelessRecruitment } from '../social/migration.ts';
import { canReligionEmerge, generateReligion, checkReligionSpread, spreadReligion, processOrthodoxy, getReligionTensionModifier } from '../social/religion.ts';
import { AgentKnowledgeStore, parseConversationInformation, transferInformation } from '../social/information.ts';
import { resolveCombat, conquerVillage } from '../engine/combatEngine.ts';
import { LLMBudgetExceeded } from '../agent/llmClient.ts';
import { processVillageTick } from '../engine/ruleEngine.ts';
import { processCommand, type World4XRef } from '../engine/commandProcessor.ts';
import { checkVictory } from '../engine/victoryChecker.ts';
import {
  generateAICommands,
  generateCovenantCommand,
  generateInventionCommand,
  generateInstitutionCommand,
  type LeaderContext,
} from '../engine/aiStrategy.ts';
import { decayCovenantRelevance } from '../engine/covenantEngine.ts';
import { InventionRegistry, decayInventionRelevance } from '../engine/inventionRegistry.ts';
import { processInstitutionLifecycle, foundInstitution, joinInstitution } from '../engine/institutionEngine.ts';
import type { DojoBridge } from '../services/dojo/dojoBridge.ts';

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
  blueprints: Map<string, DeployedBlueprintMeta>;
  tick: number;

  // 4X Strategy layer
  villageStates4X: Map<string, VillageState4X>;

  // Autonomous World layers (Layer 1-3)
  autonomousWorld: AutonomousWorldState;

  // F4: Active natural disasters
  activeDisasters: Disaster[];

  // F9: Information propagation
  informationPool: InformationPiece[];
  agentKnowledge: AgentKnowledgeStore;

  // F10c: Elder wisdom pool
  villageWisdom: Map<string, Memory[]>;

  // Dojo on-chain bridge (optional)
  dojoBridge?: DojoBridge;

  get livingAgents(): AgentState[];
}

export function createWorldState(gameId: string, map: WorldMap, dojoBridge?: DojoBridge): WorldState {
  const state: WorldState = {
    gameId,
    map,
    agents: new Map(),
    villages: new Map(),
    structures: new Map(),
    relationships: new Map(),
    intentions: [],
    diplomacy: new DiplomacyManager(),
    blueprints: new Map(),
    tick: 0,
    villageStates4X: new Map(),
    autonomousWorld: createAutonomousWorldState(),
    activeDisasters: [],
    informationPool: [],
    agentKnowledge: new AgentKnowledgeStore(),
    villageWisdom: new Map(),
    dojoBridge,

    get livingAgents() {
      return [...this.agents.values()].filter(a => a.identity.status !== 'dead');
    },
  };
  return state;
}

/** 4Xワールドへの参照を構築（commandProcessor用） */
export function buildWorld4XRef(world: WorldState): World4XRef {
  return {
    villageStates: world.villageStates4X,
    getTerrain: (pos: Position) => {
      const tile = world.map.tiles[pos.y]?.[pos.x];
      return tile?.terrain ?? 'plains';
    },
    getDiplomacy: (v1: string, v2: string) => world.diplomacy.getRelation(v1, v2),
    setDiplomacy: (v1: string, v2: string, status: string) => {
      world.diplomacy.setStatus(v1, v2, status as any);
    },
    tick: world.tick,
    generateId: () => crypto.randomUUID(),
    getVillageCenter: (villageId: string) => {
      const vs = world.villageStates4X.get(villageId);
      return vs?.centerPosition ?? null;
    },
  };
}

// --- Territory generation (diamond shape) ---

function generateTerritoryDiamond(center: Position, radius: number): Position[] {
  const territory: Position[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (Math.abs(dx) + Math.abs(dy) <= radius) {
        territory.push({ x: center.x + dx, y: center.y + dy });
      }
    }
  }
  return territory;
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
  if (world.tick % 20 === 0) console.log(`[tick ${world.tick}] conversation opportunities: ${opportunities.length}, living: ${living.length}`);
  for (const opp of opportunities.slice(0, 3)) { // Cap at 3 conversations per tick
    try {
      const rel12 = getRelationship(world, opp.agent1.identity.id, opp.agent2.identity.id);
      const rel21 = getRelationship(world, opp.agent2.identity.id, opp.agent1.identity.id);
      const sharedVillage = opp.agent1.villageId != null && opp.agent1.villageId === opp.agent2.villageId;

      // Build soul contexts for blueprint agents
      const bp1 = opp.agent1.identity.blueprintId ? world.blueprints.get(opp.agent1.identity.blueprintId) : undefined;
      const bp2 = opp.agent2.identity.blueprintId ? world.blueprints.get(opp.agent2.identity.blueprintId) : undefined;
      const soulContexts = (bp1 || bp2) ? {
        a1: bp1 ? { soul: bp1.soul, rules: bp1.rules.length > 0 ? bp1.rules : undefined } : undefined,
        a2: bp2 ? { soul: bp2.soul, rules: bp2.rules.length > 0 ? bp2.rules : undefined } : undefined,
      } : undefined;

      console.log(`[tick ${world.tick}] 会話開始: ${opp.agent1.identity.name} × ${opp.agent2.identity.name}`);
      const result = await genConversation(opp.agent1, opp.agent2, rel12, rel21, opp.situation, sharedVillage, soulContexts);
      console.log(`[tick ${world.tick}] 会話完了: ${result.dialogue.length}ターン`);
      applyConversationResults(result, opp.agent1, opp.agent2, world.relationships, world.tick, world.gameId);
      events.push(createConversationEvent(world.gameId, opp.agent1, opp.agent2, result, world.tick));

      // F9: Information exchange during conversation
      if (result.informationExchange && result.informationExchange.length > 0) {
        const villageId = opp.agent1.villageId ?? opp.agent2.villageId ?? undefined;
        const infoPieces = parseConversationInformation(
          result.informationExchange, opp.agent1.identity.id, opp.agent2.identity.id,
          world.tick, villageId,
        );
        for (const piece of infoPieces) {
          world.informationPool.push(piece);
          world.agentKnowledge.addKnowledge(opp.agent1.identity.id, piece);
          world.agentKnowledge.addKnowledge(opp.agent2.identity.id, piece);
        }
      }

      // F9: Transfer existing knowledge between conversation partners
      const a1Knowledge = world.agentKnowledge.getKnowledge(opp.agent1.identity.id);
      const a2Knowledge = world.agentKnowledge.getKnowledge(opp.agent2.identity.id);
      // Each agent shares up to 2 random pieces
      for (const info of a1Knowledge.sort(() => Math.random() - 0.5).slice(0, 2)) {
        if (!info.knownByAgentIds.includes(opp.agent2.identity.id)) {
          const transferred = transferInformation(info, opp.agent1.identity.id, opp.agent2.identity.id);
          world.agentKnowledge.addKnowledge(opp.agent2.identity.id, transferred);
        }
      }
      for (const info of a2Knowledge.sort(() => Math.random() - 0.5).slice(0, 2)) {
        if (!info.knownByAgentIds.includes(opp.agent1.identity.id)) {
          const transferred = transferInformation(info, opp.agent2.identity.id, opp.agent1.identity.id);
          world.agentKnowledge.addKnowledge(opp.agent1.identity.id, transferred);
        }
      }

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

        // F8: Religion spread during cultural exchange
        if (v1 && v2) {
          if (checkReligionSpread(v1, v2)) {
            spreadReligion(v1, v2);
            events.push(createEvent(world.gameId, 'discovery', world.tick,
              [opp.agent1.identity.id],
              `${v1.name}の宗教「${v1.culture.religion?.name}」が${v2.name}に伝播した`,
              { type: 'religion_spread', fromVillage: v1.id, toVillage: v2.id },
            ));
          } else if (checkReligionSpread(v2, v1)) {
            spreadReligion(v2, v1);
            events.push(createEvent(world.gameId, 'discovery', world.tick,
              [opp.agent2.identity.id],
              `${v2.name}の宗教「${v2.culture.religion?.name}」が${v1.name}に伝播した`,
              { type: 'religion_spread', fromVillage: v2.id, toVillage: v1.id },
            ));
          }
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
        const villageName = agent.villageId ? world.villages.get(agent.villageId)?.name : undefined;
        const role = agent.currentAction ?? undefined;
        events.push(createEvent(world.gameId, 'death', world.tick,
          [agent.identity.id],
          `${agent.identity.name}が生涯を終えた（享年${agent.identity.age}${villageName ? `、${villageName}の住人` : ''}）`,
          { cause: '老衰', age: agent.identity.age, role, villageName },
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
        // F10c: Extract elder wisdom to village pool
        extractElderWisdom(agent, world);
      }
    }

    // Starvation death
    if (agent.needs.hunger <= 0 && agent.identity.status !== 'dead') {
      agent.identity.status = 'dead';
      const villageName = agent.villageId ? world.villages.get(agent.villageId)?.name : undefined;
      events.push(createEvent(world.gameId, 'death', world.tick,
        [agent.identity.id],
        `${agent.identity.name}が飢えで倒れた（享年${agent.identity.age}${villageName ? `、${villageName}の住人` : ''}）`,
        { cause: '飢餓', age: agent.identity.age, villageName },
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

      // Auto-create 4X state for newly founded village
      if (!world.villageStates4X.has(village.id)) {
        const center = village.territory[0] ?? { x: 0, y: 0 };
        const territory = generateTerritoryDiamond(center, TERRITORY_RADIUS);

        // Auto-claim: if the leader is a blueprint agent, set player as owner
        const leaderId = village.governance.leaderId;
        let ownerId: string | null = null;
        if (leaderId) {
          const leaderBlueprint = world.blueprints.values();
          for (const bp of leaderBlueprint) {
            if (bp.agentId === leaderId) {
              ownerId = bp.blueprintId; // Use blueprintId as playerId
              break;
            }
          }
        }

        const vs = createDefaultVillageState4X(village.id, ownerId, territory, world.tick);
        vs.population = village.population.length;
        world.villageStates4X.set(village.id, vs);

        if (ownerId) {
          // Mark as player-owned so elections are skipped
          markPlayerOwned(village.id);
        }

        // Dojo: 村をオンチェーンにも作成
        if (world.dojoBridge?.isEnabled()) {
          world.dojoBridge.createVillage(village.id).catch((err) =>
            console.warn('[DojoBridge] createVillage background error:', err),
          );
        }
      }
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

      // F10e: Governance drift — if >60% of adults share different governance philosophy
      evaluateGovernanceDrift(village, members);

      // F8: Religion emergence check
      if (canReligionEmerge(village, members)) {
        const religion = await generateReligion(village);
        village.culture.religion = religion;
        events.push(createEvent(world.gameId, 'discovery', world.tick,
          [], `${village.name}で宗教「${religion.name}」が誕生した`,
          { type: 'religion_emergence', villageName: village.name, religionName: religion.name },
        ));
      }

      // F8: Orthodoxy drift
      processOrthodoxy(village, members);

      // F10d: Agent reflection (every 100 ticks)
      for (const member of members) {
        if (shouldReflect(member, world.tick)) {
          try {
            const memMgr = new MemoryManager(member.identity.id, world.gameId);
            const topMemories = memMgr.getTopMemories(world.tick, 10);

            // Look up blueprint context for reflection
            let memberSoul: string | undefined;
            let memberRules: string[] | undefined;
            let memberBackstory: string | undefined;
            if (member.identity.blueprintId) {
              const bp = world.blueprints.get(member.identity.blueprintId);
              if (bp) {
                memberSoul = bp.soul;
                memberRules = bp.rules.length > 0 ? bp.rules : undefined;
                memberBackstory = bp.backstory ?? undefined;
              }
            }

            const reflectionCtx: ReflectionContext = {
              agent: member,
              recentMemories: topMemories,
              soulText: memberSoul,
              behaviorRules: memberRules,
              backstory: memberBackstory,
            };
            const reflectionResult = await generateReflection(reflectionCtx);

            // Apply belief change if present
            if (reflectionResult.beliefChange) {
              if (reflectionResult.beliefChange.governance) {
                member.identity.philosophy.governance = reflectionResult.beliefChange.governance;
              }
              if (reflectionResult.beliefChange.economics) {
                member.identity.philosophy.economics = reflectionResult.beliefChange.economics;
              }
              if (reflectionResult.beliefChange.values) {
                member.identity.philosophy.values = reflectionResult.beliefChange.values;
              }
              if (reflectionResult.beliefChange.worldview) {
                member.identity.philosophy.worldview = reflectionResult.beliefChange.worldview;
              }
            }

            // Store reflection as memory
            memMgr.addMemory(reflectionResult.reflection, 0.7, world.tick, 'longterm', ['reflection']);
            if (reflectionResult.newInsight) {
              memMgr.addMemory(reflectionResult.newInsight, 0.8, world.tick, 'longterm', ['insight']);
            }
          } catch {
            // Reflection failed (budget exceeded, etc.) — skip silently
          }
        }
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

  // 13. F7: Homeless agent recruitment
  if (world.tick % 100 === 0) {
    const recruitResults = checkHomelessRecruitment(world.livingAgents, world.villages, world.villageStates4X);
    for (const { agentId, villageId } of recruitResults) {
      const agent = world.agents.get(agentId);
      const village = world.villages.get(villageId);
      if (!agent || !village) continue;
      agent.villageId = villageId;
      if (!village.population.includes(agentId)) {
        village.population.push(agentId);
      }
      events.push(createEvent(world.gameId, 'discovery', world.tick,
        [agentId],
        `${agent.identity.name}が${village.name}に勧誘された`,
        { type: 'recruitment', villageId },
      ));
    }
  }

  // 14. F9: Prune old information (every 200 ticks)
  if (world.tick % 200 === 0) {
    world.agentKnowledge.pruneAll(world.tick, 200);
    world.informationPool = world.informationPool.filter(info => world.tick - info.originTick < 200);
  }

  // === Phase B: 4X Strategy Engine ===
  const strategyEvents = await run4XTick(world);
  events.push(...strategyEvents);

  return { tick: world.tick, actions, events, changedChunks };
}

// === F1: Army Movement ===

function processArmyMovement(world: WorldState, events: GameEvent[]): void {
  for (const [villageId, vs] of world.villageStates4X) {
    for (const army of vs.armies) {
      if (army.status !== 'moving' || !army.targetPosition) continue;

      // Compute/cache path
      if (!army.cachedPath || army.cachedPath.length === 0 || world.tick % ARMY_PATH_RECOMPUTE_INTERVAL === 0) {
        army.cachedPath = findPath(world.map.tiles, army.position, army.targetPosition, 500) ?? undefined;
      }

      if (!army.cachedPath || army.cachedPath.length <= 1) {
        army.status = 'idle';
        army.cachedPath = undefined;
        continue;
      }

      // Move: advance by minimum unit speed (at least 1 step per tick)
      const minSpeed = Math.max(1, Math.min(...army.units.map(u => {
        const def = (globalThis as any).__UNIT_DEFS__?.[u.defId];
        return def?.speed ?? 1;
      })));
      const stepsThisTick = Math.min(minSpeed, army.cachedPath.length - 1);

      for (let step = 0; step < stepsThisTick; step++) {
        army.cachedPath.shift(); // remove current position
        if (army.cachedPath.length > 0) {
          army.position = { ...army.cachedPath[0] };
        }
      }

      // Check arrival
      const distToTarget = Math.abs(army.position.x - army.targetPosition.x) +
                           Math.abs(army.position.y - army.targetPosition.y);

      if (distToTarget <= ARMY_ATTACK_TRIGGER_RANGE) {
        // Check if arrived at enemy village
        for (const [enemyVid, enemyVs] of world.villageStates4X) {
          if (enemyVid === villageId) continue;
          const enemyDist = Math.abs(army.position.x - enemyVs.centerPosition.x) +
                           Math.abs(army.position.y - enemyVs.centerPosition.y);
          if (enemyDist <= ARMY_ATTACK_TRIGGER_RANGE && areAtWar(world.diplomacy, villageId, enemyVid)) {
            // Auto-trigger combat
            const terrain = (world.map.tiles[army.position.y]?.[army.position.x]?.terrain ?? 'plains') as any;
            const result = resolveCombat(vs, enemyVs, army.units, [...enemyVs.garrison], terrain);
            result.position = army.position;

            if (result.attackerWon && enemyVs.garrison.filter(u => u.count > 0).length === 0) {
              conquerVillage(vs, enemyVs);
            }
            enemyVs.garrison = enemyVs.garrison.filter(u => u.count > 0);

            events.push(createEvent(world.gameId, 'war', world.tick, [],
              `軍隊が${enemyVid}に到着し戦闘が発生`, { combatResult: result }));

            army.status = 'idle';
            army.cachedPath = undefined;
            break;
          }
        }

        if (army.status === 'moving') {
          army.status = 'idle';
          army.cachedPath = undefined;
        }
      }
    }

    // Clean up armies with no units
    vs.armies = vs.armies.filter(a => a.units.some(u => u.count > 0));
  }
}

// === F2: Territory Expansion ===

function processTerritoryExpansion(world: WorldState, events: GameEvent[]): void {
  if (world.tick % TERRITORY_EXPANSION_CHECK_INTERVAL !== 0) return;

  for (const [villageId, vs] of world.villageStates4X) {
    if (vs.culturePoints < TERRITORY_EXPANSION_CULTURE_THRESHOLD) continue;

    // Find best adjacent tile not in territory
    const territorySet = new Set(vs.territory.map(p => `${p.x},${p.y}`));
    let bestTile: Position | null = null;
    let bestYield = -1;

    for (const pos of vs.territory) {
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = pos.x + dx;
        const ny = pos.y + dy;
        if (nx < 0 || nx >= world.map.size || ny < 0 || ny >= world.map.size) continue;
        if (territorySet.has(`${nx},${ny}`)) continue;

        const tile = world.map.tiles[ny][nx];
        if (tile.terrain === 'water') continue;

        // Check within MAX_TERRITORY_RADIUS
        const distToCenter = Math.abs(nx - vs.centerPosition.x) + Math.abs(ny - vs.centerPosition.y);
        if (distToCenter > MAX_TERRITORY_RADIUS) continue;

        // Compute yield score
        const tileYield = Object.values(tile.resources).reduce((sum, v) => sum + (v ?? 0), 0) + tile.fertility * 5;
        if (tileYield > bestYield) {
          bestYield = tileYield;
          bestTile = { x: nx, y: ny };
        }
      }
    }

    if (bestTile) {
      vs.territory.push(bestTile);
      vs.culturePoints -= TERRITORY_EXPANSION_CULTURE_THRESHOLD;

      // Check contested territory
      for (const [otherVid, otherVs] of world.villageStates4X) {
        if (otherVid === villageId) continue;
        if (otherVs.territory.some(p => p.x === bestTile!.x && p.y === bestTile!.y)) {
          world.diplomacy.adjustTension(villageId, otherVid, TERRITORY_CONTEST_TENSION_GAIN);
        }
      }

      events.push(createEvent(world.gameId, 'discovery', world.tick, [],
        `村${villageId}が領土を拡張 (${bestTile.x},${bestTile.y})`,
        { villageId, position: bestTile }));
    }

    // Outpost claim: check newly completed outposts
    for (const building of vs.buildings) {
      if (building.defId !== 'outpost') continue;
      // Only claim once (check if area already claimed)
      const pos = building.position;
      const alreadyClaimed = vs.territory.some(p =>
        Math.abs(p.x - pos.x) <= 1 && Math.abs(p.y - pos.y) <= 1);
      if (alreadyClaimed) continue;

      // Claim diamond area around outpost
      for (let dx = -OUTPOST_CLAIM_RADIUS; dx <= OUTPOST_CLAIM_RADIUS; dx++) {
        for (let dy = -OUTPOST_CLAIM_RADIUS; dy <= OUTPOST_CLAIM_RADIUS; dy++) {
          if (Math.abs(dx) + Math.abs(dy) > OUTPOST_CLAIM_RADIUS) continue;
          const nx = pos.x + dx;
          const ny = pos.y + dy;
          if (nx < 0 || nx >= world.map.size || ny < 0 || ny >= world.map.size) continue;
          if (world.map.tiles[ny][nx].terrain === 'water') continue;
          if (!territorySet.has(`${nx},${ny}`)) {
            vs.territory.push({ x: nx, y: ny });
            territorySet.add(`${nx},${ny}`);
          }
        }
      }
    }
  }
}

// === F4: Natural Disasters ===

function processDisasters(world: WorldState, events: GameEvent[]): void {
  // Tick down active disasters
  for (let i = world.activeDisasters.length - 1; i >= 0; i--) {
    const disaster = world.activeDisasters[i];
    disaster.remainingTicks--;

    if (disaster.remainingTicks <= 0) {
      world.activeDisasters.splice(i, 1);
      events.push(createEvent(world.gameId, 'disaster', world.tick, [],
        `災害「${disaster.type}」が終息した`, { disasterType: disaster.type }));
      continue;
    }

    // Apply per-tick effects to affected villages
    for (const vid of disaster.affectedVillageIds) {
      const vs = world.villageStates4X.get(vid);
      if (!vs) continue;

      switch (disaster.type) {
        case 'drought': {
          // Reduce fertility of tiles in radius
          for (const pos of vs.territory) {
            const dist = Math.abs(pos.x - disaster.centerPosition.x) + Math.abs(pos.y - disaster.centerPosition.y);
            if (dist <= disaster.radius) {
              const tile = world.map.tiles[pos.y]?.[pos.x];
              if (tile) tile.fertility = Math.max(0, tile.fertility - 0.005 * disaster.severity);
            }
          }
          break;
        }
        case 'plague': {
          // Population loss per tick
          const loss = Math.max(0, Math.floor(vs.population * 0.01 * disaster.severity));
          if (loss > 0) vs.population = Math.max(1, vs.population - loss);
          break;
        }
        case 'locust': {
          // Food destruction per tick
          const foodLoss = Math.floor(5 * disaster.severity);
          vs.resources.food = Math.max(0, vs.resources.food - foodLoss);
          break;
        }
        // flood and earthquake are one-shot (handled at creation)
      }
    }
  }

  // Check for new disasters
  if (world.tick % DISASTER_CHECK_INTERVAL !== 0) return;
  if (Math.random() > DISASTER_BASE_PROBABILITY) return;

  // Pick a random village as center
  const villageIds = [...world.villageStates4X.keys()];
  if (villageIds.length === 0) return;
  const targetVid = villageIds[Math.floor(Math.random() * villageIds.length)];
  const targetVs = world.villageStates4X.get(targetVid);
  if (!targetVs) return;

  const types: DisasterType[] = ['drought', 'flood', 'plague', 'locust', 'earthquake'];
  const type = types[Math.floor(Math.random() * types.length)];
  const severity = 0.5 + Math.random() * 0.5;
  const radius = 5 + Math.floor(Math.random() * 5);

  // Find affected villages
  const affectedVillageIds: string[] = [];
  for (const [vid, vs] of world.villageStates4X) {
    const dist = Math.abs(vs.centerPosition.x - targetVs.centerPosition.x) +
                 Math.abs(vs.centerPosition.y - targetVs.centerPosition.y);
    if (dist <= radius) affectedVillageIds.push(vid);
  }

  const disaster: Disaster = {
    id: `dis_${crypto.randomUUID()}`,
    type,
    centerPosition: { ...targetVs.centerPosition },
    radius,
    remainingTicks: type === 'flood' || type === 'earthquake' ? 1 : 50 + Math.floor(Math.random() * 50),
    severity,
    affectedVillageIds,
  };

  // One-shot effects for flood/earthquake
  if (type === 'flood') {
    for (const vid of affectedVillageIds) {
      const vs = world.villageStates4X.get(vid);
      if (!vs) continue;
      // Destroy buildings near water/swamp tiles
      vs.buildings = vs.buildings.filter(b => {
        const tile = world.map.tiles[b.position.y]?.[b.position.x];
        if (tile && (tile.terrain === 'swamp') && Math.random() < severity * 0.3) {
          return false; // destroyed
        }
        return true;
      });
    }
  } else if (type === 'earthquake') {
    for (const vid of affectedVillageIds) {
      const vs = world.villageStates4X.get(vid);
      if (!vs) continue;
      // Damage buildings near mountain tiles
      for (const b of vs.buildings) {
        const tile = world.map.tiles[b.position.y]?.[b.position.x];
        if (tile && tile.terrain === 'mountain' && Math.random() < severity * 0.4) {
          b.health = Math.max(0, b.health - Math.floor(40 * severity));
        }
      }
      vs.buildings = vs.buildings.filter(b => b.health > 0);
    }
  }

  world.activeDisasters.push(disaster);
  events.push(createEvent(world.gameId, 'disaster', world.tick, [],
    `災害「${type}」が発生！（${targetVs.centerPosition.x},${targetVs.centerPosition.y}付近）`,
    { disasterType: type, severity, affectedVillages: affectedVillageIds }));
}

// === F5: Derive diplomatic status for a village ===

function deriveVillageDiplomaticStatus(world: WorldState, villageId: string): string | undefined {
  const allRelations = world.diplomacy.getAllRelations();
  for (const rel of allRelations) {
    if ((rel.villageId1 === villageId || rel.villageId2 === villageId) && rel.status === 'war') {
      return 'war';
    }
  }
  return undefined;
}

// === F10a: Village-influenced child philosophy ===
// === F10b: Generational rebellion ===

function computePhilosophyVariance(members: AgentState[]): number {
  if (members.length < 2) return 0;
  const govCounts: Record<string, number> = {};
  for (const m of members) {
    govCounts[m.identity.philosophy.governance] = (govCounts[m.identity.philosophy.governance] ?? 0) + 1;
  }
  const maxCount = Math.max(...Object.values(govCounts));
  return 1 - maxCount / members.length;
}

// === F10c: Elder wisdom pool ===

function extractElderWisdom(agent: AgentState, world: WorldState): void {
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

function shouldReflect(agent: AgentState, tick: number): boolean {
  return agent.identity.status !== 'dead' &&
         agent.identity.status !== 'child' &&
         tick % 100 === 0;
}

// === F10e: Governance drift ===

function evaluateGovernanceDrift(village: Village, members: AgentState[]): void {
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

// --- 4X Strategy Tick ---

async function run4XTick(world: WorldState): Promise<GameEvent[]> {
  const events: GameEvent[] = [];

  // F1: Process army movement first
  processArmyMovement(world, events);

  // F2: Territory expansion
  processTerritoryExpansion(world, events);

  // F4: Natural disasters
  processDisasters(world, events);

  // Process each village's 4X state
  for (const [villageId, vs] of world.villageStates4X) {
    // Sync population from social layer
    const village = world.villages.get(villageId);
    if (village) {
      const livingPop = village.population.filter(id => {
        const a = world.agents.get(id);
        return a && a.identity.status !== 'dead';
      }).length;
      vs.population = Math.max(vs.population, livingPop);
    }

    // Gather territory tiles
    const territoryTiles = vs.territory
      .map(pos => world.map.tiles[pos.y]?.[pos.x])
      .filter((t): t is NonNullable<typeof t> => !!t);

    // F5: Derive diplomatic status for this village
    const dipStatus = deriveVillageDiplomaticStatus(world, villageId);

    // Run economic tick (with Autonomous World state for Layer 1-3 effects)
    // Dojo: オンチェーン実行 → フォールバック
    const tickResultRaw = world.dojoBridge?.isEnabled()
      ? await world.dojoBridge.executeVillageTick(
          villageId, vs, territoryTiles, world.autonomousWorld, world.tick,
        )
      : processVillageTick(vs, territoryTiles, world.autonomousWorld, world.tick, dipStatus);

    const tickResult = tickResultRaw;

    // Merge on-chain events into the event stream
    if ('onChainEvents' in tickResult) {
      const onChainEvts = (tickResult as any).onChainEvents as import('@murasato/shared').GameEvent[];
      for (const evt of onChainEvts) {
        // Inject correct gameId (the bridge doesn't know it)
        evt.gameId = world.gameId;
        events.push(evt);
      }
    }

    // Emit events for completed items
    for (const completedId of tickResult.queueCompleted) {
      events.push(createEvent(world.gameId, 'construction', world.tick,
        [], `村${villageId}でキューアイテム完了: ${completedId}`, { villageId, itemId: completedId }));
    }

    if (tickResult.starvation) {
      events.push(createEvent(world.gameId, 'death', world.tick,
        [], `村${villageId}で飢餓が発生`, { villageId, populationLost: -tickResult.populationDelta }));
    }
  }

  // AI villages generate commands (LLM-driven via village leader)
  if (world.tick % AI_TICK_INTERVAL === 0) {
    const worldRef = buildWorld4XRef(world);

    // Build village name map for neighbor display
    const allVillageNames = new Map<string, string>();
    for (const [vid, v] of world.villages) {
      allVillageNames.set(vid, v.name);
    }

    for (const [villageId, vs] of world.villageStates4X) {
      if (vs.ownerId !== null) continue; // プレイヤー所有村はスキップ

      // 村長コンテキストを構築
      const leaderCtx = buildLeaderContext(world, villageId);

      const commands = await generateAICommands(
        vs, world.villageStates4X, world.diplomacy.getAllRelations(),
        leaderCtx ?? undefined, allVillageNames,
      );

      for (const cmd of commands) {
        // Dojo: オンチェーンコマンド実行 → フォールバック
        const result = world.dojoBridge?.isEnabled()
          ? await world.dojoBridge.executeCommand(cmd, villageId, worldRef)
          : processCommand(cmd, villageId, worldRef);
        if (!result.success) continue;

        // 戦闘結果をイベント化
        if (cmd.type === 'attack' && result.data?.combatResult) {
          events.push(createEvent(world.gameId, 'war', world.tick,
            [], `AI村${villageId}が戦闘を実行`, { combatResult: result.data.combatResult }));
        }
      }

      // 村長の戦略的思考をイベントとして記録
      if (leaderCtx) {
        const leader = leaderCtx.leader;
        events.push(createEvent(world.gameId, 'diplomacy', world.tick,
          [leader.identity.id],
          `${leader.identity.name}（${leaderCtx.villageName}村長）が戦略会議を行った`,
          { villageId, commandCount: commands.length },
        ));

        // === Autonomous World: Layer 1-3 コマンド生成 ===
        // 毎回ではなく確率的に発動（LLMコスト制御）

        // Layer 1: Covenant 提案 (20% chance per AI tick)
        if (Math.random() < 0.2) {
          const covenantCmd = await generateCovenantCommand(
            vs, leaderCtx, world.autonomousWorld, world.villageStates4X,
            world.diplomacy.getAllRelations(), allVillageNames, world.tick,
          );
          if (covenantCmd && covenantCmd.type === 'propose_covenant') {
            const covenant: Covenant = {
              id: `cov_${crypto.randomUUID()}`,
              villageId: covenantCmd.villageId,
              scope: covenantCmd.scope,
              targetVillageId: covenantCmd.targetVillageId,
              name: covenantCmd.name,
              description: covenantCmd.description,
              clauses: covenantCmd.clauses,
              proposedByAgentId: leader.identity.id,
              ratifiedByAgentIds: [leader.identity.id],
              enactedAtTick: world.tick,
              expiresAtTick: null,
              repealedAtTick: null,
              relevance: 1.0,
            };
            world.autonomousWorld.covenants.set(covenant.id, covenant);
            events.push(createEvent(world.gameId, 'election', world.tick,
              [leader.identity.id],
              `${leaderCtx.villageName}で「${covenant.name}」が制定された`,
              { type: 'covenant_enacted', covenantId: covenant.id, covenantName: covenant.name },
            ));

            // Dojo: オンチェーンにも提案
            if (world.dojoBridge?.isEnabled()) {
              const scopeMap: Record<string, number> = { village: 0, bilateral: 1, global: 2 };
              world.dojoBridge.proposeCovenant(
                villageId, scopeMap[covenantCmd.scope] ?? 0,
                covenantCmd.targetVillageId ?? null,
                covenant.name, covenantCmd.clauses as any,
              ).catch((err) => console.warn('[DojoBridge] proposeCovenant bg error:', err));
            }
          }
        }

        // Layer 2: 発明 (10% chance per AI tick)
        if (Math.random() < 0.1) {
          const invention = await generateInventionCommand(
            vs, leaderCtx, world.autonomousWorld, world.tick,
          );
          if (invention) {
            events.push(createEvent(world.gameId, 'discovery', world.tick,
              [leader.identity.id],
              `${leaderCtx.villageName}で「${invention.name}」が発明された (${invention.type})`,
              { type: 'invention_registered', inventionId: invention.id, inventionName: invention.name },
            ));

            // Dojo: オンチェーンにも登録
            if (world.dojoBridge?.isEnabled()) {
              const invTypeMap: Record<string, number> = { building: 0, tech: 1, unit: 2 };
              const def = invention.definition as Record<string, any>;
              const totalCost = def.researchCost ?? def.cost ?? 0;
              const effects = (def.effects ?? []).map((e: any) => ({
                effectType: e.type ?? 0,
                value: e.value ?? 0,
              }));
              world.dojoBridge.registerInvention(
                villageId,
                invTypeMap[invention.type] ?? 0,
                invention.name,
                totalCost,
                effects,
              ).catch((err) => console.warn('[DojoBridge] registerInvention bg error:', err));
            }
          }
        }

        // Layer 3: 制度創設・加入 (10% chance per AI tick)
        if (Math.random() < 0.1) {
          const instCmd = await generateInstitutionCommand(
            vs, leaderCtx, world.autonomousWorld, world.villageStates4X,
            world.diplomacy.getAllRelations(), allVillageNames, world.tick,
          );
          if (instCmd) {
            if (instCmd.type === 'found_institution') {
              const inst: Institution = {
                id: `inst_${crypto.randomUUID()}`,
                name: instCmd.name,
                type: instCmd.institutionType,
                founderAgentId: leader.identity.id,
                description: instCmd.description,
                charter: instCmd.charter,
                memberVillageIds: [villageId],
                memberEffects: instCmd.memberEffects,
                joinRequirements: instCmd.joinRequirements,
                foundedAtTick: world.tick,
                treasury: {},
                relevance: 1.0,
              };
              const result = foundInstitution(inst, world.autonomousWorld);
              if (result.success) {
                events.push(createEvent(world.gameId, 'discovery', world.tick,
                  [leader.identity.id],
                  `${leaderCtx.villageName}が「${inst.name}」を創設した`,
                  { type: 'institution_founded', institutionId: inst.id, institutionName: inst.name },
                ));

                // Dojo: オンチェーンにも創設
                if (world.dojoBridge?.isEnabled()) {
                  const instTypeMap: Record<string, number> = {
                    guild: 0, religion: 1, alliance: 2, academy: 3, custom: 4,
                  };
                  const effectTypeMap: Record<string, number> = {
                    resource_production: 0, resource_storage: 1, housing: 2,
                    research_points: 3, culture_points: 4, tile_yield_mod: 5,
                    attack_bonus: 6, defense_bonus: 7, unit_training_speed: 8,
                    build_speed: 9, population_growth: 10, food_consumption_mod: 11,
                    trade_income: 12, vision_range: 13, fortification: 14,
                    heal_per_tick: 15, unlock_unit: 16, unlock_building: 17,
                  };
                  world.dojoBridge.foundInstitution(
                    villageId,
                    instTypeMap[inst.type] ?? 4,
                    inst.name,
                    inst.memberEffects.map((e) => ({
                      effectType: effectTypeMap[e.type] ?? 0,
                      value: e.value ?? 0,
                    })),
                  ).catch((err) => console.warn('[DojoBridge] foundInstitution bg error:', err));
                }
              }
            } else if (instCmd.type === 'join_institution') {
              const result = joinInstitution(villageId, instCmd.institutionId, vs, world.autonomousWorld);
              if (result.success) {
                const inst = world.autonomousWorld.institutions.get(instCmd.institutionId);
                events.push(createEvent(world.gameId, 'diplomacy', world.tick,
                  [leader.identity.id],
                  `${leaderCtx.villageName}が「${inst?.name ?? instCmd.institutionId}」に加入した`,
                  { type: 'institution_joined', institutionId: instCmd.institutionId },
                ));
              }
            }
          }
        }
      }
    }
  }

  // === Trade tick (F8) ===
  // Execute on-chain trade routes via DojoBridge
  if (world.dojoBridge?.isEnabled()) {
    // Collect all active trade route IDs from village states
    const activeRouteIds: number[] = [];
    for (const vs of world.villageStates4X.values()) {
      for (const route of vs.tradeRoutes) {
        // Route IDs are stored as strings, try to parse as number for on-chain
        const routeNum = parseInt(route.id, 10);
        if (!isNaN(routeNum)) {
          activeRouteIds.push(routeNum);
        }
      }
    }
    if (activeRouteIds.length > 0) {
      world.dojoBridge.executeTradeTick(activeRouteIds).catch(
        (err) => console.warn('[DojoBridge] executeTradeTick bg error:', err),
      );
    }
  }

  // === Autonomous World: ライフサイクル処理 ===

  // Layer 1: Covenant relevance 減衰
  decayCovenantRelevance(world.autonomousWorld);

  // Layer 2: 発明 relevance 減衰 + 知識伝播
  decayInventionRelevance(world.autonomousWorld);
  const inventionRegistry = new InventionRegistry(world.autonomousWorld);
  inventionRegistry.spreadKnowledge(world.villageStates4X, world.tick);

  // Layer 3: 制度ライフサイクル（メンバー不在で衰退・解散）
  const dissolved = processInstitutionLifecycle(world.autonomousWorld);

  // Dojo: オンチェーンでもdecay/lifecycle実行
  if (world.dojoBridge?.isEnabled()) {
    Promise.all([
      world.dojoBridge.decayCovenants(),
      world.dojoBridge.decayInventions(),
      world.dojoBridge.processInstitutionLifecycle(),
    ]).catch((err) => console.warn('[DojoBridge] lifecycle bg error:', err));
  }
  for (const name of dissolved) {
    events.push(createEvent(world.gameId, 'discovery', world.tick,
      [], `組織「${name}」が解散した`,
      { type: 'institution_dissolved', institutionName: name },
    ));
  }

  // Victory check
  const victoryResult = checkVictory({
    villageStates: world.villageStates4X,
    diplomacy: world.diplomacy.getAllRelations(),
    tick: world.tick,
  });

  if (victoryResult) {
    events.push(createEvent(world.gameId, 'discovery', world.tick,
      [], `勝利条件達成! ${victoryResult.victoryType} by ${victoryResult.winnerId}`,
      { victory: victoryResult }));

    // Dojo: オンチェーンでも勝利チェック
    if (world.dojoBridge?.isEnabled()) {
      world.dojoBridge.checkVictory(victoryResult.villageId).catch(
        (err) => console.warn('[DojoBridge] checkVictory bg error:', err),
      );
    }
  }

  return events;
}

// --- 村長コンテキスト構築 ---

function buildLeaderContext(world: WorldState, villageId: string): LeaderContext | null {
  const village = world.villages.get(villageId);
  if (!village) return null;

  const leaderId = village.governance.leaderId;
  if (!leaderId) return null;

  const leader = world.agents.get(leaderId);
  if (!leader || leader.identity.status === 'dead') return null;

  // 記憶を取得
  const memoryMgr = new MemoryManager(leaderId, world.gameId);
  const memories = memoryMgr.getTopMemories(world.tick, 10);

  // 人間関係を取得
  const relationships = world.relationships.get(leaderId) ?? [];

  // 全エージェント名のマップ
  const agentNames = new Map<string, string>();
  for (const [id, a] of world.agents) {
    agentNames.set(id, a.identity.name);
  }

  // ブループリント情報（魂テキスト、行動規則）
  let soulText: string | undefined;
  let behaviorRules: string[] | undefined;
  if (leader.identity.blueprintId) {
    const bp = world.blueprints.get(leader.identity.blueprintId);
    if (bp) {
      soulText = bp.soul;
      behaviorRules = bp.rules;
    }
  }

  return {
    leader,
    villageName: village.name,
    memories,
    relationships,
    agentNames,
    soulText,
    behaviorRules,
  };
}

// --- Need updates ---

function updateAgentNeeds(world: WorldState): void {
  for (const agent of world.livingAgents) {
    agent.needs.hunger = Math.max(0, agent.needs.hunger - HUNGER_DECAY_PER_TICK);
    agent.needs.energy = Math.max(0, agent.needs.energy - ENERGY_DECAY_PER_TICK);
    agent.needs.social = Math.max(0, agent.needs.social - SOCIAL_DECAY_PER_TICK);
  }
}

// --- Economy bridge: agent surplus → village 4X resources ---

const AGENT_TAX_RATE = 0.5; // 50% of gathered resources go to village

function contributeToVillage(
  world: WorldState,
  agent: AgentState,
  resource: ResourceType,
  amount: number,
): void {
  if (!agent.villageId || amount <= 0) return;
  const vs = world.villageStates4X.get(agent.villageId);
  if (!vs) return;
  const res4x = mapTo4XResource(resource);
  if (!res4x) return;

  const contribution = Math.floor(amount * AGENT_TAX_RATE);
  if (contribution <= 0) return;

  const cap = vs.resourceStorage[res4x];
  vs.resources[res4x] = Math.min(vs.resources[res4x] + contribution, cap);
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
      const available = tile.resources[resource] ?? 0;

      if (available <= 0) {
        // Current tile has no resource — move toward a nearby tile that does
        const targetPos = findNearbyResource(world.map, agent.position, resource, 8);
        if (targetPos) {
          const nextPos = getNextStep(world.map.tiles, agent.position, targetPos);
          agent.position = nextPos;
          agent.currentAction = `${resource}を求めて移動中`;
          return { changedChunk: chunkKey(agent.position) };
        }
        // Nothing nearby — fall back to random exploration
        agent.currentAction = `${resource}が見つからず探索中`;
        return executeAction(world, agent, { type: 'explore' });
      }

      const skillLevel = agent.identity.skills.farming ?? 1;
      const amount = gatherFromTile(tile, resource, skillLevel);
      if (amount > 0) {
        addToInventory(agent, resource, amount);
        contributeToVillage(world, agent, resource, amount);
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
        contributeToVillage(world, agent, 'food', amount);
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
            `${agent.identity.name}が${type}を建設した（座標 ${agent.position.x},${agent.position.y}）`,
            { structureId: structure.id, type, position: { x: agent.position.x, y: agent.position.y } },
          ),
          changedChunk: chunkKey(agent.position),
        };
      }
      // Build failed — gather the first missing resource
      const costs = getBuildCost(type);
      for (const [resource, needed] of Object.entries(costs)) {
        if ((agent.inventory[resource as ResourceType] ?? 0) < (needed ?? 0)) {
          agent.currentAction = `${type}建設のため${resource}を収集中`;
          return executeAction(world, agent, { type: 'gather', resource });
        }
      }
      // Location issue — explore to find a buildable spot
      return executeAction(world, agent, { type: 'explore' });
    }

    case 'socialize': {
      // If target is specified and not adjacent, pathfind toward them
      if (action.targetId) {
        const target = world.agents.get(action.targetId);
        if (target && target.identity.status !== 'dead') {
          const dist = Math.abs(target.position.x - agent.position.x) + Math.abs(target.position.y - agent.position.y);
          if (dist > 2) {
            // Walk toward the target
            const nextPos = getNextStep(world.map.tiles, agent.position, target.position);
            agent.position = nextPos;
            agent.currentAction = `${target.identity.name}の元へ向かっている`;
            return { changedChunk: chunkKey(agent.position) };
          }
        }
      }
      agent.needs.social = Math.min(100, agent.needs.social + SOCIAL_RESTORE);
      agent.currentAction = '交流中';
      return {};
    }

    case 'craft': {
      // Craft an item — consumes resources, produces a tool or goods
      const hasWood = (agent.inventory.wood ?? 0) >= 2;
      const hasStone = (agent.inventory.stone ?? 0) >= 1;
      if (hasWood && hasStone) {
        agent.inventory.wood = (agent.inventory.wood ?? 0) - 2;
        agent.inventory.stone = (agent.inventory.stone ?? 0) - 1;
        agent.currentAction = '道具を製作中';
        return {
          event: createEvent(world.gameId, 'discovery', world.tick,
            [agent.identity.id],
            `${agent.identity.name}が道具を製作した`,
            { item: action.item }),
        };
      }
      agent.currentAction = '素材不足で製作断念';
      return {};
    }

    case 'teach': {
      // Teach a nearby agent — transfers some skill points
      const student = action.targetId ? world.agents.get(action.targetId) : null;
      if (student && student.identity.status !== 'dead') {
        const dist = Math.abs(student.position.x - agent.position.x) + Math.abs(student.position.y - agent.position.y);
        if (dist <= 2) {
          educateChild(student, agent);
          agent.needs.social = Math.min(100, agent.needs.social + SOCIAL_RESTORE * 0.5);
          agent.currentAction = `${student.identity.name}に教えている`;
          return {};
        }
      }
      agent.currentAction = '教える相手が近くにいない';
      return {};
    }

    case 'heal': {
      // Heal a nearby agent — restore some hunger/energy
      const target = action.targetId ? world.agents.get(action.targetId) : null;
      if (target && target.identity.status !== 'dead') {
        const dist = Math.abs(target.position.x - agent.position.x) + Math.abs(target.position.y - agent.position.y);
        if (dist <= 2) {
          const hasHerbs = (agent.inventory.herbs ?? 0) >= 1;
          if (hasHerbs) {
            agent.inventory.herbs = (agent.inventory.herbs ?? 0) - 1;
            target.needs.hunger = Math.min(100, target.needs.hunger + 20);
            target.needs.energy = Math.min(100, target.needs.energy + 15);
            agent.currentAction = `${target.identity.name}を治療中`;
            return {
              event: createEvent(world.gameId, 'discovery', world.tick,
                [agent.identity.id, target.identity.id],
                `${agent.identity.name}が${target.identity.name}を治療した`,
              ),
            };
          }
        }
      }
      agent.currentAction = '治療できず';
      return {};
    }

    case 'migrate': {
      // F7: Multi-tick pathfinding toward target village
      const targetVillage = world.villages.get(action.targetVillageId);
      if (!targetVillage || targetVillage.territory.length === 0) {
        agent.currentAction = '移住先が見つからず';
        return {};
      }
      const targetPos = targetVillage.territory[0];
      const dist = Math.abs(agent.position.x - targetPos.x) + Math.abs(agent.position.y - targetPos.y);

      if (dist <= 3) {
        // Arrived: leave old village, join new one
        if (agent.villageId) {
          const oldVillage = world.villages.get(agent.villageId);
          if (oldVillage) leaveVillage(agent, oldVillage);
        }
        agent.villageId = targetVillage.id;
        if (!targetVillage.population.includes(agent.identity.id)) {
          targetVillage.population.push(agent.identity.id);
        }
        agent.currentAction = `${targetVillage.name}に移住完了`;

        // Write migration memory
        const memMgr = new MemoryManager(agent.identity.id, world.gameId);
        memMgr.addMemory(`${targetVillage.name}に移住した`, 0.8, world.tick, 'episodic', ['migration']);

        return {
          event: createEvent(world.gameId, 'discovery', world.tick,
            [agent.identity.id],
            `${agent.identity.name}が${targetVillage.name}に移住した`,
            { type: 'migration', targetVillageId: targetVillage.id }),
        };
      }

      // Walk toward target
      const nextPos = getNextStep(world.map.tiles, agent.position, targetPos);
      agent.position = nextPos;
      agent.currentAction = `${targetVillage.name}へ移住中`;
      return { changedChunk: chunkKey(agent.position) };
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
