// === プレイヤーコマンド型定義 ===

import type { Position } from './types.ts';
import type { ResourceType4X, CovenantClause, JoinRequirement } from './types4x.ts';
import type { Effect } from './rules/types.ts';

// --- コマンド union 型 ---

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

// 村をクレーム（プレイヤーが村のリーダーになる）
export interface ClaimVillageCommand {
  type: 'claim_village';
  position: Position;         // クレーム位置（近くの村 or 新規建設）
}

// 建設コマンド
export interface BuildCommand {
  type: 'build';
  villageId: string;
  buildingDefId: string;      // BuildingDef.id
  position: Position;         // 建設位置
}

// 研究コマンド
export interface ResearchCommand {
  type: 'research';
  villageId: string;
  techDefId: string;          // TechDef.id
}

// 訓練コマンド
export interface TrainCommand {
  type: 'train';
  villageId: string;
  unitDefId: string;          // UnitDef.id
  count: number;
}

// 攻撃コマンド
export interface AttackCommand {
  type: 'attack';
  villageId: string;          // 出撃元
  armyId: string;             // 軍隊ID
  targetVillageId: string;    // 攻撃先
}

// 軍隊移動
export interface MoveArmyCommand {
  type: 'move_army';
  villageId: string;
  armyId: string;
  targetPosition: Position;
}

// 外交コマンド
export interface DiplomacyCommand {
  type: 'diplomacy';
  villageId: string;
  targetVillageId: string;
  action: 'propose_alliance' | 'declare_war' | 'propose_peace' | 'break_alliance';
}

// 交易コマンド
export interface TradeCommand {
  type: 'trade';
  villageId: string;
  targetVillageId: string;
  offer: Partial<Record<ResourceType4X, number>>;
  request: Partial<Record<ResourceType4X, number>>;
}

// 建物取り壊し
export interface DemolishCommand {
  type: 'demolish';
  villageId: string;
  buildingId: string;
}

// 防衛集結
export interface RallyDefenseCommand {
  type: 'rally_defense';
  villageId: string;
}

// --- Layer 1: 契約コマンド ---

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

// --- Layer 3: 制度コマンド ---

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

// --- コマンド結果 ---

export interface CommandResult {
  success: boolean;
  command: PlayerCommand;
  message: string;
  data?: Record<string, unknown>;
}
