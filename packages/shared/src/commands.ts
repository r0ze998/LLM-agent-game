// === Player Command Type Definitions ===

import type { Position } from './types.ts';
import type { ResourceType4X, CovenantClause, JoinRequirement } from './types4x.ts';
import type { Effect } from './rules/types.ts';

// --- Command Union Type ---

export type PlayerCommand =
  | ClaimVillageCommand
  | BuildCommand
  | ResearchCommand
  | TrainCommand
  | AttackCommand
  | MoveArmyCommand
  | DiplomacyCommand
  | TradeCommand
  | DemolishCommand
  | RallyDefenseCommand
  | ProposeCovenantCommand
  | VoteCovenantCommand
  | RepealCovenantCommand
  | FoundInstitutionCommand
  | JoinInstitutionCommand
  | LeaveInstitutionCommand;

// Claim a village (player becomes the village leader)
export interface ClaimVillageCommand {
  type: 'claim_village';
  position: Position;         // Claim position (nearby village or new settlement)
}

// Build command
export interface BuildCommand {
  type: 'build';
  villageId: string;
  buildingDefId: string;      // BuildingDef.id
  position: Position;         // Build location
}

// Research command
export interface ResearchCommand {
  type: 'research';
  villageId: string;
  techDefId: string;          // TechDef.id
}

// Train command
export interface TrainCommand {
  type: 'train';
  villageId: string;
  unitDefId: string;          // UnitDef.id
  count: number;
}

// Attack command
export interface AttackCommand {
  type: 'attack';
  villageId: string;          // Origin village
  armyId: string;             // Army ID
  targetVillageId: string;    // Target village
}

// Move army
export interface MoveArmyCommand {
  type: 'move_army';
  villageId: string;
  armyId: string;
  targetPosition: Position;
}

// Diplomacy command
export interface DiplomacyCommand {
  type: 'diplomacy';
  villageId: string;
  targetVillageId: string;
  action: 'propose_alliance' | 'declare_war' | 'propose_peace' | 'break_alliance';
}

// Trade command
export interface TradeCommand {
  type: 'trade';
  villageId: string;
  targetVillageId: string;
  offer: Partial<Record<ResourceType4X, number>>;
  request: Partial<Record<ResourceType4X, number>>;
}

// Demolish building
export interface DemolishCommand {
  type: 'demolish';
  villageId: string;
  buildingId: string;
}

// Rally defense
export interface RallyDefenseCommand {
  type: 'rally_defense';
  villageId: string;
}

// --- Layer 1: Covenant Commands ---

export interface ProposeCovenantCommand {
  type: 'propose_covenant';
  villageId: string;
  scope: 'village' | 'bilateral' | 'global';
  targetVillageId?: string;
  name: string;
  description: string;
  clauses: CovenantClause[];
}

export interface VoteCovenantCommand {
  type: 'vote_covenant';
  villageId: string;
  covenantId: string;
  approve: boolean;
}

export interface RepealCovenantCommand {
  type: 'repeal_covenant';
  villageId: string;
  covenantId: string;
}

// --- Layer 3: Institution Commands ---

export interface FoundInstitutionCommand {
  type: 'found_institution';
  villageId: string;
  name: string;
  institutionType: 'guild' | 'religion' | 'alliance' | 'academy' | 'custom';
  description: string;
  charter: string;
  memberEffects: Effect[];
  joinRequirements: JoinRequirement[];
}

export interface JoinInstitutionCommand {
  type: 'join_institution';
  villageId: string;
  institutionId: string;
}

export interface LeaveInstitutionCommand {
  type: 'leave_institution';
  villageId: string;
  institutionId: string;
}

// --- Command Result ---

export interface CommandResult {
  success: boolean;
  command: PlayerCommand;
  message: string;
  data?: Record<string, unknown>;
}
