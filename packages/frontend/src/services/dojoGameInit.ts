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

  // Step 1: Check if already initialized
  const config = await stateReader.readGameConfig();
  console.log(`${LOG_PREFIX} GameConfig: tick=${config.currentTick}, initialized=${config.initialized}`);

  if (!config.initialized) {
    // Step 2: Initialize physics + register definitions
    console.log(`${LOG_PREFIX} Initializing physics...`);
    const tx1 = await txService.initializePhysics();
    await txService.waitForTx(tx1);
    console.log(`${LOG_PREFIX} Physics initialized.`);

    console.log(`${LOG_PREFIX} Registering all definitions...`);
    const tx2 = await txService.submitSetupRegisterAll();
    await txService.waitForTx(tx2);
    console.log(`${LOG_PREFIX} All definitions registered.`);
  }

  // Step 3: Create village
  const villageU32 = villageMapper.register(villageUuid);
  console.log(`${LOG_PREFIX} Creating village on-chain: ${villageUuid} → u32=${villageU32}`);
  const tx3 = await txService.createVillage(account.address);
  await txService.waitForTx(tx3);
  console.log(`${LOG_PREFIX} Village created on-chain.`);

  // Step 4: Initial tick
  console.log(`${LOG_PREFIX} Advancing initial tick...`);
  const tx4 = await txService.advanceTick();
  await txService.waitForTx(tx4);
  const tx5 = await txService.submitVillageTick(villageU32);
  await txService.waitForTx(tx5);
  console.log(`${LOG_PREFIX} Initial tick completed.`);

  return { villageU32 };
}
