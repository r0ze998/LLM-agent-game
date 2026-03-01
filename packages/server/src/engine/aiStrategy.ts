// === AI Strategy — LLM-driven village leader decisions + rule-based fallback ===
//
// The LLM determines strategy based on the leader's personality, memories, and philosophy.
// If the LLM call fails, it falls back to conventional rule-based logic.

import {
  BUILDING_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  BUILDING_LIST,
  TECH_LIST,
  UNIT_LIST,
  getTechsByBranch,
  INVENTION_LIMITS,
  COVENANT_LIMITS,
} from '@murasato/shared';
import type { PlayerCommand } from '@murasato/shared';
import type {
  VillageState4X, ResourceType4X, AutonomousWorldState,
  Covenant, Invention, Institution,
} from '@murasato/shared';
import { RESOURCE_TYPES_4X } from '@murasato/shared';
import type { DiplomaticRelation, AgentState, Relationship, Memory, Village } from '@murasato/shared';
import { AI_MILITARY_THREAT_THRESHOLD } from '@murasato/shared';
import { callLLM, extractJSON } from '../agent/llmClient.ts';
import {
  buildStrategyPrompt,
  buildCovenantPrompt,
  buildInventionPrompt,
  buildInstitutionPrompt,
  type StrategyPromptContext,
  type StrategyDecision,
  type StrategyOption,
  type CovenantPromptContext,
  type CovenantDecision,
  type InventionPromptContext,
  type InventionDecision,
  type InstitutionPromptContext,
  type InstitutionDecision,
} from '../agent/prompts.ts';
import { validateCovenant, getActiveCovenantCount } from './covenantEngine.ts';
import { InventionRegistry } from './inventionRegistry.ts';
import { validateInstitution, foundInstitution, joinInstitution, getVillageInstitutions } from './institutionEngine.ts';

// --- Leader context passed from outside ---

export interface LeaderContext {
  leader: AgentState;
  villageName: string;
  memories: Memory[];
  relationships: Relationship[];
  agentNames: Map<string, string>;
  soulText?: string;
  behaviorRules?: string[];
}

// --- Main AI logic ---

/** Generate commands for an AI village. Uses LLM if a leader is present, otherwise rule-based. */
export async function generateAICommands(
  village: VillageState4X,
  allVillages: Map<string, VillageState4X>,
  diplomacy: DiplomaticRelation[],
  leaderCtx?: LeaderContext,
  allVillageNames?: Map<string, string>,
): Promise<PlayerCommand[]> {
  // If a leader is present: LLM-driven
  if (leaderCtx) {
    try {
      return await generateLLMCommands(village, allVillages, diplomacy, leaderCtx, allVillageNames);
    } catch (err) {
      console.error(`LLM strategy failed for village ${village.villageId}, falling back to rules:`, (err as Error).message);
    }
  }

  // Fallback: rule-based
  return generateRuleBasedCommands(village, allVillages, diplomacy);
}

// ============================================================
// LLM-driven strategy
// ============================================================

async function generateLLMCommands(
  village: VillageState4X,
  allVillages: Map<string, VillageState4X>,
  diplomacy: DiplomaticRelation[],
  leaderCtx: LeaderContext,
  allVillageNames?: Map<string, string>,
): Promise<PlayerCommand[]> {
  // 1. Collect candidates (only those passing prerequisite + resource checks)
  const availableBuildings = getAvailableBuildings(village);
  const availableTechs = getAvailableTechs(village);
  const availableUnits = getAvailableUnits(village);
  const neighborVillages = getNeighborInfo(village, allVillages, diplomacy, allVillageNames);

  // Skip if no candidates (no LLM call needed)
  if (availableBuildings.length === 0 && availableTechs.length === 0
      && availableUnits.length === 0 && neighborVillages.length === 0) {
    return [];
  }

  // 2. Build prompt
  const promptCtx: StrategyPromptContext = {
    leader: leaderCtx.leader,
    villageName: leaderCtx.villageName,
    villageState: village,
    memories: leaderCtx.memories,
    relationships: leaderCtx.relationships,
    agentNames: leaderCtx.agentNames,
    availableBuildings,
    availableTechs,
    availableUnits,
    neighborVillages,
    tick: village.foundedAtTick, // will be overridden
    soulText: leaderCtx.soulText,
    behaviorRules: leaderCtx.behaviorRules,
  };

  const { system, user } = buildStrategyPrompt(promptCtx);

  // 3. Call LLM
  const raw = await callLLM({
    system,
    userMessage: user,
    importance: 'routine',
    maxTokens: 512,
  });

  // 4. Parse response and convert to commands
  const decision = extractJSON<StrategyDecision>(raw);
  return decisionToCommands(decision, village, availableBuildings, availableTechs, availableUnits, neighborVillages);
}

