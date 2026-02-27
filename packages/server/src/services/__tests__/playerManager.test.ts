import { describe, test, expect, beforeEach } from "bun:test";
import { PlayerManager } from "../playerManager.ts";

describe("PlayerManager", () => {
  let pm: PlayerManager;

  beforeEach(() => {
    pm = new PlayerManager();
  });

  test("register links address to village", () => {
    pm.register("0xabc", "village-1");
    expect(pm.getVillageByAddress("0xabc")).toBe("village-1");
    expect(pm.getAddressByVillage("village-1")).toBe("0xabc");
  });

  test("isVillageOwner returns true for owner", () => {
    pm.register("0xabc", "village-1");
    expect(pm.isVillageOwner("0xabc", "village-1")).toBe(true);
  });

  test("isVillageOwner returns false for non-owner", () => {
    pm.register("0xabc", "village-1");
    expect(pm.isVillageOwner("0xdef", "village-1")).toBe(false);
  });

  test("isVillageOwner returns false for unregistered", () => {
    expect(pm.isVillageOwner("0xabc", "village-1")).toBe(false);
  });

  test("unregister removes the mapping", () => {
    pm.register("0xabc", "village-1");
    pm.unregister("0xabc");
    expect(pm.getVillageByAddress("0xabc")).toBeUndefined();
    expect(pm.getAddressByVillage("village-1")).toBeUndefined();
  });

  test("multiple registrations work", () => {
    pm.register("0xaaa", "village-1");
    pm.register("0xbbb", "village-2");
    expect(pm.getVillageByAddress("0xaaa")).toBe("village-1");
    expect(pm.getVillageByAddress("0xbbb")).toBe("village-2");
    expect(pm.isVillageOwner("0xaaa", "village-2")).toBe(false);
  });
});
