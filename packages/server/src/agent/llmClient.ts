import Anthropic from '@anthropic-ai/sdk';
import { DAILY_PLAN_MODEL, SOCIAL_MODEL, IMPORTANT_MODEL, LLM_MAX_RETRIES, LLM_BUDGET_PER_HOUR_USD } from '@murasato/shared';

const client = new Anthropic();

// --- Concurrency limiter (semaphore) ---
// New Anthropic accounts have low concurrent connection limits.
// Queue requests so at most MAX_CONCURRENT are in-flight at once.

const MAX_CONCURRENT = 2;
let inFlight = 0;
const waitQueue: (() => void)[] = [];

function acquireConcurrency(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    waitQueue.push(() => { inFlight++; resolve(); });
  });
}

function releaseConcurrency() {
  inFlight--;
  const next = waitQueue.shift();
  if (next) next();
}

// --- Rate limiter (token bucket) ---
// Override: new Anthropic accounts have low output token limits (10k/min).
// Limit to ~2 req/sec to avoid bursting through the limit.
const EFFECTIVE_RATE_LIMIT = 2;

let tokens = EFFECTIVE_RATE_LIMIT;
let lastRefill = Date.now();

function acquireToken(): Promise<void> {
  const now = Date.now();
  const elapsed = (now - lastRefill) / 1000;
  tokens = Math.min(EFFECTIVE_RATE_LIMIT, tokens + elapsed * EFFECTIVE_RATE_LIMIT);
  lastRefill = now;

  if (tokens >= 1) {
    tokens -= 1;
    return Promise.resolve();
  }
  const waitMs = ((1 - tokens) / EFFECTIVE_RATE_LIMIT) * 1000;
  return new Promise(resolve => setTimeout(resolve, waitMs));
}

// --- LRU Cache ---

const cache = new Map<string, { result: string; timestamp: number }>();
const CACHE_MAX = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // refresh position
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
}

function setCache(key: string, result: string) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value!;
    cache.delete(oldest);
  }
  cache.set(key, { result, timestamp: Date.now() });
}

// --- Cost tracker ---

export const costTracker = {
  inputTokens: 0,
  outputTokens: 0,
  requests: 0,

  get estimatedCostUSD(): number {
    // Haiku pricing approximation: $0.25/1M input, $1.25/1M output
    return (this.inputTokens * 0.25 + this.outputTokens * 1.25) / 1_000_000;
  },

  reset() {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.requests = 0;
  },
};

// --- LLM Budget Error ---

export class LLMBudgetExceeded extends Error {
  constructor() {
    super('LLM_BUDGET_EXCEEDED');
    this.name = 'LLMBudgetExceeded';
  }
}

// --- Hourly rolling-window budget tracker (F11) ---

const budgetTracker = {
  entries: [] as { timestamp: number; costUSD: number }[],

  addCost(costUSD: number): void {
    this.entries.push({ timestamp: Date.now(), costUSD });
  },

  getHourlyCost(): number {
    const oneHourAgo = Date.now() - 3600_000;
    this.entries = this.entries.filter(e => e.timestamp > oneHourAgo);
    return this.entries.reduce((sum, e) => sum + e.costUSD, 0);
  },

  checkBudget(): void {
    if (this.getHourlyCost() >= LLM_BUDGET_PER_HOUR_USD) {
      throw new LLMBudgetExceeded();
    }
  },
};

export { budgetTracker };

// --- Model selection ---

export type DecisionImportance = 'routine' | 'social' | 'important';

function selectModel(importance: DecisionImportance): string {
  switch (importance) {
    case 'routine': return DAILY_PLAN_MODEL;
    case 'social': return SOCIAL_MODEL;
    case 'important': return IMPORTANT_MODEL;
  }
}

// --- Main call ---

export interface LLMCallOptions {
  system: string;
  userMessage: string;
  importance: DecisionImportance;
  cacheKey?: string;
  maxTokens?: number;
}

export async function callLLM(options: LLMCallOptions): Promise<string> {
  const { system, userMessage, importance, cacheKey, maxTokens = 1024 } = options;

  // F11: Budget gate
  budgetTracker.checkBudget();

  // Check cache
  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  await acquireToken();
  await acquireConcurrency();

  const model = selectModel(importance);
  let lastError: Error | null = null;

  try {
    for (let attempt = 0; attempt < LLM_MAX_RETRIES; attempt++) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: userMessage }],
        });

        costTracker.inputTokens += response.usage.input_tokens;
        costTracker.outputTokens += response.usage.output_tokens;
        costTracker.requests += 1;

        // F11: Track cost in hourly budget
        const callCostUSD = (response.usage.input_tokens * 0.25 + response.usage.output_tokens * 1.25) / 1_000_000;
        budgetTracker.addCost(callCostUSD);

        const text = response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('');

        if (cacheKey) setCache(cacheKey, text);
        return text;
      } catch (err) {
        lastError = err as Error;
        const msg = (err as Error).message ?? '';
        console.error(`LLM call attempt ${attempt + 1} failed:`, msg.slice(0, 120));
        // Don't retry on billing/auth errors (400/401/403) - fail fast
        if (msg.includes('credit balance') || msg.includes('401') || msg.includes('403')) {
          break;
        }
        if (attempt < LLM_MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
  } finally {
    releaseConcurrency();
  }

  throw lastError ?? new Error('LLM call failed after retries');
}

// --- JSON extraction helper ---

export function extractJSON<T>(raw: string): T {
  // Strategy 1: Direct parse
  try {
    return JSON.parse(raw);
  } catch { /* continue */ }

  // Strategy 2: Extract from code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch { /* continue */ }
  }

  // Strategy 3: Find first { ... } or [ ... ]
  const jsonMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch { /* continue */ }
  }

  throw new Error(`Failed to extract JSON from LLM response: ${raw.slice(0, 200)}`);
}
