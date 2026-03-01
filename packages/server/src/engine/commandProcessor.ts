// === Command Processor — Command validation + execution ===

import {
  BUILDING_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  type BuildingDef,
  type TechDef,
  type UnitDef,
} from '@murasato/shared';
import type {
  PlayerCommand,
  CommandResult,
  BuildCommand,
  ResearchCommand,
  TrainCommand,
  AttackCommand,
  DiplomacyCommand,
  TradeCommand,
  DemolishCommand,
  ClaimVillageCommand,
} from '@murasato/shared';
import type {
  VillageState4X,
  ResourceType4X,
  Resources4X,
  ArmyUnit,
} from '@murasato/shared';
import { RESOURCE_TYPES_4X, createDefaultVillageState4X } from '@murasato/shared';
import { aggregateEffects } from './ruleEngine.ts';
import { resolveCombat, conquerVillage } from './combatEngine.ts';
import type { Position, DiplomaticRelation } from '@murasato/shared';

// --- Reference interface to the 4X world ---

export interface World4XRef {
  villageStates: Map<string, VillageState4X>;
  getTerrain: (pos: Position) => string;
  getDiplomacy: (v1: string, v2: string) => DiplomaticRelation | null;
  setDiplomacy: (v1: string, v2: string, status: string) => void;
  tick: number;
  generateId: () => string;
  getVillageCenter?: (villageId: string) => Position | null;  // F6: Spatial trade
}

// --- Command processing ---

export function processCommand(
  command: PlayerCommand,
  playerId: string,
  world: World4XRef,
): CommandResult {
  switch (command.type) {
    case 'claim_village':
      return processClaim(command, playerId, world);
    case 'build':
      return processBuild(command, playerId, world);
    case 'research':
      return processResearch(command, playerId, world);
    case 'train':
      return processTrain(command, playerId, world);
    case 'attack':
      return processAttack(command, playerId, world);
    case 'diplomacy':
      return processDiplomacy(command, playerId, world);
    case 'trade':
      return processTrade(command, playerId, world);
    case 'demolish':
      return processDemolish(command, playerId, world);
    case 'move_army':
      return processMoveArmy(command, playerId, world);
    case 'rally_defense':
      return processRallyDefense(command, playerId, world);
    default:
      return { success: false, command, message: 'Unknown command type' };
  }
}

// --- Village claim ---

function processClaim(
  cmd: ClaimVillageCommand,
  playerId: string,
  world: World4XRef,
): CommandResult {
  // Check if player already owns a village
  for (const vs of world.villageStates.values()) {
    if (vs.ownerId === playerId) {
      return { success: false, command: cmd, message: 'Player already owns a village' };
    }
  }

  // Create new village
  const villageId = world.generateId();
  const territory = generateTerritory(cmd.position, 5);
  const vs = createDefaultVillageState4X(villageId, playerId, territory, world.tick);
  world.villageStates.set(villageId, vs);

  return {
    success: true,
    command: cmd,
    message: `Village ${villageId} claimed`,
    data: { villageId },
  };
}

// --- Build ---

function processBuild(
  cmd: BuildCommand,
  playerId: string,
  world: World4XRef,
): CommandResult {
  const village = getOwnedVillage(cmd.villageId, playerId, world);
  if (!village) return { success: false, command: cmd, message: 'Not your village' };

  const def = BUILDING_DEFS[cmd.buildingDefId];
  if (!def) return { success: false, command: cmd, message: `Unknown building: ${cmd.buildingDefId}` };

  // Prerequisite check
  if (def.requires.tech && !village.researchedTechs.has(def.requires.tech)) {
    return { success: false, command: cmd, message: `Requires tech: ${def.requires.tech}` };
  }
  if (def.requires.building && !village.buildings.some(b => b.defId === def.requires.building)) {
    return { success: false, command: cmd, message: `Requires building: ${def.requires.building}` };
  }
  if (def.requires.population && village.population < def.requires.population) {
    return { success: false, command: cmd, message: `Requires population: ${def.requires.population}` };
  }

  // Max count check
  if (def.maxPerVillage > 0) {
    const count = village.buildings.filter(b => b.defId === cmd.buildingDefId).length
      + village.buildQueue.filter(q => q.defId === cmd.buildingDefId).length;
    if (count >= def.maxPerVillage) {
      return { success: false, command: cmd, message: `Max ${def.maxPerVillage} ${def.name} per village` };
    }
  }

  // Resource check + consumption
  if (!payResources(village, def.cost)) {
    return { success: false, command: cmd, message: 'Not enough resources' };
  }

  // Add to queue
  const queueId = world.generateId();
  village.buildQueue.push({
    id: queueId,
    queueType: 'building',
    defId: cmd.buildingDefId,
    remainingTicks: def.buildTicks,
    totalTicks: def.buildTicks,
    position: cmd.position,
  });

  return {
    success: true,
    command: cmd,
    message: `Building ${def.name} queued`,
    data: { queueId },
  };
}