// --- Convert LLM decision to PlayerCommand ---

function decisionToCommands(
  decision: StrategyDecision,
  village: VillageState4X,
  availableBuildings: StrategyOption[],
  availableTechs: StrategyOption[],
  availableUnits: StrategyOption[],
  neighborVillages: { id: string; name: string; militaryPower: number; diplomaticStatus: string; villageId: string }[],
): PlayerCommand[] {
  const commands: PlayerCommand[] = [];

  // Build
  if (decision.build && village.buildQueue.length < 2) {
    const validBuilding = availableBuildings.find(b => b.id === decision.build);
    if (validBuilding) {
      const pos = village.territory[Math.floor(Math.random() * village.territory.length)]
        || { x: 0, y: 0 };
      commands.push({
        type: 'build',
        villageId: village.villageId,
        buildingDefId: validBuilding.id,
        position: pos,
      });
    }
  }

  // Research
  if (decision.research && village.researchQueue.length === 0) {
    const validTech = availableTechs.find(t => t.id === decision.research);
    if (validTech) {
      commands.push({
        type: 'research',
        villageId: village.villageId,
        techDefId: validTech.id,
      });
    }
  }

  // Train
  if (decision.train && village.trainQueue.length < 3) {
    const validUnit = availableUnits.find(u => u.id === decision.train);
    if (validUnit) {
      commands.push({
        type: 'train',
        villageId: village.villageId,
        unitDefId: validUnit.id,
        count: 1,
      });
    }
  }

  // Diplomacy
  if (decision.diplomacy) {
    const target = neighborVillages.find(nv => nv.villageId === decision.diplomacy!.targetVillageId);
    if (target) {
      commands.push({
        type: 'diplomacy',
        villageId: village.villageId,
        targetVillageId: target.villageId,
        action: decision.diplomacy.action,
      });
    }
  }

  // Log the leader's inner monologue
  if (decision.innerThought) {
    console.log(`[Strategy] ${village.villageId}: ${decision.innerThought}`);
  }

  return commands;
}

// --- Candidate collection helpers ---

function getAvailableBuildings(village: VillageState4X): StrategyOption[] {
  return BUILDING_LIST
    .filter(def => canBuild(village, def))
    .map(def => ({
      id: def.id,
      name: def.name,
      description: describeBuildingEffects(def),
    }));
}

function getAvailableTechs(village: VillageState4X): StrategyOption[] {
  const result: StrategyOption[] = [];
  for (const tech of TECH_LIST) {
    if (village.researchedTechs.has(tech.id)) continue;
    if (tech.requires.tech && !village.researchedTechs.has(tech.requires.tech)) continue;
    result.push({
      id: tech.id,
      name: tech.name,
      description: `${tech.branch} branch tier${tech.tier} / cost ${tech.researchCost}RP`,
    });
  }
  return result;
}

function getAvailableUnits(village: VillageState4X): StrategyOption[] {
  return UNIT_LIST
    .filter(def => {
      if (def.requires.tech && !village.researchedTechs.has(def.requires.tech)) return false;
      if (def.requires.building && !village.buildings.some(b => b.defId === def.requires.building)) return false;
      for (const res of RESOURCE_TYPES_4X) {
        const needed = def.trainCost[res] || 0;
        if (needed > 0 && village.resources[res] < needed) return false;
      }
      return true;
    })
    .map(def => ({
      id: def.id,
      name: def.name,
      description: `ATK${def.attack}/DEF${def.defense}/HP${def.hp}`,
    }));
}

function getNeighborInfo(
  village: VillageState4X,
  allVillages: Map<string, VillageState4X>,
  diplomacy: DiplomaticRelation[],
  allVillageNames?: Map<string, string>,
): { id: string; name: string; militaryPower: number; diplomaticStatus: string; villageId: string }[] {
  const neighbors: { id: string; name: string; militaryPower: number; diplomaticStatus: string; villageId: string }[] = [];

  for (const [otherId, other] of allVillages) {
    if (otherId === village.villageId) continue;

    const rel = diplomacy.find(
      r => (r.villageId1 === village.villageId && r.villageId2 === otherId)
        || (r.villageId2 === village.villageId && r.villageId1 === otherId),
    );

    const status = rel ? rel.status : 'neutral';
    const name = allVillageNames?.get(otherId) ?? otherId;

    neighbors.push({
      id: otherId,
      name,
      militaryPower: computeMilitaryPower(other),
      diplomaticStatus: status,
      villageId: otherId,
    });
  }

  return neighbors;
}

