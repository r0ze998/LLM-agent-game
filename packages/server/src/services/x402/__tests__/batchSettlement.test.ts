import { describe, test, expect, beforeEach } from "bun:test";
import { BatchSettlement } from "../batchSettlement.ts";
import { AgentWalletManager } from "../agentWalletManager.ts";
import type { X402Config } from "../x402Config.ts";

const TEST_MNEMONIC = "test test test test test test test test test test test junk";

function createTestConfig(overrides: Partial<X402Config> = {}): X402Config {
  return {
    enabled: true,
    payToAddress: "0x0000000000000000000000000000000000000001",
    network: "eip155:84532",
    facilitatorUrl: "https://x402.org/facilitator",
    agentWalletMnemonic: TEST_MNEMONIC,
    onchainEnabled: false,
    rpcUrl: "https://sepolia.base.org",
    pricing: {
      intentionPerCommand: "$0.001",
      chronicleGeneration: "$0.005",
      biographyGeneration: "$0.003",
      blueprintDeploy: "$0.01",
    },
    ...overrides,
  };
}

describe("BatchSettlement", () => {
  let walletManager: AgentWalletManager;
  let config: X402Config;

  beforeEach(() => {
    walletManager = new AgentWalletManager(TEST_MNEMONIC);
    config = createTestConfig();
  });

  test("initial stats are empty", () => {
    const batch = new BatchSettlement(walletManager, config);
    const stats = batch.getStats();
    expect(stats.pendingCount).toBe(0);
    expect(stats.pendingTotalUSD).toBe(0);
    expect(stats.settledBatchCount).toBe(0);
    expect(stats.settledTotalUSD).toBe(0);
    expect(stats.lastFlushTimestamp).toBeNull();
  });

  test("enqueue adds to pending", async () => {
    const batch = new BatchSettlement(walletManager, config);
    await batch.enqueue("agent-1", "0x1234567890123456789012345678901234567890", "0.005");

    const stats = batch.getStats();
    expect(stats.pendingCount).toBe(1);
    expect(stats.pendingTotalUSD).toBeCloseTo(0.005);
  });

  test("flush settles pending payments (offchain)", async () => {
    const batch = new BatchSettlement(walletManager, config);
    await batch.enqueue("agent-1", "0x1234567890123456789012345678901234567890", "0.005");
    await batch.enqueue("agent-2", "0x1234567890123456789012345678901234567890", "0.003");

    const settled = await batch.flush();
    expect(settled).toBe(1); // aggregated to 1 destination

    const stats = batch.getStats();
    expect(stats.settledBatchCount).toBe(1);
    expect(stats.settledTotalUSD).toBeCloseTo(0.008);
    expect(stats.lastFlushTimestamp).not.toBeNull();
  });

  test("flush carries over sub-threshold amounts", async () => {
    const batch = new BatchSettlement(walletManager, config);
    // Amount below MIN_SETTLEMENT_USD (0.001)
    await batch.enqueue("agent-1", "0x1234567890123456789012345678901234567890", "0.0005");

    const settled = await batch.flush();
    expect(settled).toBe(0); // nothing settled

    const stats = batch.getStats();
    expect(stats.pendingCount).toBe(1); // carried over
  });

  test("flush aggregates by destination address", async () => {
    const batch = new BatchSettlement(walletManager, config);
    const addr1 = "0x1111111111111111111111111111111111111111";
    const addr2 = "0x2222222222222222222222222222222222222222";

    await batch.enqueue("agent-1", addr1, "0.002");
    await batch.enqueue("agent-2", addr1, "0.003");
    await batch.enqueue("agent-3", addr2, "0.004");

    const settled = await batch.flush();
    expect(settled).toBe(2); // 2 distinct destinations

    const stats = batch.getStats();
    expect(stats.settledTotalUSD).toBeCloseTo(0.009);
  });

  test("flush with no pending returns 0", async () => {
    const batch = new BatchSettlement(walletManager, config);
    const settled = await batch.flush();
    expect(settled).toBe(0);
  });

  test("start and stop lifecycle", () => {
    const batch = new BatchSettlement(walletManager, config);
    batch.start();
    batch.stop();
    // should not throw
    batch.stop();
  });
});
