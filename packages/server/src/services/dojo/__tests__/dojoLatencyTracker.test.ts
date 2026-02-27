import { describe, test, expect } from "bun:test";
import { DojoLatencyTracker } from "../dojoLatencyTracker.ts";

describe("DojoLatencyTracker", () => {
  test("initial metrics are zero", () => {
    const tracker = new DojoLatencyTracker();
    const m = tracker.getMetrics();
    expect(m.avg).toBe(0);
    expect(m.p95).toBe(0);
    expect(m.max).toBe(0);
    expect(m.sampleCount).toBe(0);
    expect(m.successRate).toBe(1);
  });

  test("records and computes avg correctly", () => {
    const tracker = new DojoLatencyTracker();
    tracker.record(100);
    tracker.record(200);
    tracker.record(300);
    const m = tracker.getMetrics();
    expect(m.avg).toBe(200);
    expect(m.sampleCount).toBe(3);
    expect(m.max).toBe(300);
  });

  test("p95 works with enough samples", () => {
    const tracker = new DojoLatencyTracker();
    // 20 samples: 1..20
    for (let i = 1; i <= 20; i++) {
      tracker.record(i * 10);
    }
    const m = tracker.getMetrics();
    expect(m.avg).toBe(105); // (10+20+...+200)/20 = 2100/20
    expect(m.p95).toBe(200); // sorted[floor(20*0.95)] = sorted[19] = 200
    expect(m.max).toBe(200);
    expect(m.sampleCount).toBe(20);
  });

  test("circular buffer wraps at 100 samples", () => {
    const tracker = new DojoLatencyTracker();
    // Record 150 samples — first 50 should be overwritten
    for (let i = 1; i <= 150; i++) {
      tracker.record(i);
    }
    const m = tracker.getMetrics();
    expect(m.sampleCount).toBe(150);
    // Buffer should contain 51..150 (the last 100)
    expect(m.max).toBe(150);
    // Min in buffer should be 51
    const expectedAvg = (51 + 150) / 2; // 100.5
    expect(Math.abs(m.avg - expectedAvg)).toBeLessThan(0.01);
  });

  test("recordFailure affects success rate", () => {
    const tracker = new DojoLatencyTracker();
    tracker.record(100);
    tracker.record(200);
    tracker.recordFailure();
    const m = tracker.getMetrics();
    expect(m.sampleCount).toBe(3);
    expect(m.successRate).toBeCloseTo(2 / 3, 2);
  });

  test("getRecommendedInterval returns base when < 5 samples", () => {
    const tracker = new DojoLatencyTracker();
    tracker.record(1000);
    tracker.record(2000);
    expect(tracker.getRecommendedInterval(500)).toBe(500);
  });

  test("getRecommendedInterval returns max(base, p95*1.5)", () => {
    const tracker = new DojoLatencyTracker();
    // 10 samples all at 200ms
    for (let i = 0; i < 10; i++) {
      tracker.record(200);
    }
    // p95 = 200, recommended = max(100, 200*1.5) = 300
    expect(tracker.getRecommendedInterval(100)).toBe(300);
    // base > p95*1.5 → base wins
    expect(tracker.getRecommendedInterval(500)).toBe(500);
  });
});
