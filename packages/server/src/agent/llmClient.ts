import Anthropic from '@anthropic-ai/sdk';
import { DAILY_PLAN_MODEL, SOCIAL_MODEL, IMPORTANT_MODEL, LLM_MAX_RETRIES, LLM_RATE_LIMIT } from '@murasato/shared';

const client = new Anthropic();

// --- Rate limiter (token bucket) ---

let tokens = LLM_RATE_LIMIT;
let lastRefill = Date.now();

function acquireToken(): Promise<void> {
  const now = Date.now();
  const elapsed = (now - lastRefill) / 1000;
  tokens = Math.min(LLM_RATE_LIMIT, tokens + elapsed * LLM_RATE_LIMIT);
  lastRefill = now;

  if (tokens >= 1) {
    tokens -= 1;
    return Promise.resolve();
  }
  const waitMs = ((1 - tokens) / LLM_RATE_LIMIT) * 1000;
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

  // Check cache
  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  await acquireToken();

  const model = selectModel(importance);
  let lastError: Error | null = null;

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

      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      if (cacheKey) setCache(cacheKey, text);
      return text;
    } catch (err) {
      lastError = err as Error;
      console.error(`LLM call attempt ${attempt + 1} failed:`, (err as Error).message);
      if (attempt < LLM_MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
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
