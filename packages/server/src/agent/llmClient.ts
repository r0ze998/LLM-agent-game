import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { DAILY_PLAN_MODEL, SOCIAL_MODEL, IMPORTANT_MODEL, LLM_MAX_RETRIES, LLM_BUDGET_PER_HOUR_USD } from '@murasato/shared';

// --- Provider selection ---

type LLMProvider = 'anthropic' | 'openai' | 'ollama';

const LLM_PROVIDER: LLMProvider = (process.env.LLM_PROVIDER as LLMProvider) ??
  (process.env.OPENAI_API_KEY ? 'openai' : 'anthropic');

const anthropicClient = LLM_PROVIDER === 'anthropic' ? new Anthropic() : null;
const openaiClient = LLM_PROVIDER === 'openai' ? new OpenAI() : null;
const ollamaClient = LLM_PROVIDER === 'ollama' ? new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: 'ollama',  // Ollama doesn't need a real key but OpenAI SDK requires one
}) : null;

// OpenAI / Ollama model (single model for all importance levels)
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';

console.log(`[LLM] Provider: ${LLM_PROVIDER}${LLM_PROVIDER === 'openai' ? ` (model: ${OPENAI_MODEL})` : LLM_PROVIDER === 'ollama' ? ` (model: ${OLLAMA_MODEL})` : ''}`);

// --- Concurrency limiter (semaphore) ---

const MAX_CONCURRENT = LLM_PROVIDER === 'ollama' ? 1 : LLM_PROVIDER === 'openai' ? 5 : 2;
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

const EFFECTIVE_RATE_LIMIT = LLM_PROVIDER === 'ollama' ? 1 : LLM_PROVIDER === 'openai' ? 10 : 2;

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
    if (LLM_PROVIDER === 'ollama') return 0; // local, free
    if (LLM_PROVIDER === 'openai') {
      // gpt-4o-mini pricing: $0.15/1M input, $0.60/1M output
      return (this.inputTokens * 0.15 + this.outputTokens * 0.60) / 1_000_000;
    }
    // Haiku pricing: $0.25/1M input, $1.25/1M output
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

// --- Provider-specific call implementations ---

async function callAnthropic(model: string, system: string, userMessage: string, maxTokens: number) {
  const response = await anthropicClient!.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  return { text, inputTokens, outputTokens };
}

async function callOpenAI(model: string, system: string, userMessage: string, maxTokens: number) {
  const openaiModel = OPENAI_MODEL;
  const response = await openaiClient!.chat.completions.create({
    model: openaiModel,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  return { text, inputTokens, outputTokens };
}

async function callOllama(model: string, system: string, userMessage: string, maxTokens: number) {
  const response = await ollamaClient!.chat.completions.create({
    model: OLLAMA_MODEL,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system + '\n\nIMPORTANT: You MUST respond with valid JSON only. No extra text.' },
      { role: 'user', content: userMessage },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  return { text, inputTokens, outputTokens };
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
        const result = LLM_PROVIDER === 'ollama'
          ? await callOllama(model, system, userMessage, maxTokens)
          : LLM_PROVIDER === 'openai'
          ? await callOpenAI(model, system, userMessage, maxTokens)
          : await callAnthropic(model, system, userMessage, maxTokens);

        costTracker.inputTokens += result.inputTokens;
        costTracker.outputTokens += result.outputTokens;
        costTracker.requests += 1;

        // F11: Track cost in hourly budget
        const pricingInput = LLM_PROVIDER === 'openai' ? 0.15 : 0.25;
        const pricingOutput = LLM_PROVIDER === 'openai' ? 0.60 : 1.25;
        const callCostUSD = (result.inputTokens * pricingInput + result.outputTokens * pricingOutput) / 1_000_000;
        budgetTracker.addCost(callCostUSD);

        if (cacheKey) setCache(cacheKey, result.text);
        return result.text;
      } catch (err) {
        lastError = err as Error;
        const msg = (err as Error).message ?? '';
        console.error(`LLM call attempt ${attempt + 1} failed:`, msg.slice(0, 120));
        // Don't retry on billing/auth errors - fail fast
        if (msg.includes('credit balance') || msg.includes('401') || msg.includes('403') || msg.includes('quota')) {
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
