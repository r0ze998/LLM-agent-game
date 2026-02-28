/**
 * dojoGameInit.ts — オンチェーンゲーム初期化シーケンス
 *
 * 1. readGameConfig() でチェーン初期化済みか確認
 * 2. 未初期化なら initializePhysics() + submitSetupRegisterAll()
 * 3. createVillage(ownerAddress) → villageMapper に登録
 * 4. 初回 advanceTick() + submitVillageTick(villageId)
 */

import type { Account, RpcProvider } from 'starknet';
import { DojoTxService } from './dojoTxService.ts';
import { DojoStateReader } from './dojoStateReader.ts';
import { VillageIdMapper } from './dojoSync.ts';
import { WORLD_ADDRESS } from './dojoConfig.ts';

const LOG_PREFIX = '[DojoGameInit]';

export async function initializeOnChain(
  account: Account,
  provider: RpcProvider,
  villageMapper: VillageIdMapper,
  villageUuid: string,
): Promise<{ villageU32: number }> {
  const txService = new DojoTxService(account, provider);
  const stateReader = new DojoStateReader(provider, WORLD_ADDRESS);

  console.log(`${LOG_PREFIX} Starting on-chain initialization...`);

  // Step 1: Check if already initialized
  const config = await stateReader.readGameConfig();

  if (!config.initialized) {
    // Step 2: Initialize physics + register definitions
    const tx1 = await txService.initializePhysics();
    await txService.waitForTx(tx1);

    const tx2 = await txService.submitSetupRegisterAll();
    await txService.waitForTx(tx2);
  }

  // Step 3: Create village
  const villageU32 = villageMapper.register(villageUuid);
  const tx3 = await txService.createVillage(account.address);
  await txService.waitForTx(tx3);

  // Step 4: Initial tick
  const tx4 = await txService.advanceTick();
  await txService.waitForTx(tx4);
  const tx5 = await txService.submitVillageTick(villageU32);
  await txService.waitForTx(tx5);

  console.log(`${LOG_PREFIX} Initialization complete (village u32=${villageU32})`);

  return { villageU32 };
}