// --- Research ---

function processResearch(
  cmd: ResearchCommand,
  playerId: string,
  world: World4XRef,
): CommandResult {
  const village = getOwnedVillage(cmd.villageId, playerId, world);
  if (!village) return { success: false, command: cmd, message: 'Not your village' };

  const def = TECH_DEFS[cmd.techDefId];
  if (!def) return { success: false, command: cmd, message: `Unknown tech: ${cmd.techDefId}` };

  // Already researched
  if (village.researchedTechs.has(cmd.techDefId)) {
    return { success: false, command: cmd, message: 'Already researched' };
  }

  // Prerequisite tech check
  if (def.requires.tech && !village.researchedTechs.has(def.requires.tech)) {
    return { success: false, command: cmd, message: `Requires tech: ${def.requires.tech}` };
  }

  // Already in queue
  if (village.researchQueue.some(q => q.defId === cmd.techDefId)) {
    return { success: false, command: cmd, message: 'Already in research queue' };
  }

  // Add to research queue (cost deducted from researchPoints upon completion)
  const queueId = world.generateId();
  village.researchQueue.push({
    id: queueId,
    queueType: 'research',
    defId: cmd.techDefId,
    remainingTicks: def.researchCost,  // waits until researchPoints accumulate
    totalTicks: def.researchCost,
  });

  return {
    success: true,
    command: cmd,
    message: `Researching ${def.name}`,
    data: { queueId },
  };
}

// --- Training ---

function processTrain(
  cmd: TrainCommand,
  playerId: string,
  world: World4XRef,
): CommandResult {
  const village = getOwnedVillage(cmd.villageId, playerId, world);
  if (!village) return { success: false, command: cmd, message: 'Not your village' };

  const def = UNIT_DEFS[cmd.unitDefId];
  if (!def) return { success: false, command: cmd, message: `Unknown unit: ${cmd.unitDefId}` };

  // Prerequisite check
  if (def.requires.tech && !village.researchedTechs.has(def.requires.tech)) {
    return { success: false, command: cmd, message: `Requires tech: ${def.requires.tech}` };
  }
  if (def.requires.building && !village.buildings.some(b => b.defId === def.requires.building)) {
    return { success: false, command: cmd, message: `Requires building: ${def.requires.building}` };
  }

  // Pay resources for each unit
  const totalCost: Partial<Record<ResourceType4X, number>> = {};
  for (const res of RESOURCE_TYPES_4X) {
    const unitCost = def.trainCost[res] || 0;
    if (unitCost > 0) totalCost[res] = unitCost * cmd.count;
  }

  if (!payResources(village, totalCost)) {
    return { success: false, command: cmd, message: 'Not enough resources' };
  }

  // Add each unit to queue
  for (let i = 0; i < cmd.count; i++) {
    const queueId = world.generateId();
    village.trainQueue.push({
      id: queueId,
      queueType: 'training',
      defId: cmd.unitDefId,
      remainingTicks: def.trainTicks,
      totalTicks: def.trainTicks,
    });
  }

  return {
    success: true,
    command: cmd,
    message: `Training ${cmd.count}x ${def.name}`,
  };
}

// --- Attack ---

