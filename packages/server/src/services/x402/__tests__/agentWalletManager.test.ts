import { describe, test, expect } from "bun:test";
import { AgentWalletManager } from "../agentWalletManager.ts";

// Standard test mnemonic (DO NOT use in production)
const TEST_MNEMONIC = "test test test test test test test test test test test junk";

describe("AgentWalletManager", () => {
  test("creates wallet for new agent", () => {
    const mgr = new AgentWalletManager(TEST_MNEMONIC);
    const wallet = mgr.getOrCreate("agent-1");

    expect(wallet.agentId).toBe("agent-1");
    expect(wallet.evmAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(wallet.derivationIndex).toBe(0);
    expect(wallet.account).toBeDefined();
  });

  test("returns same wallet for same agent", () => {
    const mgr = new AgentWalletManager(TEST_MNEMONIC);
    const w1 = mgr.getOrCreate("agent-1");
    const w2 = mgr.getOrCreate("agent-1");

    expect(w1.evmAddress).toBe(w2.evmAddress);
    expect(w1.derivationIndex).toBe(w2.derivationIndex);
  });

  test("creates different wallets for different agents", () => {
    const mgr = new AgentWalletManager(TEST_MNEMONIC);
    const w1 = mgr.getOrCreate("agent-1");
    const w2 = mgr.getOrCreate("agent-2");

    expect(w1.evmAddress).not.toBe(w2.evmAddress);
    expect(w1.derivationIndex).toBe(0);
    expect(w2.derivationIndex).toBe(1);
  });

  test("assigns sequential derivation indices", () => {
    const mgr = new AgentWalletManager(TEST_MNEMONIC);
    for (let i = 0; i < 5; i++) {
      const w = mgr.getOrCreate(`agent-${i}`);
      expect(w.derivationIndex).toBe(i);
    }
  });

  test("getAddress returns address for existing agent", () => {
    const mgr = new AgentWalletManager(TEST_MNEMONIC);
    mgr.getOrCreate("agent-1");
    expect(mgr.getAddress("agent-1")).toMatch(/^0x/);
  });

  test("getAddress returns null for unknown agent", () => {
    const mgr = new AgentWalletManager(TEST_MNEMONIC);
    expect(mgr.getAddress("unknown")).toBeNull();
  });

  test("getSigner returns account for existing agent", () => {
    const mgr = new AgentWalletManager(TEST_MNEMONIC);
    mgr.getOrCreate("agent-1");
    const signer = mgr.getSigner("agent-1");
    expect(signer).not.toBeNull();
    expect(signer!.address).toMatch(/^0x/);
  });

  test("getSigner returns null for unknown agent", () => {
    const mgr = new AgentWalletManager(TEST_MNEMONIC);
    expect(mgr.getSigner("unknown")).toBeNull();
  });

  test("getAll returns all created wallets", () => {
    const mgr = new AgentWalletManager(TEST_MNEMONIC);
    mgr.getOrCreate("a");
    mgr.getOrCreate("b");
    mgr.getOrCreate("c");

    const all = mgr.getAll();
    expect(all).toHaveLength(3);
    expect(new Set(all.map(w => w.agentId))).toEqual(new Set(["a", "b", "c"]));
  });

  test("deterministic: same mnemonic always produces same addresses", () => {
    const mgr1 = new AgentWalletManager(TEST_MNEMONIC);
    const mgr2 = new AgentWalletManager(TEST_MNEMONIC);

    const w1 = mgr1.getOrCreate("agent-x");
    const w2 = mgr2.getOrCreate("agent-x");

    expect(w1.evmAddress).toBe(w2.evmAddress);
  });
});
