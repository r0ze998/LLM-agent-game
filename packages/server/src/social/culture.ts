import type { AgentState, Village, CultureState, GameEvent } from '@murasato/shared';
import { callLLM, extractJSON } from '../agent/llmClient.ts';

// --- Tradition generation ---

export async function generateTradition(
  village: Village,
  recentEvents: string[],
): Promise<string | null> {
  if (village.culture.traditions.length >= 5) return null;

  try {
    const raw = await callLLM({
      system: '村の伝統・祭りを1つ考えてください。JRPGの世界観に合う短い説明で（1文以内）。伝統の名前と説明のみ返してください。',
      userMessage: `村名: ${village.name}\n統治: ${village.governance.type}\n建築: ${village.culture.architectureStyle}\n挨拶: ${village.culture.greetingStyle}\n最近の出来事: ${recentEvents.slice(0, 3).join('、') || '特になし'}\n既存の伝統: ${village.culture.traditions.join('、') || 'なし'}`,
      importance: 'routine',
      maxTokens: 80,
    });
    const tradition = raw.trim().slice(0, 80);
    if (tradition) {
      village.culture.traditions.push(tradition);
      return tradition;
    }
  } catch {}
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
      system: '村に伝わる物語・伝説を1つ作ってください。元の出来事を脚色して語り継がれる形に。2文以内。物語のみ返してください。',
      userMessage: `村: ${village.name}\n元の出来事: ${event.description}\n命名スタイル: ${village.culture.namingStyle}`,
      importance: 'routine',
      maxTokens: 120,
    });
    const story = raw.trim().slice(0, 150);
    if (story) {
      village.culture.stories.push(story);
      return story;
    }
  } catch {}
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
      system: '悪い出来事から生まれた村のタブー（禁忌）を1つ考えてください。短い1文で。タブーの内容のみ返してください。',
      userMessage: `村: ${village.name}\n悪い出来事: ${badEvent}\n既存のタブー: ${village.culture.taboos.join('、') || 'なし'}`,
      importance: 'routine',
      maxTokens: 60,
    });
    const taboo = raw.trim().slice(0, 60);
    if (taboo) {
      village.culture.taboos.push(taboo);
      return taboo;
    }
  } catch {}
  return null;
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
        toVillage.culture.traditions.push(`(外来) ${content}`);
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
        description: `${village.name}で新しい伝統が生まれた: ${tradition}`,
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
  if (avgOpenness > 70 && village.culture.greetingStyle === '丁寧') {
    village.culture.greetingStyle = 'フレンドリー';
  } else if (avgOpenness < 30 && village.culture.greetingStyle !== '形式的') {
    village.culture.greetingStyle = '形式的';
  }

  return events;
}
