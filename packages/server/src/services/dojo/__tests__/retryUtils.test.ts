import { describe, test, expect } from "bun:test";
import { withRetry } from "../retryUtils.ts";

describe("withRetry", () => {
  test("returns on first success", async () => {
    const result = await withRetry(() => Promise.resolve(42), "test");
    expect(result).toBe(42);
  });

  test("succeeds on second attempt", async () => {
    let attempt = 0;
    const result = await withRetry(
      () => {
        attempt++;
        if (attempt === 1) return Promise.reject(new Error("transient"));
        return Promise.resolve("ok");
      },
      "test",
      { baseDelayMs: 1, maxDelayMs: 10 },
    );
    expect(result).toBe("ok");
    expect(attempt).toBe(2);
  });

  test("throws after maxAttempts exceeded", async () => {
    let attempt = 0;
    try {
      await withRetry(
        () => {
          attempt++;
          return Promise.reject(new Error("always fails"));
        },
        "test",
        { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
      );
      throw new Error("should not reach here");
    } catch (err) {
      expect((err as Error).message).toBe("always fails");
    }
    expect(attempt).toBe(3);
  });

  test("shouldRetry filter causes immediate throw", async () => {
    let attempt = 0;
    try {
      await withRetry(
        () => {
          attempt++;
          return Promise.reject(new Error("non-retryable"));
        },
        "test",
        {
          maxAttempts: 5,
          baseDelayMs: 1,
          shouldRetry: () => false,
        },
      );
      throw new Error("should not reach here");
    } catch (err) {
      expect((err as Error).message).toBe("non-retryable");
    }
    expect(attempt).toBe(1);
  });

  test("delay is capped at maxDelayMs", async () => {
    let attempt = 0;
    const start = performance.now();
    try {
      await withRetry(
        () => {
          attempt++;
          return Promise.reject(new Error("fail"));
        },
        "test",
        { maxAttempts: 4, baseDelayMs: 10, maxDelayMs: 20 },
      );
    } catch { /* expected */ }
    const elapsed = performance.now() - start;
    // 3 delays: 10 + 20 + 20 = 50ms max (capped at 20)
    // Allow generous margin for CI
    expect(elapsed).toBeLessThan(200);
    expect(attempt).toBe(4);
  });
});
