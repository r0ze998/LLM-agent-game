import { describe, test, expect } from "bun:test";
import { bridgeDojoEvents, extractCombatEvents, extractVictoryEvents } from "../dojoEventBridge.ts";
import { VillageIdMapper } from "../dojoSync.ts";
import type { DojoGameEvent, TradeProposedEvent, CombatResolvedEvent, VictoryAchievedEvent } from "../dojoEventParser.ts";

function createMapper(): VillageIdMapper {
  const mapper = new VillageIdMapper();
  // Register some test villages
  mapper.register("village-a"); // → 1
  mapper.register("village-b"); // → 2
  mapper.register("village-c"); // → 3
  return mapper;
}

describe("bridgeDojoEvents", () => {
  test("returns empty for empty input", () => {
    const mapper = createMapper();
    expect(bridgeDojoEvents([], "game1", 10, mapper)).toEqual([]);
  });

  test("converts TradeProposed to GameEvent", () => {
    const mapper = createMapper();
    const events: DojoGameEvent[] = [
      {
        kind: "TradeProposed",
        tradeId: 1,
        fromVillage: 1,
        toVillage: 2,
        tick: 42,
      } as TradeProposedEvent,
    ];

    const result = bridgeDojoEvents(events, "game1", 42, mapper);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("trade");
    expect(result[0].data._origin).toBe("onchain");
    expect(result[0].data.type).toBe("trade_proposed");
    expect(result[0].data.fromVillage).toBe("village-a");
    expect(result[0].data.toVillage).toBe("village-b");
  });

  test("skips events with unmapped village IDs", () => {
    const mapper = createMapper();
    const events: DojoGameEvent[] = [
      {
        kind: "TradeProposed",
        tradeId: 1,
        fromVillage: 999, // not mapped
        toVillage: 2,
        tick: 10,
      } as TradeProposedEvent,
    ];

    const result = bridgeDojoEvents(events, "game1", 10, mapper);
    expect(result).toHaveLength(0);
  });

  test("converts CombatResolved to GameEvent", () => {
    const mapper = createMapper();
    const events: DojoGameEvent[] = [
      {
        kind: "CombatResolved",
        attackerVillage: 1,
        defenderVillage: 3,
        tick: 50,
        attackerPower: 100,
        defenderPower: 80,
        attackerWon: true,
      } as CombatResolvedEvent,
    ];

    const result = bridgeDojoEvents(events, "game1", 50, mapper);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("war");
    expect(result[0].data._origin).toBe("onchain");
    expect(result[0].data.combatResult).toBeDefined();
    expect((result[0].data.combatResult as any).attackerWon).toBe(true);
  });

  test("converts VictoryAchieved to GameEvent", () => {
    const mapper = createMapper();
    const events: DojoGameEvent[] = [
      {
        kind: "VictoryAchieved",
        villageId: 2,
        victoryType: 2, // cultural
        tick: 1000,
      } as VictoryAchievedEvent,
    ];

    const result = bridgeDojoEvents(events, "game1", 1000, mapper);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("discovery");
    expect(result[0].data.victory).toBeDefined();
    expect((result[0].data.victory as any).victoryType).toBe("cultural");
  });

  test("all converted events have _origin='onchain'", () => {
    const mapper = createMapper();
    const events: DojoGameEvent[] = [
      { kind: "TradeProposed", tradeId: 1, fromVillage: 1, toVillage: 2, tick: 1 } as TradeProposedEvent,
      { kind: "CombatResolved", attackerVillage: 1, defenderVillage: 2, tick: 2, attackerPower: 10, defenderPower: 5, attackerWon: true } as CombatResolvedEvent,
    ];

    const result = bridgeDojoEvents(events, "game1", 1, mapper);
    for (const ev of result) {
      expect(ev.data._origin).toBe("onchain");
    }
  });
});

describe("extractCombatEvents", () => {
  test("filters only CombatResolved events", () => {
    const events: DojoGameEvent[] = [
      { kind: "TradeProposed", tradeId: 1, fromVillage: 1, toVillage: 2, tick: 1 } as TradeProposedEvent,
      { kind: "CombatResolved", attackerVillage: 1, defenderVillage: 2, tick: 2, attackerPower: 10, defenderPower: 5, attackerWon: true } as CombatResolvedEvent,
    ];
    const combat = extractCombatEvents(events);
    expect(combat).toHaveLength(1);
    expect(combat[0].kind).toBe("CombatResolved");
  });
});

describe("extractVictoryEvents", () => {
  test("filters only VictoryAchieved events", () => {
    const events: DojoGameEvent[] = [
      { kind: "VictoryAchieved", villageId: 1, victoryType: 3, tick: 100 } as VictoryAchievedEvent,
      { kind: "TradeProposed", tradeId: 1, fromVillage: 1, toVillage: 2, tick: 1 } as TradeProposedEvent,
    ];
    const victory = extractVictoryEvents(events);
    expect(victory).toHaveLength(1);
    expect(victory[0].villageId).toBe(1);
  });
});
