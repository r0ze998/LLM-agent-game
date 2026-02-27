import { describe, test, expect } from "bun:test";
import { hash } from "starknet";
import { parseReceiptEvents, type DojoGameEvent } from "../dojoEventParser.ts";

// Helper: build a mock event with the proper selector in keys[0]
function mockEvent(name: string, extraKeys: string[], data: string[]) {
  const selector = hash.getSelectorFromName(name);
  return { keys: [selector, ...extraKeys], data };
}

function toHex(n: number | bigint): string {
  return "0x" + BigInt(n).toString(16);
}

describe("parseReceiptEvents", () => {
  test("returns empty for empty input", () => {
    expect(parseReceiptEvents([])).toEqual([]);
  });

  test("skips events with unknown selectors", () => {
    const events = [{ keys: ["0xdeadbeef"], data: ["0x1"] }];
    expect(parseReceiptEvents(events)).toEqual([]);
  });

  test("skips events with empty keys", () => {
    const events = [{ keys: [], data: ["0x1"] }];
    expect(parseReceiptEvents(events)).toEqual([]);
  });

  test("parses VillageTicked event", () => {
    const villageId = 5;
    const tick = 100;
    const foodDelta = 1500; // ×1000 fixed → 1.5
    const popDelta = 2;

    const ev = mockEvent("VillageTicked", [toHex(villageId)], [
      toHex(tick),
      toHex(foodDelta),
      toHex(popDelta),
    ]);

    const parsed = parseReceiptEvents([ev]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe("VillageTicked");
    const vt = parsed[0] as Extract<DojoGameEvent, { kind: "VillageTicked" }>;
    expect(vt.villageId).toBe(5);
    expect(vt.tick).toBe(100);
    expect(vt.foodDelta).toBeCloseTo(1.5, 3);
    expect(vt.populationDelta).toBe(2);
  });

  test("parses CombatResolved event", () => {
    const ev = mockEvent(
      "CombatResolved",
      [toHex(1), toHex(2)], // attacker, defender
      [toHex(50), toHex(1000), toHex(800), toHex(1)], // tick, atk_power, def_power, atk_won
    );

    const parsed = parseReceiptEvents([ev]);
    expect(parsed).toHaveLength(1);
    const cr = parsed[0] as Extract<DojoGameEvent, { kind: "CombatResolved" }>;
    expect(cr.kind).toBe("CombatResolved");
    expect(cr.attackerVillage).toBe(1);
    expect(cr.defenderVillage).toBe(2);
    expect(cr.tick).toBe(50);
    expect(cr.attackerWon).toBe(true);
  });

  test("parses VictoryAchieved event", () => {
    const ev = mockEvent(
      "VictoryAchieved",
      [toHex(3)], // village_id
      [toHex(2), toHex(500)], // victory_type=cultural, tick
    );

    const parsed = parseReceiptEvents([ev]);
    expect(parsed).toHaveLength(1);
    const va = parsed[0] as Extract<DojoGameEvent, { kind: "VictoryAchieved" }>;
    expect(va.kind).toBe("VictoryAchieved");
    expect(va.villageId).toBe(3);
    expect(va.victoryType).toBe(2);
    expect(va.tick).toBe(500);
  });

  test("parses TradeProposed event", () => {
    const ev = mockEvent(
      "TradeProposed",
      [toHex(10)], // trade_id
      [toHex(1), toHex(2), toHex(42)], // from, to, tick
    );

    const parsed = parseReceiptEvents([ev]);
    expect(parsed).toHaveLength(1);
    const tp = parsed[0] as Extract<DojoGameEvent, { kind: "TradeProposed" }>;
    expect(tp.kind).toBe("TradeProposed");
    expect(tp.tradeId).toBe(10);
    expect(tp.fromVillage).toBe(1);
    expect(tp.toVillage).toBe(2);
    expect(tp.tick).toBe(42);
  });

  test("parses TradeAccepted event", () => {
    const ev = mockEvent(
      "TradeAccepted",
      [toHex(7)],
      [toHex(3), toHex(4), toHex(99)],
    );

    const parsed = parseReceiptEvents([ev]);
    expect(parsed).toHaveLength(1);
    const ta = parsed[0] as Extract<DojoGameEvent, { kind: "TradeAccepted" }>;
    expect(ta.kind).toBe("TradeAccepted");
    expect(ta.tradeId).toBe(7);
    expect(ta.fromVillage).toBe(3);
    expect(ta.toVillage).toBe(4);
  });

  test("parses TradeExecuted event", () => {
    const ev = mockEvent(
      "TradeExecuted",
      [toHex(15)], // route_id
      [toHex(5), toHex(6), toHex(200)],
    );

    const parsed = parseReceiptEvents([ev]);
    expect(parsed).toHaveLength(1);
    const te = parsed[0] as Extract<DojoGameEvent, { kind: "TradeExecuted" }>;
    expect(te.kind).toBe("TradeExecuted");
    expect(te.routeId).toBe(15);
    expect(te.fromVillage).toBe(5);
    expect(te.toVillage).toBe(6);
    expect(te.tick).toBe(200);
  });

  test("parses CovenantEnacted event", () => {
    const ev = mockEvent(
      "CovenantEnacted",
      [toHex(1)], // covenant_id
      [toHex(2), "0xabcd", toHex(30)], // village_id, name_hash, tick
    );

    const parsed = parseReceiptEvents([ev]);
    expect(parsed).toHaveLength(1);
    const ce = parsed[0] as Extract<DojoGameEvent, { kind: "CovenantEnacted" }>;
    expect(ce.kind).toBe("CovenantEnacted");
    expect(ce.covenantId).toBe(1);
    expect(ce.villageId).toBe(2);
    expect(ce.nameHash).toBe("0xabcd");
  });

  test("skips events with insufficient keys/data", () => {
    // VillageTicked needs keys[1] and data[0..2]
    const ev1 = mockEvent("VillageTicked", [], [toHex(1)]); // missing keys[1]
    const ev2 = mockEvent("VillageTicked", [toHex(1)], [toHex(1)]); // data too short
    expect(parseReceiptEvents([ev1, ev2])).toEqual([]);
  });

  test("parses multiple events in one receipt", () => {
    const events = [
      mockEvent("TradeProposed", [toHex(1)], [toHex(10), toHex(20), toHex(5)]),
      mockEvent("VillageTicked", [toHex(10)], [toHex(5), toHex(500), toHex(1)]),
      { keys: ["0xunknown"], data: [] }, // unknown, should be skipped
      mockEvent("TradeAccepted", [toHex(1)], [toHex(10), toHex(20), toHex(6)]),
    ];

    const parsed = parseReceiptEvents(events);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].kind).toBe("TradeProposed");
    expect(parsed[1].kind).toBe("VillageTicked");
    expect(parsed[2].kind).toBe("TradeAccepted");
  });
});
