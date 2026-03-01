import type { AgentState, Village, CultureState, GameEvent } from '@murasato/shared';
import { callLLM, extractJSON, LLMBudgetExceeded } from '../agent/llmClient.ts';

// --- Tradition generation ---

export async function generateTradition(
  village: Village,
  recentEvents: string[],
): Promise<string | null> {
  if (village.culture.traditions.length >= 5) return null;

  try {
    const raw = await callLLM({
      system: 'Create one village tradition or festival. Use a short description fitting a JRPG world (one sentence max). Return only the name and description of the tradition.',
      userMessage: `Village name: ${village.name}\nGovernance: ${village.governance.type}\nArchitecture: ${village.culture.architectureStyle}\nGreeting style: ${village.culture.greetingStyle}\nRecent events: ${recentEvents.slice(0, 3).join(', ') || 'none'}\nExisting traditions: ${village.culture.traditions.join(', ') || 'none'}`,
      importance: 'routine',
      maxTokens: 80,
    });
    const tradition = raw.trim().slice(0, 80);
    if (tradition) {
      village.culture.traditions.push(tradition);
      return tradition;
    }
  } catch (err) {
    if (err instanceof LLMBudgetExceeded) return generateFallbackTradition(village);
  }
  return null;
}

// --- Story creation (oral tradition) ---

export async function createStory(
  village: Village,
  event: GameEvent,
): Promise<string | null> {
  if (village.culture.stories.length >= 10) {
    // Remove oldest
    village.culture.stories.shift();
  }

  try {
    const raw = await callLLM({
      system: 'Create one tale or legend passed down in the village. Embellish the original event into a form that would be retold across generations. Two sentences max. Return only the story.',
      userMessage: `Village: ${village.name}\nOriginal event: ${event.description}\nNaming style: ${village.culture.namingStyle}`,
      importance: 'routine',
      maxTokens: 120,
    });
    const story = raw.trim().slice(0, 150);
    if (story) {
      village.culture.stories.push(story);
      return story;
    }
  } catch (err) {
    if (err instanceof LLMBudgetExceeded) return generateFallbackStory(village);
  }
  return null;
}

// --- Taboo creation ---

export async function createTaboo(
  village: Village,
  badEvent: string,
): Promise<string | null> {
  if (village.culture.taboos.length >= 5) return null;

  try {
    const raw = await callLLM({
      system: 'Create one village taboo born from a bad event. One short sentence. Return only the taboo.',
      userMessage: `Village: ${village.name}\nBad event: ${badEvent}\nExisting taboos: ${village.culture.taboos.join(', ') || 'none'}`,
      importance: 'routine',
      maxTokens: 60,
    });
    const taboo = raw.trim().slice(0, 60);
    if (taboo) {
      village.culture.taboos.push(taboo);
      return taboo;
    }
  } catch (err) {
    if (err instanceof LLMBudgetExceeded) return generateFallbackTaboo(village);
  }
  return null;
}

// --- F11: Template-based fallback generators ---

const FALLBACK_TRADITIONS = [
  'A festival of lighting fires on the night of the full moon',
  'A custom of offering gifts to the elders on the first hunt',
  'A ritual of sowing seeds into the earth on the spring equinox',
  'A ceremony of song to welcome new companions',
  'A tradition of sharing a communal meal after the harvest',
];

const FALLBACK_STORIES = [
  'A legend tells of a brave soul who walked through a great storm and saved the village.',
  'A tale of a pact made with a spirit deep in the forest that continues to protect the village.',
  'A story of two travelers who met by chance and sowed the seeds of peace in this land.',
];

const FALLBACK_TABOOS = [
  'One must not whistle at night',
  'One must not fell the great tree of the forest',
  'One must not leave another\'s meal unfinished',
];

export function generateFallbackTradition(village: Village): string | null {
  if (village.culture.traditions.length >= 5) return null;
  const available = FALLBACK_TRADITIONS.filter(t => !village.culture.traditions.includes(t));
  if (available.length === 0) return null;
  const tradition = available[Math.floor(Math.random() * available.length)];
  village.culture.traditions.push(tradition);
  return tradition;
}

export function generateFallbackStory(village: Village): string | null {
  const story = FALLBACK_STORIES[Math.floor(Math.random() * FALLBACK_STORIES.length)];
  if (village.culture.stories.length >= 10) village.culture.stories.shift();
  village.culture.stories.push(story);
  return story;
}

export function generateFallbackTaboo(village: Village): string | null {
  if (village.culture.taboos.length >= 5) return null;
  const available = FALLBACK_TABOOS.filter(t => !village.culture.taboos.includes(t));
  if (available.length === 0) return null;
  const taboo = available[Math.floor(Math.random() * available.length)];
  village.culture.taboos.push(taboo);
  return taboo;
}

// --- Cultural meme exchange between agents of different villages ---

export interface CulturalExchange {
  fromVillage: Village;
  toVillage: Village;
  carrierAgent: AgentState;
  memeType: 'tradition' | 'story' | 'naming' | 'greeting' | 'architecture';
  content: string;
}

