import type { GameEvent, Village, AgentState } from '@murasato/shared';
import { TICKS_PER_DAY, TICKS_PER_YEAR } from '@murasato/shared';
import { callLLM } from '../agent/llmClient.ts';

// --- Format tick as readable date ---

export function tickToDate(tick: number): string {
  const year = Math.floor(tick / TICKS_PER_YEAR) + 1;
  const dayInYear = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_DAY) + 1;
  const month = Math.floor(dayInYear / 30) + 1;
  const day = (dayInYear % 30) + 1;
  return `${year}年${month}月${day}日`;
}

// --- Group events into eras ---

export interface Era {
  name: string;
  startTick: number;
  endTick: number;
  keyEvents: GameEvent[];
  summary: string;
}

export function groupEventsIntoEras(events: GameEvent[], eraDuration: number = 500): Era[] {
  if (events.length === 0) return [];

  const eras: Era[] = [];
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const minTick = sorted[0].tick;
  const maxTick = sorted[sorted.length - 1].tick;

  for (let start = minTick; start <= maxTick; start += eraDuration) {
    const end = start + eraDuration;
    const eraEvents = sorted.filter(e => e.tick >= start && e.tick < end);
    if (eraEvents.length === 0) continue;

    // Prioritize important events
    const keyEvents = eraEvents
      .filter(e => ['founding', 'war', 'peace', 'alliance', 'death', 'birth', 'election'].includes(e.type))
      .slice(0, 10);

    eras.push({
      name: `第${eras.length + 1}紀 (${tickToDate(start)} - ${tickToDate(end)})`,
      startTick: start,
      endTick: end,
      keyEvents: keyEvents.length > 0 ? keyEvents : eraEvents.slice(0, 5),
      summary: '', // Generated below
    });
  }

  return eras;
}

// --- Generate chronicle summary with LLM ---

export async function generateChronicle(
  events: GameEvent[],
  villages: Village[],
  totalTick: number,
): Promise<string> {
  const eras = groupEventsIntoEras(events);
  if (eras.length === 0) return 'まだ歴史は刻まれていない。';

  // Build event summary for each era
  const eraSummaries = eras.map(era => {
    const eventLines = era.keyEvents.map(e => `- [${tickToDate(e.tick)}] ${e.description}`).join('\n');
    return `=== ${era.name} ===\n${eventLines}`;
  }).join('\n\n');

  const villageNames = villages.map(v => v.name).join('、');

  try {
    const raw = await callLLM({
      system: `あなたはJRPG世界の年代記記述者です。出来事の羅列を、物語風の年代記にまとめてください。各時代ごとに2-3文で要約し、全体を通じた流れ（興亡、対立、文化の発展など）を描写してください。`,
      userMessage: `=== 世界の年代記 ===
現在: ${tickToDate(totalTick)}
存在する村: ${villageNames || 'なし'}

【出来事】
${eraSummaries}

これらの出来事を年代記の形式でまとめてください。`,
      importance: 'important',
      maxTokens: 1024,
    });
    return raw.trim();
  } catch {
    // Fallback: just list events
    return eras.map(era => {
      const lines = era.keyEvents.map(e => `${tickToDate(e.tick)}: ${e.description}`).join('\n');
      return `【${era.name}】\n${lines}`;
    }).join('\n\n');
  }
}

// --- Generate per-agent biography ---

export async function generateBiography(
  agent: AgentState,
  events: GameEvent[],
): Promise<string> {
  const agentEvents = events
    .filter(e => e.actorIds.includes(agent.identity.id))
    .sort((a, b) => a.tick - b.tick);

  if (agentEvents.length === 0) {
    return `${agent.identity.name}の人生はまだ始まったばかりだ。`;
  }

  const eventLines = agentEvents
    .slice(0, 20)
    .map(e => `- ${tickToDate(e.tick)}: ${e.description}`)
    .join('\n');

  try {
    const raw = await callLLM({
      system: `あなたはJRPG世界の伝記作家です。キャラクターの人生の出来事から、短い伝記（3-5文）を書いてください。`,
      userMessage: `【${agent.identity.name}の人生】
世代: 第${agent.identity.generation}世代
性格: 好奇心${agent.identity.personality.openness}、協調性${agent.identity.personality.agreeableness}
信条: ${agent.identity.philosophy.values.join('、')}
状態: ${agent.identity.status}（年齢${agent.identity.age}）

出来事:
${eventLines}`,
      importance: 'routine',
      maxTokens: 300,
    });
    return raw.trim();
  } catch {
    return `${agent.identity.name}は第${agent.identity.generation}世代の${agent.identity.status === 'dead' ? '故人' : '住民'}である。`;
  }
}
