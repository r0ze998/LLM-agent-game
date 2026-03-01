/**
 * dojoTxService.ts — Frontend direct TX submission (starknet.js v9)
 *
 * Ported from the server's dojoTxService.ts.
 * The Account instance is received from external source (walletStore).
 */

import type { Account, RpcProvider, Call } from 'starknet';
import { SYSTEM_ADDRESSES, type SystemName } from './dojoConfig.ts';

// ── Enums matching on-chain ──

export enum DiplomacyStatus {
  Neutral = 0,
  Friendly = 1,
  Allied = 2,
  Hostile = 3,
  War = 4,
}

// ── Fixed-point helper ──

function toFixed1000(val: number): string {
  return Math.round(val * 1000).toString();
}

// ── Service ──

export class DojoTxService {
  private account: Account;
  private provider: RpcProvider;

  constructor(account: Account, provider: RpcProvider) {
    this.account = account;
    this.provider = provider;
  }

  // ── Village ──

  async createVillage(ownerAddress: string): Promise<string> {
    return this.execute('village_tick', 'create_village', [ownerAddress]);
  }

  async submitVillageTick(villageId: number): Promise<string> {
    return this.execute('village_tick', 'tick', [villageId.toString()]);
  }

  // ── Commands ──

  async submitBuild(
    villageId: number,
    buildingDefId: number,
    posX: number,
    posY: number,
  ): Promise<string> {
    return this.execute('commands', 'build', [
      villageId.toString(),
      buildingDefId.toString(),
      posX.toString(),
      posY.toString(),
    ]);
  }

  async submitResearch(villageId: number, techId: number): Promise<string> {
    return this.execute('commands', 'research', [
      villageId.toString(),
      techId.toString(),
    ]);
  }

  async submitTrain(
    villageId: number,
    unitDefId: number,
    count: number,
  ): Promise<string> {
    return this.execute('commands', 'train', [
      villageId.toString(),
      unitDefId.toString(),
      count.toString(),
    ]);
  }

  async submitDemolish(villageId: number, buildingId: number): Promise<string> {
    return this.execute('commands', 'demolish', [
      villageId.toString(),
      buildingId.toString(),
    ]);
  }

  async submitDiplomacy(
    villageId: number,
    targetId: number,
    status: DiplomacyStatus,
  ): Promise<string> {
    return this.execute('commands', 'set_diplomacy', [
      villageId.toString(),
      targetId.toString(),
      status.toString(),
    ]);
  }

  async advanceTick(): Promise<string> {
    return this.execute('commands', 'advance_tick', []);
  }

  // ── Combat ──

  async submitAttack(
    attackerVillage: number,
    defenderVillage: number,
  ): Promise<string> {
    return this.execute('combat', 'attack', [
      attackerVillage.toString(),
      defenderVillage.toString(),
    ]);
  }

  // ── Physics / Setup ──

  async initializePhysics(): Promise<string> {
    return this.execute('physics', 'initialize_physics', []);
  }

  async submitSetupRegisterAll(): Promise<string> {
    return this.execute('setup', 'register_all', []);
  }

  // ── Batch Tick ──

  async submitTickBatch(
    villageIds: number[],
    tradeRouteIds: number[] = [],
  ): Promise<string> {
    const calls: Call[] = [];

    // advance_tick
    calls.push({
      contractAddress: SYSTEM_ADDRESSES.commands,
      entrypoint: 'advance_tick',
      calldata: [],
    });

    // village ticks
    for (const id of villageIds) {
      calls.push({
        contractAddress: SYSTEM_ADDRESSES.village_tick,
        entrypoint: 'tick',
        calldata: [id.toString()],
      });
    }

    // trade tick (if any routes)
    if (tradeRouteIds.length > 0) {
      calls.push({
        contractAddress: SYSTEM_ADDRESSES.trade_sys,
        entrypoint: 'execute_trade_tick',
        calldata: flattenCalldata([tradeRouteIds.map((id) => id.toString())]),
      });
    }

    const { transaction_hash } = await this.account.execute(calls);
    console.log(`[DojoTx] TickBatch (${villageIds.length} villages) → tx: ${transaction_hash}`);
    return transaction_hash;
  }

  // ── Tx confirmation ──

  async waitForTx(txHash: string): Promise<any> {
    return this.provider.waitForTransaction(txHash);
  }

  // ── Internal ──

  private async execute(
    system: SystemName,
    fn_name: string,
    calldata: (string | string[])[],
  ): Promise<string> {
    const contractAddress = SYSTEM_ADDRESSES[system];
    const flat = flattenCalldata(calldata);

    const call: Call = {
      contractAddress,
      entrypoint: fn_name,
      calldata: flat,
    };

    const { transaction_hash } = await this.account.execute(call);
    console.log(`[DojoTx] ${system}.${fn_name} → tx: ${transaction_hash}`);
    return transaction_hash;
  }
}

function flattenCalldata(data: (string | string[])[]): string[] {
  const result: string[] = [];
  for (const item of data) {
    if (Array.isArray(item)) {
      result.push(item.length.toString());
      result.push(...item);
    } else {
      result.push(item);
    }
  }
  return result;
}