export function checkCulturalExchange(
  agent1: AgentState,
  agent2: AgentState,
  village1: Village | null,
  village2: Village | null,
): CulturalExchange | null {
  if (!village1 || !village2) return null;
  if (village1.id === village2.id) return null;

  // Only high-openness agents spread culture
  const carrier = agent1.identity.personality.openness > agent2.identity.personality.openness ? agent1 : agent2;
  if (carrier.identity.personality.openness < 50) return null;

  // Low chance per interaction
  if (Math.random() > 0.1) return null;

  const fromVillage = carrier === agent1 ? village1 : village2;
  const toVillage = carrier === agent1 ? village2 : village1;

  // Pick what to exchange
  const options: { type: CulturalExchange['memeType']; content: string }[] = [];

  if (fromVillage.culture.traditions.length > 0) {
    const t = fromVillage.culture.traditions[Math.floor(Math.random() * fromVillage.culture.traditions.length)];
    options.push({ type: 'tradition', content: t });
  }
  if (fromVillage.culture.stories.length > 0) {
    const s = fromVillage.culture.stories[Math.floor(Math.random() * fromVillage.culture.stories.length)];
    options.push({ type: 'story', content: s });
  }
  options.push({ type: 'greeting', content: fromVillage.culture.greetingStyle });
  options.push({ type: 'naming', content: fromVillage.culture.namingStyle });

  if (options.length === 0) return null;

  const chosen = options[Math.floor(Math.random() * options.length)];

  return {
    fromVillage,
    toVillage,
    carrierAgent: carrier,
    memeType: chosen.type,
    content: chosen.content,
  };
}

export function applyCulturalExchange(exchange: CulturalExchange): boolean {
  const { toVillage, memeType, content } = exchange;

  switch (memeType) {
    case 'tradition':
      if (toVillage.culture.traditions.includes(content)) return false;
      if (toVillage.culture.traditions.length < 5) {
        toVillage.culture.traditions.push(`(foreign) ${content}`);
        return true;
      }
      return false;

    case 'story':
      if (toVillage.culture.stories.includes(content)) return false;
      if (toVillage.culture.stories.length < 10) {
        toVillage.culture.stories.push(content);
        return true;
      }
      return false;

    case 'greeting':
      // 30% chance of adoption (cultural resistance)
      if (Math.random() < 0.3 && toVillage.culture.greetingStyle !== content) {
        toVillage.culture.greetingStyle = `${toVillage.culture.greetingStyle}+${content}`;
        return true;
      }
      return false;

    case 'naming':
      if (Math.random() < 0.2 && toVillage.culture.namingStyle !== content) {
        toVillage.culture.namingStyle = content;
        return true;
      }
      return false;

    case 'architecture':
      if (Math.random() < 0.15) {
        toVillage.culture.architectureStyle = content;
        return true;
      }
      return false;
  }
}

// --- Periodic culture evolution (called every ~100 ticks) ---

export async function evolveCulture(
  village: Village,
  members: AgentState[],
  recentEvents: GameEvent[],
  tick: number,
): Promise<GameEvent[]> {
  const events: GameEvent[] = [];

  // 1. Maybe create a new tradition (if village is old enough)
  if (tick - village.foundedAtTick > 200 && Math.random() < 0.1) {
    const tradition = await generateTradition(village, recentEvents.map(e => e.description));
    if (tradition) {
      events.push({
        id: `evt_${crypto.randomUUID()}`,
        gameId: '', // filled by caller
        type: 'discovery',
        tick,
        actorIds: village.population.slice(0, 1),
        description: `A new tradition was born in ${village.name}: ${tradition}`,
        data: { villageId: village.id, tradition },
      });
    }
  }

  // 2. Important events become stories
  const importantEvents = recentEvents.filter(e =>
    ['birth', 'death', 'founding', 'war', 'election'].includes(e.type),
  );
  if (importantEvents.length > 0 && Math.random() < 0.2) {
    const source = importantEvents[Math.floor(Math.random() * importantEvents.length)];
    await createStory(village, source);
  }

  // 3. Deaths/wars may create taboos
  const badEvents = recentEvents.filter(e => e.type === 'death' || e.type === 'war');
  if (badEvents.length > 0 && Math.random() < 0.15) {
    const source = badEvents[Math.floor(Math.random() * badEvents.length)];
    await createTaboo(village, source.description);
  }

  // 4. Naming/greeting style may evolve based on population's average openness
  const avgOpenness = members.reduce((s, a) => s + a.identity.personality.openness, 0) / Math.max(1, members.length);
  if (avgOpenness > 70 && village.culture.greetingStyle === 'polite') {
    village.culture.greetingStyle = 'friendly';
  } else if (avgOpenness < 30 && village.culture.greetingStyle !== 'formal') {
    village.culture.greetingStyle = 'formal';
  }

  return events;
}
