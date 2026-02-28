import { describe, test, expect, beforeEach } from "bun:test";
import { PaymentTracker } from "../paymentTracker.ts";

describe("PaymentTracker", () => {
  let tracker: PaymentTracker;

  beforeEach(() => {
    tracker = new PaymentTracker();
  });

  test("initial state is empty", () => {
    expect(tracker.getCount()).toBe(0);
    expect(tracker.getTotalRevenue()).toBe(0);
    expect(tracker.getRecent()).toEqual([]);
  });

  test("records a payment and returns it with id and timestamp", () => {
    const record = tracker.record({
      fromAddress: "0xaaa",
      toAddress: "0xbbb",
      amount: "0.001",
      network: "eip155:84532",
      purpose: "agent_trade",
      tick: 100,
    });

    expect(record.id).toMatch(/^pay_/);
    expect(record.timestamp).toBeGreaterThan(0);
    expect(record.fromAddress).toBe("0xaaa");
    expect(record.toAddress).toBe("0xbbb");
    expect(record.amount).toBe("0.001");
    expect(record.purpose).toBe("agent_trade");
    expect(record.tick).toBe(100);
  });

  test("getCount tracks number of records", () => {
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "0.01", network: "eip155:84532", purpose: "agent_trade", tick: 1 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xc", amount: "0.02", network: "eip155:84532", purpose: "agent_alliance", tick: 2 });
    expect(tracker.getCount()).toBe(2);
  });

  test("getTotalRevenue sums all amounts", () => {
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "0.001", network: "n", purpose: "agent_trade", tick: 1 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "0.002", network: "n", purpose: "agent_trade", tick: 2 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "0.003", network: "n", purpose: "agent_alliance", tick: 3 });
    expect(tracker.getTotalRevenue()).toBeCloseTo(0.006, 10);
  });

  test("getRecent returns latest records, ordered chronologically", () => {
    for (let i = 0; i < 10; i++) {
      tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: `${i}`, network: "n", purpose: "agent_trade", tick: i });
    }
    const recent = tracker.getRecent(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].amount).toBe("7");
    expect(recent[2].amount).toBe("9");
  });

  test("getByPurpose filters correctly", () => {
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "1", network: "n", purpose: "agent_trade", tick: 1 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "2", network: "n", purpose: "agent_alliance", tick: 2 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "3", network: "n", purpose: "agent_trade", tick: 3 });

    const trades = tracker.getByPurpose("agent_trade");
    expect(trades).toHaveLength(2);
    expect(trades.every(r => r.purpose === "agent_trade")).toBe(true);
  });

  test("getByAgent filters by relatedEntityId or fromAddress", () => {
    tracker.record({ fromAddress: "agent-1", toAddress: "0xb", amount: "1", network: "n", purpose: "agent_trade", tick: 1 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "2", network: "n", purpose: "agent_trade", relatedEntityId: "agent-1", tick: 2 });
    tracker.record({ fromAddress: "0xc", toAddress: "0xd", amount: "3", network: "n", purpose: "agent_trade", tick: 3 });

    const result = tracker.getByAgent("agent-1");
    expect(result).toHaveLength(2);
  });

  test("getRevenueByAddress aggregates by toAddress", () => {
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "0.01", network: "n", purpose: "agent_trade", tick: 1 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "0.02", network: "n", purpose: "agent_trade", tick: 2 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xc", amount: "0.05", network: "n", purpose: "agent_trade", tick: 3 });

    const revenue = tracker.getRevenueByAddress();
    expect(revenue.get("0xb")).toBeCloseTo(0.03, 10);
    expect(revenue.get("0xc")).toBeCloseTo(0.05, 10);
  });

  test("getRevenueByEntity aggregates by relatedEntityId", () => {
    tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "0.01", network: "n", purpose: "agent_trade", relatedEntityId: "village-1", tick: 1 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xc", amount: "0.02", network: "n", purpose: "agent_trade", relatedEntityId: "village-1", tick: 2 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xd", amount: "0.05", network: "n", purpose: "agent_trade", relatedEntityId: "village-2", tick: 3 });
    tracker.record({ fromAddress: "0xa", toAddress: "0xe", amount: "0.10", network: "n", purpose: "agent_trade", tick: 4 }); // no entity

    const revenue = tracker.getRevenueByEntity();
    expect(revenue.get("village-1")).toBeCloseTo(0.03, 10);
    expect(revenue.get("village-2")).toBeCloseTo(0.05, 10);
    expect(revenue.has("0xe")).toBe(false); // no relatedEntityId
  });

  test("evicts old records when exceeding 10,000 limit", () => {
    for (let i = 0; i < 10_001; i++) {
      tracker.record({ fromAddress: "0xa", toAddress: "0xb", amount: "0.001", network: "n", purpose: "agent_trade", tick: i });
    }
    // After eviction: should keep last 5,000
    expect(tracker.getCount()).toBe(5_000);
  });
});
