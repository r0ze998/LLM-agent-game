/**
 * dojoLatencyTracker.ts — TX confirmation latency measurement (F9)
 *
 * Maintains a circular buffer of the last 100 samples and
 * calculates recommended tick interval based on p95 latency.
 */

const BUFFER_SIZE = 100;

export interface LatencyMetrics {
  avg: number;
  p95: number;
  p99: number;
  max: number;
  sampleCount: number;
  successRate: number;
}

export class DojoLatencyTracker {
  private buffer: number[] = [];
  private pointer = 0;
  private totalSamples = 0;
  private totalFailures = 0;

  /** Record a successful TX confirmation time in ms */
  record(latencyMs: number): void {
    if (this.buffer.length < BUFFER_SIZE) {
      this.buffer.push(latencyMs);
    } else {
      this.buffer[this.pointer] = latencyMs;
    }
    this.pointer = (this.pointer + 1) % BUFFER_SIZE;
    this.totalSamples++;
  }

  /** Record a TX failure */
  recordFailure(): void {
    this.totalSamples++;
    this.totalFailures++;
  }

  /** Get recommended tick interval based on current speed setting */
  getRecommendedInterval(baseIntervalMs: number): number {
    if (this.buffer.length < 5) return baseIntervalMs;

    const metrics = this.getMetrics();
    // Minimum safe interval = p95 × 1.5
    const minSafeInterval = metrics.p95 * 1.5;
    return Math.max(baseIntervalMs, minSafeInterval);
  }

  /** Get latency statistics */
  getMetrics(): LatencyMetrics {
    if (this.buffer.length === 0) {
      return { avg: 0, p95: 0, p99: 0, max: 0, sampleCount: 0, successRate: 1 };
    }

    const sorted = [...this.buffer].sort((a, b) => a - b);
    const len = sorted.length;
    const avg = sorted.reduce((s, v) => s + v, 0) / len;
    const p95 = sorted[Math.floor(len * 0.95)] ?? sorted[len - 1];
    const p99 = sorted[Math.floor(len * 0.99)] ?? sorted[len - 1];
    const max = sorted[len - 1];
    const successRate = this.totalSamples > 0
      ? (this.totalSamples - this.totalFailures) / this.totalSamples
      : 1;

    return { avg, p95, p99, max, sampleCount: this.totalSamples, successRate };
  }
}