function describeBuildingEffects(def: typeof BUILDING_LIST[0]): string {
  const parts: string[] = [];
  for (const eff of def.effects) {
    switch (eff.type) {
      case 'resource_production':
        parts.push(`${eff.target.resource}+${eff.value}`);
        break;
      case 'housing':
        parts.push(`Housing+${eff.value}`);
        break;
      case 'research_points':
        parts.push(`Research+${eff.value}`);
        break;
      case 'culture_points':
        parts.push(`Culture+${eff.value}`);
        break;
      case 'attack_bonus':
        parts.push(`Attack+${Math.round(eff.value * 100)}%`);
        break;
      case 'defense_bonus':
        parts.push(`Defense+${Math.round(eff.value * 100)}%`);
        break;
      case 'fortification':
        parts.push(`Fort+${eff.value}`);
        break;
      case 'resource_storage':
        parts.push(`Storage+${eff.value}`);
        break;
      default:
        parts.push(`${eff.type}`);
    }
  }
  const costStr = RESOURCE_TYPES_4X
    .filter(r => (def.cost[r] || 0) > 0)
    .map(r => `${r}${def.cost[r]}`)
    .join(',');
  return `${parts.join(', ')} [Cost: ${costStr}]`;
}

// ============================================================
// Rule-based fallback (no leader or LLM failure)
// ============================================================

type StrategyPriority = 'growth' | 'military' | 'research' | 'culture' | 'economy';

function generateRuleBasedCommands(
  village: VillageState4X,
  allVillages: Map<string, VillageState4X>,
  diplomacy: DiplomaticRelation[],
): PlayerCommand[] {
  const commands: PlayerCommand[] = [];
  const threat = assessThreat(village, allVillages, diplomacy);
  const priority = determinePriority(village, threat);

  const buildCmd = pickBuildCommand(village, priority);
  if (buildCmd) commands.push(buildCmd);

  const researchCmd = pickResearchCommand(village, priority);
  if (researchCmd) commands.push(researchCmd);

  if (priority === 'military' || threat.highestThreat > 0.3) {
    const trainCmd = pickTrainCommand(village);
    if (trainCmd) commands.push(trainCmd);
  }

  const diploCmd = pickDiplomacyCommand(village, allVillages, diplomacy, threat);
  if (diploCmd) commands.push(diploCmd);

  return commands;
}

// --- Common utilities ---

export function computeMilitaryPower(village: VillageState4X): number {
  let power = 0;
  for (const unit of village.garrison) {
    const def = UNIT_DEFS[unit.defId];
    if (!def) continue;
    power += (def.attack + def.defense) * unit.count * (1 + unit.veterancy * 0.01);
  }
  for (const army of village.armies) {
    for (const unit of army.units) {
      const def = UNIT_DEFS[unit.defId];
      if (!def) continue;
      power += (def.attack + def.defense) * unit.count * (1 + unit.veterancy * 0.01);
    }
  }
  return power;
}

// --- Rule-based internal functions ---

interface ThreatAssessment {
  highestThreat: number;
  atWar: boolean;
  enemyMilitaryPower: number;
  ownMilitaryPower: number;
}

function assessThreat(
  village: VillageState4X,
  allVillages: Map<string, VillageState4X>,
  diplomacy: DiplomaticRelation[],
): ThreatAssessment {
  let highestThreat = 0;
  let atWar = false;
  let enemyMilitaryPower = 0;
  const ownPower = computeMilitaryPower(village);

  for (const rel of diplomacy) {
    const otherVillageId = rel.villageId1 === village.villageId
      ? rel.villageId2 : (rel.villageId2 === village.villageId ? rel.villageId1 : null);
    if (!otherVillageId) continue;

    const other = allVillages.get(otherVillageId);
    if (!other) continue;

    if (rel.status === 'war') {
      atWar = true;
      const otherPower = computeMilitaryPower(other);
      enemyMilitaryPower += otherPower;
      const threat = ownPower > 0 ? otherPower / ownPower : 1;
      highestThreat = Math.max(highestThreat, Math.min(1, threat));
    } else if (rel.status === 'hostile') {
      const otherPower = computeMilitaryPower(other);
      const threat = ownPower > 0 ? (otherPower / ownPower) * 0.5 : 0.5;
      highestThreat = Math.max(highestThreat, Math.min(1, threat));
    }
  }

  return { highestThreat, atWar, enemyMilitaryPower, ownMilitaryPower: ownPower };
}

