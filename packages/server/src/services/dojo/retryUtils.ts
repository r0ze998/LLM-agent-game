/**
 * retryUtils.ts — 指数バックオフリトライユーティリティ
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (err: unknown) => boolean;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_CONFIG, ...config };

  let lastError: unknown;
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      if (cfg.shouldRetry && !cfg.shouldRetry(err)) {
        throw err;
      }

      if (attempt === cfg.maxAttempts) break;

      const delay = Math.min(
        cfg.baseDelayMs * Math.pow(2, attempt - 1),
        cfg.maxDelayMs,
      );
      console.warn(
        `[Retry] ${label} attempt ${attempt}/${cfg.maxAttempts} failed, retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
