import type { GameEvent, Village, AgentState } from '@murasato/shared';
import { TICKS_PER_DAY, TICKS_PER_YEAR } from '@murasato/shared';
import { callLLM } from '../agent/llmClient.ts';

// --- Format tick as readable date ---

export function tickToDate(tick: number): string {
  const year = Math.floor(tick / TICKS_PER_YEAR) + 1;
  const dayInYear = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_DAY) + 1;
  const month = Math.floor(dayInYear / 30) + 1;
  const day = (dayInYear % 30) + 1;
  return `Y${year} M${month} D${day}`;
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
      name: `Era ${eras.length + 1} (${tickToDate(start)} - ${tickToDate(end)})`,
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
  if (eras.length === 0) return 'No history has been written yet.';

  // Build event summary for each era
  const eraSummaries = eras.map(era => {
    const eventLines = era.keyEvents.map(e => `- [${tickToDate(e.tick)}] ${e.description}`).join('\n');
    return `=== ${era.name} ===\n${eventLines}`;
  }).join('\n\n');

  const villageNames = villages.map(v => v.name).join(', ');

  try {
    const raw = await callLLM({
      system: `You are a chronicler in a JRPG world. Summarize the listed events into a narrative chronicle. Write 2-3 sentences per era and depict the overarching flow (rise and fall, conflicts, cultural development, etc.).`,
      userMessage: `=== World Chronicle ===
Current date: ${tickToDate(totalTick)}
Existing villages: ${villageNames || 'None'}

[Events]
${eraSummaries}

Please compile these events into a chronicle format.`,
      importance: 'important',
      maxTokens: 1024,
    });
    return raw.trim();
  } catch {
    // Fallback: just list events
    return eras.map(era => {
      const lines = era.keyEvents.map(e => `${tickToDate(e.tick)}: ${e.description}`).join('\n');
      return `[${era.name}]\n${lines}`;
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
    return `${agent.identity.name}'s story has only just begun.`;
  }

  const eventLines = agentEvents
    .slice(0, 20)
    .map(e => `- ${tickToDate(e.tick)}: ${e.description}`)
    .join('\n');

  try {
    const raw = await callLLM({
      system: `You are a biographer in a JRPG world. Write a short biography (3-5 sentences) based on the character's life events.`,
      userMessage: `[The Life of ${agent.identity.name}]
Generation: ${agent.identity.generation}
Personality: Openness ${agent.identity.personality.openness}, Agreeableness ${agent.identity.personality.agreeableness}
Values: ${agent.identity.philosophy.values.join(', ')}
Status: ${agent.identity.status} (Age ${agent.identity.age})

Events:
${eventLines}`,
      importance: 'routine',
      maxTokens: 300,
    });
    return raw.trim();
  } catch {
    return `${agent.identity.name} is a generation ${agent.identity.generation} ${agent.identity.status === 'dead' ? 'deceased' : 'resident'}.`;
  }
}