function processAttack(
  cmd: AttackCommand,
  playerId: string,
  world: World4XRef,
): CommandResult {
  const village = getOwnedVillage(cmd.villageId, playerId, world);
  if (!village) return { success: false, command: cmd, message: 'Not your village' };

  const target = world.villageStates.get(cmd.targetVillageId);
  if (!target) return { success: false, command: cmd, message: 'Target village not found' };

  // Get attacking units
  const army = village.armies.find(a => a.id === cmd.armyId);
  const attackingUnits = army ? army.units : [...village.garrison];

  if (attackingUnits.length === 0) {
    return { success: false, command: cmd, message: 'No units to attack with' };
  }

  // If attacking from garrison, clear garrison
  if (!army) {
    village.garrison = [];
  }

  // Resolve combat
  const terrain = (world.getTerrain(target.territory[0] || { x: 0, y: 0 }) || 'plains') as any;
  const result = resolveCombat(village, target, attackingUnits, [...target.garrison], terrain);

  // If victorious, conquer
  if (result.attackerWon && target.garrison.length === 0) {
    conquerVillage(village, target);
  }

  // If attacked from garrison, return surviving units to garrison
  if (!army) {
    village.garrison = attackingUnits.filter(u => u.count > 0);
  }

  // Update defender's garrison
  target.garrison = target.garrison.filter(u => u.count > 0);

  return {
    success: true,
    command: cmd,
    message: result.attackerWon ? 'Attack succeeded!' : 'Attack failed.',
    data: { combatResult: result },
  };
}

// --- Diplomacy ---

function processDiplomacy(
  cmd: DiplomacyCommand,
  playerId: string,
  world: World4XRef,
): CommandResult {
  const village = getOwnedVillage(cmd.villageId, playerId, world);
  if (!village) return { success: false, command: cmd, message: 'Not your village' };

  const target = world.villageStates.get(cmd.targetVillageId);
  if (!target) return { success: false, command: cmd, message: 'Target village not found' };

  switch (cmd.action) {
    case 'declare_war':
      world.setDiplomacy(cmd.villageId, cmd.targetVillageId, 'war');
      return { success: true, command: cmd, message: 'War declared!' };
    case 'propose_alliance':
      world.setDiplomacy(cmd.villageId, cmd.targetVillageId, 'allied');
      return { success: true, command: cmd, message: 'Alliance proposed' };
    case 'propose_peace':
      world.setDiplomacy(cmd.villageId, cmd.targetVillageId, 'neutral');
      return { success: true, command: cmd, message: 'Peace proposed' };
    case 'break_alliance':
      world.setDiplomacy(cmd.villageId, cmd.targetVillageId, 'neutral');
      return { success: true, command: cmd, message: 'Alliance broken' };
    default:
      return { success: false, command: cmd, message: 'Unknown diplomacy action' };
  }
}

// --- Trade ---

function processTrade(
  cmd: TradeCommand,
  playerId: string,
  world: World4XRef,
): CommandResult {
  const village = getOwnedVillage(cmd.villageId, playerId, world);
  if (!village) return { success: false, command: cmd, message: 'Not your village' };

  const target = world.villageStates.get(cmd.targetVillageId);
  if (!target) return { success: false, command: cmd, message: 'Target village not found' };

  // Resource check
  if (!hasResources(village, cmd.offer)) {
    return { success: false, command: cmd, message: 'Not enough resources to offer' };
  }
  if (!hasResources(target, cmd.request)) {
    return { success: false, command: cmd, message: 'Target does not have requested resources' };
  }

  // F6: Spatial trade efficiency
  let efficiency = 1.0;
  if (world.getVillageCenter) {
    const center1 = world.getVillageCenter(cmd.villageId);
    const center2 = world.getVillageCenter(cmd.targetVillageId);
    if (center1 && center2) {
      const dist = Math.abs(center1.x - center2.x) + Math.abs(center1.y - center2.y);
      efficiency = 1 / (1 + dist * 0.05);
      // Road bonus: count road buildings in source village
      const roadCount = village.buildings.filter(b => b.defId === 'road').length;
      const roadBonus = Math.min(0.30, roadCount * 0.02);
      efficiency = Math.min(1, efficiency + roadBonus);
    }
  }

  // Execute trade (sender pays full, receiver gets scaled by efficiency)
  for (const res of RESOURCE_TYPES_4X) {
    const offered = cmd.offer[res] || 0;
    const requested = cmd.request[res] || 0;
    village.resources[res] -= offered;
    const receivedByTarget = Math.floor(offered * efficiency);
    target.resources[res] += receivedByTarget;
    target.resources[res] -= requested;
    const receivedByVillage = Math.floor(requested * efficiency);
    village.resources[res] += receivedByVillage;

    // Gold cumulative tracking
    if (res === 'gold') {
      if (receivedByTarget > 0) target.totalGoldEarned = (target.totalGoldEarned ?? 0) + receivedByTarget;
      if (receivedByVillage > 0) village.totalGoldEarned = (village.totalGoldEarned ?? 0) + receivedByVillage;
    }
  }

  return { success: true, command: cmd, message: `Trade completed (efficiency: ${Math.round(efficiency * 100)}%)` };
}