function determinePriority(village: VillageState4X, threat: ThreatAssessment): StrategyPriority {
  if (threat.atWar || threat.highestThreat > AI_MILITARY_THREAT_THRESHOLD) return 'military';
  if (village.resources.food < village.population * 5) return 'growth';
  if (village.population >= village.housingCapacity * 0.9) return 'growth';
  if (village.researchedTechs.size < 5) return 'research';
  if (village.totalCulturePoints > 300 && village.researchedTechs.has('arts')) return 'culture';
  return 'economy';
}

function pickBuildCommand(village: VillageState4X, priority: StrategyPriority): PlayerCommand | null {
  if (village.buildQueue.length >= 2) return null;

  const candidates = BUILDING_LIST.filter(def => canBuild(village, def));
  if (candidates.length === 0) return null;

  const categoryMap: Record<StrategyPriority, string[]> = {
    growth: ['economy', 'infrastructure'],
    military: ['military'],
    research: ['culture'],
    culture: ['culture'],
    economy: ['economy', 'infrastructure'],
  };

  const preferred = candidates.filter(d => categoryMap[priority].includes(d.category));
  const chosen = preferred.length > 0 ? preferred[0] : candidates[0];

  const pos = village.territory[Math.floor(Math.random() * village.territory.length)] || { x: 0, y: 0 };

  return {
    type: 'build',
    villageId: village.villageId,
    buildingDefId: chosen.id,
    position: pos,
  };
}

function canBuild(village: VillageState4X, def: typeof BUILDING_LIST[0]): boolean {
  if (def.requires.tech && !village.researchedTechs.has(def.requires.tech)) return false;
  if (def.requires.building && !village.buildings.some(b => b.defId === def.requires.building)) return false;
  if (def.requires.population && village.population < def.requires.population) return false;
  if (def.maxPerVillage > 0) {
    const count = village.buildings.filter(b => b.defId === def.id).length
      + village.buildQueue.filter(q => q.defId === def.id).length;
    if (count >= def.maxPerVillage) return false;
  }
  for (const res of RESOURCE_TYPES_4X) {
    const needed = def.cost[res] || 0;
    if (needed > 0 && village.resources[res] < needed) return false;
  }
  return true;
}

function pickResearchCommand(village: VillageState4X, priority: StrategyPriority): PlayerCommand | null {
  if (village.researchQueue.length > 0) return null;

  const branchOrder: Record<StrategyPriority, string[]> = {
    growth: ['agriculture', 'culture', 'military'],
    military: ['military', 'agriculture', 'culture'],
    research: ['culture', 'agriculture', 'military'],
    culture: ['culture', 'agriculture', 'military'],
    economy: ['agriculture', 'military', 'culture'],
  };

  for (const branch of branchOrder[priority]) {
    const techs = getTechsByBranch(branch);
    for (const tech of techs) {
      if (village.researchedTechs.has(tech.id)) continue;
      if (tech.requires.tech && !village.researchedTechs.has(tech.requires.tech)) continue;
      return { type: 'research', villageId: village.villageId, techDefId: tech.id };
    }
  }

  return null;
}

function pickTrainCommand(village: VillageState4X): PlayerCommand | null {
  if (village.trainQueue.length >= 3) return null;

  const available = UNIT_LIST.filter(def => {
    if (def.requires.tech && !village.researchedTechs.has(def.requires.tech)) return false;
    if (def.requires.building && !village.buildings.some(b => b.defId === def.requires.building)) return false;
    for (const res of RESOURCE_TYPES_4X) {
      const needed = def.trainCost[res] || 0;
      if (needed > 0 && village.resources[res] < needed) return false;
    }
    return true;
  });

  if (available.length === 0) return null;

  const best = available.sort((a, b) => (b.attack + b.defense) - (a.attack + a.defense))[0];

  return { type: 'train', villageId: village.villageId, unitDefId: best.id, count: 1 };
}

