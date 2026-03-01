/**
 * starknetTx.ts — Frontend direct on-chain command execution
 *
 * Uses DojoTxService + VillageIdMapper to send player commands
 * directly to the Katana devnet.
 */

import type { Account, RpcProvider } from 'starknet';
import type { PlayerCommand } from '@murasato/shared';
import { DojoTxService, DiplomacyStatus } from './dojoTxService.ts';
import {
  VillageIdMapper,
  BUILDING_STR_TO_U32,
  TECH_STR_TO_U32,
  UNIT_STR_TO_U32,
} from './dojoSync.ts';

let txService: DojoTxService | null = null;
let villageMapper: VillageIdMapper | null = null;

/** Initialize the TX service (call after walletStore.connectKatana) */
export function initTxService(
  account: Account,
  provider: RpcProvider,
  mapper: VillageIdMapper,
): void {
  txService = new DojoTxService(account, provider);
  villageMapper = mapper;
  console.log('[StarknetTx] TX service initialized');
}

/** Return a reference to the VillageIdMapper */
export function getVillageMapper(): VillageIdMapper | null {
  return villageMapper;
}

/** Return a reference to the DojoTxService */
export function getTxService(): DojoTxService | null {
  return txService;
}

/** Execute a command on-chain */
export async function executeCommandOnChain(
  command: PlayerCommand,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!txService || !villageMapper) {
    return { success: false, error: 'TX service not initialized' };
  }

  const villageUuid = (command as any).villageId as string | undefined;
  if (!villageUuid) {
    return { success: false, error: 'No villageId in command' };
  }

  const villageU32 = villageMapper.toU32(villageUuid);
  if (villageU32 === undefined) {
    return { success: false, error: `Village ${villageUuid} not registered on-chain` };
  }

  try {
    const txHash = await submitCommand(command, villageU32);
    if (!txHash) {
      return { success: false, error: `Unsupported command type: ${command.type}` };
    }

    console.log(`[StarknetTx] Command ${command.type} → tx: ${txHash}`);
    // Wait for confirmation
    await txService.waitForTx(txHash);
    return { success: true, txHash };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[StarknetTx] Command ${command.type} failed:`, err);
    return { success: false, error: msg };
  }
}

async function submitCommand(
  cmd: PlayerCommand,
  villageU32: number,
): Promise<string | null> {
  if (!txService || !villageMapper) return null;

  switch (cmd.type) {
    case 'build': {
      const defId = BUILDING_STR_TO_U32[(cmd as any).buildingDefId];
      if (!defId) return null;
      const pos = (cmd as any).position ?? { x: 0, y: 0 };
      return txService.submitBuild(villageU32, defId, pos.x, pos.y);
    }
    case 'research': {
      const techId = TECH_STR_TO_U32[(cmd as any).techDefId];
      if (!techId) return null;
      return txService.submitResearch(villageU32, techId);
    }
    case 'train': {
      const unitId = UNIT_STR_TO_U32[(cmd as any).unitDefId];
      if (!unitId) return null;
      const count = (cmd as any).count ?? 1;
      return txService.submitTrain(villageU32, unitId, count);
    }
    case 'demolish': {
      const buildingId = (cmd as any).buildingId;
      if (buildingId === undefined) return null;
      return txService.submitDemolish(villageU32, Number(buildingId) || 1);
    }
    case 'attack': {
      const targetUuid = (cmd as any).targetVillageId;
      const targetU32 = villageMapper.toU32(targetUuid);
      if (!targetU32) return null;
      return txService.submitAttack(villageU32, targetU32);
    }
    case 'diplomacy': {
      const targetUuid = (cmd as any).targetVillageId;
      const targetU32 = villageMapper.toU32(targetUuid);
      if (!targetU32) return null;
      const statusMap: Record<string, DiplomacyStatus> = {
        declare_war: DiplomacyStatus.War,
        propose_alliance: DiplomacyStatus.Allied,
        propose_peace: DiplomacyStatus.Neutral,
        break_alliance: DiplomacyStatus.Neutral,
      };
      const action = (cmd as any).action ?? 'propose_peace';
      const status = statusMap[action] ?? DiplomacyStatus.Neutral;
      return txService.submitDiplomacy(villageU32, targetU32, status);
    }
    default:
      return null;
  }
}
