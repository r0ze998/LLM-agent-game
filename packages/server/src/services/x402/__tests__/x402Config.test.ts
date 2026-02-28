import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadX402Config } from "../x402Config.ts";

describe("loadX402Config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("X402_")) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  test("returns disabled config when X402_ENABLED is not set", () => {
    delete process.env.X402_ENABLED;
    const config = loadX402Config();
    expect(config.enabled).toBe(false);
    expect(config.payToAddress).toBe("");
  });

  test("returns disabled config when X402_ENABLED=false", () => {
    process.env.X402_ENABLED = "false";
    const config = loadX402Config();
    expect(config.enabled).toBe(false);
  });

  test("returns enabled config with defaults when X402_ENABLED=true", () => {
    process.env.X402_ENABLED = "true";
    const config = loadX402Config();

    expect(config.enabled).toBe(true);
    expect(config.network).toBe("eip155:84532");
    expect(config.onchainEnabled).toBe(false);
    expect(config.rpcUrl).toBe("https://sepolia.base.org");
    expect(config.pricing.intentionPerCommand).toBe("$0.001");
  });

  test("reads environment variables correctly", () => {
    process.env.X402_ENABLED = "true";
    process.env.X402_PAY_TO_ADDRESS = "0x1234";
    process.env.X402_NETWORK = "eip155:8453";
    process.env.X402_FACILITATOR_URL = "https://custom.facilitator";
    process.env.X402_AGENT_MNEMONIC = "test mnemonic";
    process.env.X402_ONCHAIN_ENABLED = "true";
    process.env.X402_RPC_URL = "https://mainnet.base.org";
    process.env.X402_PRICE_INTENTION = "$0.005";

    const config = loadX402Config();
    expect(config.payToAddress).toBe("0x1234");
    expect(config.network).toBe("eip155:8453");
    expect(config.facilitatorUrl).toBe("https://custom.facilitator");
    expect(config.agentWalletMnemonic).toBe("test mnemonic");
    expect(config.onchainEnabled).toBe(true);
    expect(config.rpcUrl).toBe("https://mainnet.base.org");
    expect(config.pricing.intentionPerCommand).toBe("$0.005");
  });

  test("disabled config still has default pricing", () => {
    delete process.env.X402_ENABLED;
    const config = loadX402Config();
    expect(config.pricing.intentionPerCommand).toBe("$0.001");
    expect(config.pricing.chronicleGeneration).toBe("$0.005");
    expect(config.pricing.biographyGeneration).toBe("$0.003");
    expect(config.pricing.blueprintDeploy).toBe("$0.01");
  });
});
