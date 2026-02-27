import { describe, test, expect } from "bun:test";
import { DojoSyncChecker, type DriftReport } from "../dojoSyncChecker.ts";
import { VillageIdMapper } from "../dojoSync.ts";
import type { VillageState4X } from "@murasato/shared";
import type { OnChainVillage } from "../dojoStateReader.ts";

/** Mock DojoStateReader that returns controlled data */
function createMockReader(
  villages: Map<number, OnChainVillage | null>,
) {
  return {
    readVillage: async (u32: number): Promise<OnChainVillage | null> => {
      return villages.get(u32) ?? null;
    },
  } as any;
}

function createVillageState(overrides?: Partial<VillageState4X>): VillageState4X {
  return {
    villageId: "test-uuid",
    population: 100,
    housingCapacity: 120,
    resources: { food: 500, wood: 300, stone: 200, iron: 100, gold: 50 },
    buildings: [],
    buildQueue: [],
    researchQueue: [],
    researchedTechs: new Set(),
    researchPoints: 10,
    culturePoints: 5,
    army: { units: [] },
    trainQueue: [],
    score: 1000,
    ...overrides,
  } as VillageState4X;
}

function createOnChainVillage(overrides?: Partial<OnChainVillage>): OnChainVillage {
  return {
    food: 500,
    wood: 300,
    stone: 200,
    iron: 100,
    gold: 50,
    population: 100,
    housing: 120,
    researchPoints: 10,
    culturePoints: 5,
    score: 1000,
    ...overrides,
  } as OnChainVillage;
}

describe("DojoSyncChecker", () => {
  test("returns empty array when in sync", async () => {
    const mapper = new VillageIdMapper();
    mapper.register("v1");

    const reader = createMockReader(new Map([[1, createOnChainVillage()]]));
    const checker = new DojoSyncChecker(reader, mapper, { driftThreshold: 0.05 });

    const states = new Map<string, VillageState4X>();
    states.set("v1", createVillageState());

    const reports = await checker.runCheck(states, 100);
    expect(reports).toHaveLength(0);
  });

  test("detects drift above threshold", async () => {
    const mapper = new VillageIdMapper();
    mapper.register("v1");

    // 20% drift on food (500 vs 600)
    const reader = createMockReader(
      new Map([[1, createOnChainVillage({ food: 600 })]]),
    );
    const checker = new DojoSyncChecker(reader, mapper, { driftThreshold: 0.05 });

    const states = new Map<string, VillageState4X>();
    states.set("v1", createVillageState());

    const reports = await checker.runCheck(states, 100);
    expect(reports).toHaveLength(1);
    expect(reports[0].villageUuid).toBe("v1");
    expect(reports[0].drifts.length).toBeGreaterThan(0);
    expect(reports[0].drifts[0].field).toBe("food");
    expect(reports[0].repaired).toBe(false);
  });

  test("autoRepair overwrites off-chain with on-chain", async () => {
    const mapper = new VillageIdMapper();
    mapper.register("v1");

    const reader = createMockReader(
      new Map([[1, createOnChainVillage({ food: 999, wood: 888 })]]),
    );
    const checker = new DojoSyncChecker(reader, mapper, {
      driftThreshold: 0.05,
      autoRepair: true,
    });

    const vs = createVillageState();
    const states = new Map<string, VillageState4X>();
    states.set("v1", vs);

    const reports = await checker.runCheck(states, 100);
    expect(reports).toHaveLength(1);
    expect(reports[0].repaired).toBe(true);
    // Off-chain should now match on-chain
    expect(vs.resources.food).toBe(999);
    expect(vs.resources.wood).toBe(888);
  });

  test("skips unmapped villages", async () => {
    const mapper = new VillageIdMapper();
    mapper.register("v1");
    // v2 is not registered

    const reader = createMockReader(new Map([[1, createOnChainVillage()]]));
    const checker = new DojoSyncChecker(reader, mapper);

    const states = new Map<string, VillageState4X>();
    states.set("v1", createVillageState());
    states.set("v2", createVillageState()); // unmapped, should be skipped

    const reports = await checker.runCheck(states, 100);
    expect(reports).toHaveLength(0);
  });

  test("handles readVillage errors gracefully", async () => {
    const mapper = new VillageIdMapper();
    mapper.register("v1");

    const reader = {
      readVillage: async () => {
        throw new Error("RPC down");
      },
    } as any;

    const checker = new DojoSyncChecker(reader, mapper);
    const states = new Map<string, VillageState4X>();
    states.set("v1", createVillageState());

    // Should not throw
    const reports = await checker.runCheck(states, 100);
    expect(reports).toHaveLength(0);
  });

  test("report buffer caps at 50", async () => {
    const mapper = new VillageIdMapper();
    mapper.register("v1");

    const reader = createMockReader(
      new Map([[1, createOnChainVillage({ food: 9999 })]]),
    );
    const checker = new DojoSyncChecker(reader, mapper, { driftThreshold: 0.01 });
    const states = new Map<string, VillageState4X>();

    for (let i = 0; i < 60; i++) {
      states.set("v1", createVillageState());
      await checker.runCheck(states, i);
    }

    const reports = checker.getReports();
    expect(reports).toHaveLength(50);
  });
});
