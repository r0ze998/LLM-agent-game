/**
 * simulation.ts — Orchestrator + types
 *
 * The main tick loop that coordinates all phases.
 * Detailed logic is delegated to:
 *   - tickPhases.ts    (agent needs, decision context, reproduction)
 *   - actionExecutor.ts (13 action types)
 *   - strategy4X.ts     (army, territory, disasters, AI strategy, victory)
 *   - socialTick.ts     (elder wisdom, reflection, governance drift)
 */
import type {
  AgentState, DeployedBlueprintMeta, GameEvent, GameEventType, Position, Relationship,
  Village, PlayerIntention, InformationPiece, Memory,
} from '@murasato/shared';
import {
  TICKS_PER_DAY, TERRITORY_RADIUS,
} from '@murasato/shared';
import {
  createDefaultVillageState4X,
  createAutonomousWorldState,
  type VillageState4X,
  type AutonomousWorldState,
  type Disaster,
} from '@murasato/shared';
import type { WorldMap } from './map.ts';
import { regenerateResources } from './resources.ts';
import { decide, type AgentAction } from '../agent/decisionEngine.ts';
import type { ReflectionContext } from '../agent/prompts.ts';
import { MemoryManager } from '../agent/memory.ts';
import { ageAgent, growSkill, educateChild, getSkillForAction, checkGrowthMilestones } from '../agent/lifecycle.ts';
import { checkVillageForming, foundVillage, runElection, proposeLaw, voteLaw, leaveVillage, markPlayerOwned } from '../social/governance.ts';
import { findConversationOpportunities, generateConversation as genConversation, applyConversationResults, createConversationEvent } from '../social/conversation.ts';
import { getOrCreateRelationship, decaySentiment } from '../social/relationships.ts';
import { checkCulturalExchange, applyCulturalExchange, evolveCulture } from '../social/culture.ts';
import { DiplomacyManager, processDiplomacy } from '../social/diplomacy.ts';
import { computeDissatisfaction, findMigrationTarget, checkHomelessRecruitment } from '../social/migration.ts';
import { canReligionEmerge, generateReligion, checkReligionSpread, spreadReligion, processOrthodoxy, getReligionTensionModifier } from '../social/religion.ts';
import { AgentKnowledgeStore, parseConversationInformation, transferInformation } from '../social/information.ts';
import { LLMBudgetExceeded } from '../agent/llmClient.ts';
import { generateReflection } from '../agent/decisionEngine.ts';
import type { DojoBridge } from '../services/dojo/dojoBridge.ts';
import type { World4XRef } from '../engine/commandProcessor.ts';

// Extracted modules
import { updateAgentNeeds, buildDecisionContext, getRelationship, checkReproduction } from './tickPhases.ts';
import { executeAction } from './actionExecutor.ts';
import { run4XTick, generateTerritoryDiamond, buildLeaderContext } from './strategy4X.ts';
import { extractElderWisdom, shouldReflect, evaluateGovernanceDrift } from './socialTick.ts';

// Re-export for backwards compatibility
export { updateAgentNeeds, buildDecisionContext, getRelationship, checkReproduction } from './tickPhases.ts';
export { executeAction, type ActionResult } from './actionExecutor.ts';
export { run4XTick, processArmyMovement, processTerritoryExpansion, processDisasters, deriveVillageDiplomaticStatus, buildLeaderContext, generateTerritoryDiamond } from './strategy4X.ts';
export { extractElderWisdom, shouldReflect, evaluateGovernanceDrift } from './socialTick.ts';

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

// --- Tick Result ---

export interface TickResult {
  tick: number;
  actions: Map<string, AgentAction>;
  events: GameEvent[];
  changedChunks: Set<string>; // "cx,cy"
}

export function createEvent(gameId: string, type: GameEventType, tick: number, actorIds: string[], description: string, data: Record<string, unknown> = {}): GameEvent {
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