// ============================================================
// Autonomous World — Layer 1-3 command generation
// ============================================================

/** Layer 1: Attempt to propose a Covenant */
export async function generateCovenantCommand(
  village: VillageState4X,
  leaderCtx: LeaderContext,
  awState: AutonomousWorldState,
  allVillages: Map<string, VillageState4X>,
  diplomacy: DiplomaticRelation[],
  allVillageNames: Map<string, string>,
  tick: number,
): Promise<PlayerCommand | null> {
  // Check covenant count limit
  if (getActiveCovenantCount(village.villageId, awState, tick) >= COVENANT_LIMITS.maxActiveCovenantsPerVillage) {
    return null;
  }

  const activeCovenants: Covenant[] = [];
  for (const c of awState.covenants.values()) {
    if (c.villageId === village.villageId && c.repealedAtTick === null) {
      activeCovenants.push(c);
    }
  }

  const neighborVillages: { id: string; name: string; diplomaticStatus: string }[] = [];
  for (const [otherId] of allVillages) {
    if (otherId === village.villageId) continue;
    const rel = diplomacy.find(
      r => (r.villageId1 === village.villageId && r.villageId2 === otherId)
        || (r.villageId2 === village.villageId && r.villageId1 === otherId),
    );
    neighborVillages.push({
      id: otherId,
      name: allVillageNames.get(otherId) ?? otherId,
      diplomaticStatus: rel?.status ?? 'neutral',
    });
  }

  const promptCtx: CovenantPromptContext = {
    leader: leaderCtx.leader,
    villageName: leaderCtx.villageName,
    villageState: village,
    neighborVillages,
    activeCovenants,
    tick,
  };

  try {
    const { system, user } = buildCovenantPrompt(promptCtx);
    const raw = await callLLM({ system, userMessage: user, importance: 'routine', maxTokens: 512 });
    const decision = extractJSON<CovenantDecision>(raw);

    if (decision.propose) {
      const validation = validateCovenant({
        villageId: village.villageId,
        scope: decision.propose.scope,
        targetVillageId: decision.propose.targetVillageId,
        name: decision.propose.name,
        description: decision.propose.description,
        clauses: decision.propose.clauses,
        proposedByAgentId: leaderCtx.leader.identity.id,
        ratifiedByAgentIds: [leaderCtx.leader.identity.id],
        expiresAtTick: null,
      });

      if (validation.valid) {
        return {
          type: 'propose_covenant',
          villageId: village.villageId,
          scope: decision.propose.scope,
          targetVillageId: decision.propose.targetVillageId,
          name: decision.propose.name,
          description: decision.propose.description,
          clauses: decision.propose.clauses,
        };
      }
      console.log(`[Covenant] Validation failed for ${village.villageId}:`, validation.violations);
    }
  } catch (err) {
    console.error(`[Covenant] LLM failed for ${village.villageId}:`, (err as Error).message);
  }

  return null;
}

/** Layer 2: Attempt an invention */
export async function generateInventionCommand(
  village: VillageState4X,
  leaderCtx: LeaderContext,
  awState: AutonomousWorldState,
  tick: number,
): Promise<Invention | null> {
  // Skip if not enough research points
  if (village.researchPoints < INVENTION_LIMITS.requiredResearchPoints) return null;

  const registry = new InventionRegistry(awState);
  const existing = registry.getInventionsByVillage(village.villageId);

  if (existing.length >= INVENTION_LIMITS.maxInventionsPerVillage) return null;

  const promptCtx: InventionPromptContext = {
    leader: leaderCtx.leader,
    villageName: leaderCtx.villageName,
    villageState: village,
    existingInventions: existing,
    tick,
  };

  try {
    const { system, user } = buildInventionPrompt(promptCtx);
    const raw = await callLLM({ system, userMessage: user, importance: 'routine', maxTokens: 768 });
    const decision = extractJSON<InventionDecision>(raw);

    if (decision.invent) {
      const invention: Invention = {
        id: `inv_${crypto.randomUUID()}`,
        type: decision.invent.type,
        inventorAgentId: leaderCtx.leader.identity.id,
        originVillageId: village.villageId,
        name: decision.invent.name,
        description: decision.invent.description,
        definition: {
          id: decision.invent.name,
          name: decision.invent.name,
          ...decision.invent.definition,
        },
        inventedAtTick: tick,
        knownByVillages: [village.villageId],
        relevance: 1.0,
      };

      const result = registry.register(invention);
      if (result.success) {
        // Consume research points
        village.researchPoints -= INVENTION_LIMITS.requiredResearchPoints;
        console.log(`[Invention] ${leaderCtx.villageName} invented: ${invention.name} (${invention.type})`);
        return invention;
      }
      console.log(`[Invention] Validation failed:`, result.violations);
    }
  } catch (err) {
    console.error(`[Invention] LLM failed for ${village.villageId}:`, (err as Error).message);
  }

  return null;
}

