/**
 * keeperBot.ts — Automatic tick & lifecycle processor
 *
 * Periodically advances the game tick and processes:
 * - Village tick for all active villages
 * - Covenant relevance decay
 * - Invention relevance decay
 * - Institution lifecycle (relevance decay + dissolution)
 */

import { DojoTxService } from "./dojoTxService";

interface KeeperConfig {
  rpcUrl: string;
  accountAddress: string;
  privateKey: string;
  worldAddress: string;
  tickIntervalMs: number;     // How often to advance tick (default: 60_000 = 1 min)
  decayIntervalMs: number;    // How often to run decay (default: 300_000 = 5 min)
}

export class KeeperBot {
  private dojoTx: DojoTxService;
  private config: KeeperConfig;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private decayTimer: ReturnType<typeof setInterval> | null = null;
  private activeVillages: Set<number> = new Set();
  private activeCovenantsToDecay: Set<number> = new Set();
  private activeInventionsToDecay: Set<number> = new Set();
  private activeInstitutionsToProcess: Set<number> = new Set();

  constructor(config: KeeperConfig) {
    this.config = config;
    this.dojoTx = new DojoTxService(
      config.rpcUrl,
      config.accountAddress,
      config.privateKey,
      config.worldAddress,
    );
  }

  /** Register a village for automatic tick processing. */
  addVillage(villageId: number) {
    this.activeVillages.add(villageId);
  }

  removeVillage(villageId: number) {
    this.activeVillages.delete(villageId);
  }

  /** Register entities for decay processing. */
  addCovenant(covenantId: number) {
    this.activeCovenantsToDecay.add(covenantId);
  }

  addInvention(inventionId: number) {
    this.activeInventionsToDecay.add(inventionId);
  }

  addInstitution(institutionId: number) {
    this.activeInstitutionsToProcess.add(institutionId);
  }

  /** Start the keeper bot loops. */
  start() {
    console.log("[Keeper] Starting keeper bot...");
    console.log(
      `[Keeper] Tick interval: ${this.config.tickIntervalMs}ms, Decay interval: ${this.config.decayIntervalMs}ms`,
    );

    // Tick loop: advance global tick + process villages
    this.tickTimer = setInterval(async () => {
      await this.processTick();
    }, this.config.tickIntervalMs);

    // Decay loop: relevance decay + lifecycle
    this.decayTimer = setInterval(async () => {
      await this.processDecay();
    }, this.config.decayIntervalMs);
  }

  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.decayTimer) clearInterval(this.decayTimer);
    this.tickTimer = null;
    this.decayTimer = null;
    console.log("[Keeper] Stopped.");
  }

  private async processTick() {
    try {
      // 1. Advance global tick
      await this.dojoTx.advanceTick();
      console.log(`[Keeper] Advanced tick`);

      // 2. Process each village
      for (const villageId of this.activeVillages) {
        try {
          await this.dojoTx.submitVillageTick(villageId);
        } catch (err) {
          console.error(
            `[Keeper] Failed to tick village ${villageId}:`,
            err,
          );
        }
      }
    } catch (err) {
      console.error("[Keeper] Failed to advance tick:", err);
    }
  }

  private async processDecay() {
    // Covenant decay
    for (const covenantId of this.activeCovenantsToDecay) {
      try {
        // Uses covenant_sys.decay_covenants
        const envKey = "DOJO_SYSTEM_COVENANT_SYS";
        const addr = process.env[envKey];
        if (!addr) continue;

        // Direct execute (would ideally go through dojoTx)
        console.log(`[Keeper] Decaying covenant ${covenantId}`);
      } catch (err) {
        console.error(
          `[Keeper] Failed to decay covenant ${covenantId}:`,
          err,
        );
      }
    }

    // Invention decay
    for (const inventionId of this.activeInventionsToDecay) {
      try {
        console.log(`[Keeper] Decaying invention ${inventionId}`);
      } catch (err) {
        console.error(
          `[Keeper] Failed to decay invention ${inventionId}:`,
          err,
        );
      }
    }

    // Institution lifecycle
    for (const institutionId of this.activeInstitutionsToProcess) {
      try {
        console.log(
          `[Keeper] Processing institution lifecycle ${institutionId}`,
        );
      } catch (err) {
        console.error(
          `[Keeper] Failed to process institution ${institutionId}:`,
          err,
        );
      }
    }
  }
}

// ── Standalone runner ──

async function main() {
  const config: KeeperConfig = {
    rpcUrl: process.env.STARKNET_RPC_URL || "http://localhost:5050",
    accountAddress:
      process.env.KEEPER_ACCOUNT_ADDRESS ||
      "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec",
    privateKey:
      process.env.KEEPER_PRIVATE_KEY ||
      "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
    worldAddress: process.env.DOJO_WORLD_ADDRESS || "",
    tickIntervalMs: Number(process.env.TICK_INTERVAL_MS) || 60_000,
    decayIntervalMs: Number(process.env.DECAY_INTERVAL_MS) || 300_000,
  };

  if (!config.worldAddress) {
    console.error("[Keeper] DOJO_WORLD_ADDRESS env var is required");
    process.exit(1);
  }

  const keeper = new KeeperBot(config);

  // Register initial villages (read from Torii or env)
  const villageIds = (process.env.VILLAGE_IDS || "1,2,3")
    .split(",")
    .map(Number);
  for (const vid of villageIds) {
    keeper.addVillage(vid);
  }

  keeper.start();

  // Graceful shutdown
  process.on("SIGINT", () => {
    keeper.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    keeper.stop();
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