// --- Demolish ---

function processDemolish(
  cmd: DemolishCommand,
  playerId: string,
  world: World4XRef,
): CommandResult {
  const village = getOwnedVillage(cmd.villageId, playerId, world);
  if (!village) return { success: false, command: cmd, message: 'Not your village' };

  const idx = village.buildings.findIndex(b => b.id === cmd.buildingId);
  if (idx === -1) return { success: false, command: cmd, message: 'Building not found' };

  const removed = village.buildings.splice(idx, 1)[0];
  // Refund a portion of resources (25%)
  const def = BUILDING_DEFS[removed.defId];
  if (def) {
    for (const res of RESOURCE_TYPES_4X) {
      const refund = Math.floor((def.cost[res] || 0) * 0.25);
      village.resources[res] += refund;
    }
  }

  return { success: true, command: cmd, message: `Demolished ${removed.defId}` };
}

// --- Army movement ---

function processMoveArmy(
  cmd: { type: 'move_army'; villageId: string; armyId: string; targetPosition: Position },
  playerId: string,
  world: World4XRef,
): CommandResult {
  const village = getOwnedVillage(cmd.villageId, playerId, world);
  if (!village) return { success: false, command: cmd, message: 'Not your village' };

  const army = village.armies.find(a => a.id === cmd.armyId);
  if (!army) return { success: false, command: cmd, message: 'Army not found' };

  army.targetPosition = cmd.targetPosition;
  army.status = 'moving';

  return { success: true, command: cmd, message: 'Army moving' };
}

// --- Rally defense ---

function processRallyDefense(
  cmd: { type: 'rally_defense'; villageId: string },
  playerId: string,
  world: World4XRef,
): CommandResult {
  const village = getOwnedVillage(cmd.villageId, playerId, world);
  if (!village) return { success: false, command: cmd, message: 'Not your village' };

  // Rally all armies to garrison
  for (const army of village.armies) {
    for (const unit of army.units) {
      const existing = village.garrison.find(g => g.defId === unit.defId);
      if (existing) {
        existing.count += unit.count;
      } else {
        village.garrison.push({ ...unit });
      }
    }
  }
  village.armies = [];

  return { success: true, command: cmd, message: 'All armies rallied to defense' };
}

// --- Helpers ---

function getOwnedVillage(
  villageId: string,
  playerId: string,
  world: World4XRef,
): VillageState4X | null {
  const vs = world.villageStates.get(villageId);
  if (!vs) return null;
  if (vs.ownerId !== playerId) return null;
  return vs;
}

function hasResources(
  village: VillageState4X,
  cost: Partial<Record<ResourceType4X, number>>,
): boolean {
  for (const res of RESOURCE_TYPES_4X) {
    const needed = cost[res] || 0;
    if (needed > 0 && village.resources[res] < needed) return false;
  }
  return true;
}

function payResources(
  village: VillageState4X,
  cost: Partial<Record<ResourceType4X, number>>,
): boolean {
  if (!hasResources(village, cost)) return false;
  for (const res of RESOURCE_TYPES_4X) {
    const needed = cost[res] || 0;
    if (needed > 0) village.resources[res] -= needed;
  }
  return true;
}

function generateTerritory(center: Position, radius: number): Position[] {
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