/** Layer 3: Attempt to found or join an institution */
export async function generateInstitutionCommand(
  village: VillageState4X,
  leaderCtx: LeaderContext,
  awState: AutonomousWorldState,
  allVillages: Map<string, VillageState4X>,
  diplomacy: DiplomaticRelation[],
  allVillageNames: Map<string, string>,
  tick: number,
): Promise<PlayerCommand | null> {
  const existingInstitutions: Institution[] = [];
  for (const inst of awState.institutions.values()) {
    existingInstitutions.push(inst);
  }

  const neighborVillages: { id: string; name: string; diplomaticStatus: string }[] = [];
  for (const [otherId] of allVillages) {
    if (otherId === village.villageId) continue;
    const rel = diplomacy.find(
      r => (r.villageId1 === village.villageId && r.villageId2 === otherId)
        || (r.villageId2 === village.villageId && r.villageId1 === otherId),
    );
    neighborVillages.push({
      id: otherId,
      name: allVillageNames.get(otherId) ?? otherId,
      diplomaticStatus: rel?.status ?? 'neutral',
    });
  }

  const promptCtx: InstitutionPromptContext = {
    leader: leaderCtx.leader,
    villageName: leaderCtx.villageName,
    villageState: village,
    neighborVillages,
    existingInstitutions,
    tick,
  };

  try {
    const { system, user } = buildInstitutionPrompt(promptCtx);
    const raw = await callLLM({ system, userMessage: user, importance: 'routine', maxTokens: 768 });
    const decision = extractJSON<InstitutionDecision>(raw);

    // Found institution
    if (decision.found) {
      return {
        type: 'found_institution',
        villageId: village.villageId,
        name: decision.found.name,
        institutionType: decision.found.type,
        description: decision.found.description,
        charter: decision.found.charter,
        memberEffects: decision.found.memberEffects as any,
        joinRequirements: decision.found.joinRequirements as any,
      };
    }

    // Join existing institution
    if (decision.joinInstitutionId) {
      return {
        type: 'join_institution',
        villageId: village.villageId,
        institutionId: decision.joinInstitutionId,
      };
    }
  } catch (err) {
    console.error(`[Institution] LLM failed for ${village.villageId}:`, (err as Error).message);
  }

  return null;
}

function pickDiplomacyCommand(
  village: VillageState4X,
  allVillages: Map<string, VillageState4X>,
  diplomacy: DiplomaticRelation[],
  threat: ThreatAssessment,
): PlayerCommand | null {
  if (threat.highestThreat < 0.3 && computeMilitaryPower(village) > 50) {
    for (const [otherId, other] of allVillages) {
      if (otherId === village.villageId) continue;
      if (other.ownerId === village.ownerId) continue;

      const rel = diplomacy.find(
        r => (r.villageId1 === village.villageId && r.villageId2 === otherId)
          || (r.villageId2 === village.villageId && r.villageId1 === otherId),
      );
      if (rel && (rel.status === 'allied' || rel.status === 'war')) continue;

      const otherPower = computeMilitaryPower(other);
      if (otherPower < computeMilitaryPower(village) * 0.5) {
        return { type: 'diplomacy', villageId: village.villageId, targetVillageId: otherId, action: 'declare_war' };
      }
    }
  }

  if (threat.highestThreat > 0.5) {
    for (const [otherId, other] of allVillages) {
      if (otherId === village.villageId) continue;
      if (other.ownerId === village.ownerId) continue;

      const rel = diplomacy.find(
        r => (r.villageId1 === village.villageId && r.villageId2 === otherId)
          || (r.villageId2 === village.villageId && r.villageId1 === otherId),
      );
      if (rel && (rel.status === 'allied' || rel.status === 'war')) continue;

      return { type: 'diplomacy', villageId: village.villageId, targetVillageId: otherId, action: 'propose_alliance' };
    }
  }

  return null;
}
