import { describe, test, expect, beforeEach } from "bun:test";
import { AgentPaymentClient } from "../agentPaymentClient.ts";
import { AgentWalletManager } from "../agentWalletManager.ts";
import { PaymentTracker } from "../paymentTracker.ts";
import type { X402Config } from "../x402Config.ts";

const TEST_MNEMONIC = "test test test test test test test test test test test junk";

function createTestConfig(overrides: Partial<X402Config> = {}): X402Config {
  return {
    enabled: true,
    payToAddress: "0x0000000000000000000000000000000000000001",
    network: "eip155:84532",
    facilitatorUrl: "https://x402.org/facilitator",
    agentWalletMnemonic: TEST_MNEMONIC,
    onchainEnabled: false, // offchain by default for tests
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

describe("AgentPaymentClient", () => {
  let walletManager: AgentWalletManager;
  let config: X402Config;

  beforeEach(() => {
    walletManager = new AgentWalletManager(TEST_MNEMONIC);
    config = createTestConfig();
  });

  test("creates without batch settlement when onchain disabled", () => {
    const client = new AgentPaymentClient(walletManager, config);
    expect(client.getBatchStats()).toBeNull();
    client.shutdown();
  });

  test("creates with batch settlement when onchain enabled", () => {
    const client = new AgentPaymentClient(walletManager, createTestConfig({ onchainEnabled: true }));
    const stats = client.getBatchStats();
    expect(stats).not.toBeNull();
    expect(stats!.pendingCount).toBe(0);
    client.shutdown();
  });

  test("pay records payment in tracker", async () => {
    const client = new AgentPaymentClient(walletManager, config);
    const result = await client.pay("village-A", "village-B", "0.001", "agent_trade", 100);
    expect(result).toBe(true);
    client.shutdown();
  });

  test("pay creates wallets for both agents", async () => {
    const client = new AgentPaymentClient(walletManager, config);
    await client.pay("agent-1", "agent-2", "0.005", "agent_alliance", 200);

    expect(walletManager.getAddress("agent-1")).not.toBeNull();
    expect(walletManager.getAddress("agent-2")).not.toBeNull();
    client.shutdown();
  });

  test("pay with relatedEntityId", async () => {
    const client = new AgentPaymentClient(walletManager, config);
    const result = await client.pay("a", "b", "0.01", "agent_trade", 50, "trade-123");
    expect(result).toBe(true);
    client.shutdown();
  });

  test("shutdown is safe to call multiple times", () => {
    const client = new AgentPaymentClient(walletManager, config);
    client.shutdown();
    client.shutdown(); // should not throw
  });
});
