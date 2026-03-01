/**
 * dojoTickAdvancer.ts — Automatic tick advancement
 *
 * Uses setInterval to execute advance_tick + all village ticks via multicall.
 */

import { DojoTxService } from './dojoTxService.ts';
import { VillageIdMapper } from './dojoSync.ts';

const LOG_PREFIX = '[DojoTick]';

export class DojoTickAdvancer {
  private txService: DojoTxService;
  private villageMapper: VillageIdMapper;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(txService: DojoTxService, villageMapper: VillageIdMapper) {
    this.txService = txService;
    this.villageMapper = villageMapper;
  }

  /** Start automatic tick advancement */
  start(intervalMs = 3000): void {
    if (this.intervalId !== null) return;
    console.log(`${LOG_PREFIX} Auto-tick started (${intervalMs}ms)`);

    this.intervalId = setInterval(() => {
      this.tick().catch((err) =>
        console.warn(`${LOG_PREFIX} Tick error:`, err),
      );
    }, intervalMs);
  }

  /** Stop automatic tick advancement */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`${LOG_PREFIX} Auto-tick stopped`);
    }
  }

  /** Execute a single tick */
  private async tick(): Promise<void> {
    if (this.running) return; // Skip if previous tick still in progress
    this.running = true;

    try {
      const villageIds = this.villageMapper.entries().map(([, u32]) => u32);
      if (villageIds.length === 0) {
        // Just advance tick even if no villages
        const txHash = await this.txService.advanceTick();
        await this.txService.waitForTx(txHash);
      } else {
        // Use batch tick: advance + all village ticks in one TX
        const txHash = await this.txService.submitTickBatch(villageIds);
        await this.txService.waitForTx(txHash);
      }
    } finally {
      this.running = false;
    }
  }
}
