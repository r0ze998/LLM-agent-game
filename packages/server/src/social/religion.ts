// === F8: Religion System ===

import type { AgentState, Village, ReligionState, CultureState } from '@murasato/shared';
import { callLLM, extractJSON, LLMBudgetExceeded } from '../agent/llmClient.ts';
import type { DiplomacyManager } from './diplomacy.ts';

// --- Template fallback religion data ---

const FALLBACK_RELIGIONS: ReligionState[] = [
  {
    name: 'Path of Moonlight',
    deities: ['Moon God Tsukiyomi'],
    beliefs: ['The moonlight reveals the truth', 'Night is a time for introspection'],
    rituals: ['Full moon prayer', 'New moon fasting'],
    orthodoxy: 80,
  },
  {
    name: 'Covenant of Earth',
    deities: ['Earth Mother Terra'],
    beliefs: ['The earth is the mother of all', 'The harvest must be repaid with gratitude'],
    rituals: ['Dance of the sowing', 'Harvest festival'],
    orthodoxy: 75,
  },
  {
    name: 'Doctrine of Flame',
    deities: ['Fire God Kagutsuchi'],
    beliefs: ['Fire is the power of purification', 'Courage is the highest virtue'],
    rituals: ['Meditation around the bonfire', 'Martial arts offering'],
    orthodoxy: 85,
  },
  {
    name: 'Reflection of Still Waters',
    deities: ['Water God Mizuha'],
    beliefs: ['Live without resisting the flow', 'All things change'],
    rituals: ['Riverside prayer', 'Song for rain'],
    orthodoxy: 70,
  },
];

// --- Check if religion can emerge in a village ---

export function canReligionEmerge(village: Village, members: AgentState[]): boolean {
  if (village.culture.religion) return false; // already has one
  if (village.governance.type !== 'theocratic') return false;

  // Need temple building (checked by caller via 4X state)
  // Need elder with teaching >= 15 and age > 300
  const hasQualifiedElder = members.some(a =>
    a.identity.status === 'elder' &&
    a.identity.skills.teaching >= 15 &&
    a.identity.age > 300,
  );
  if (!hasQualifiedElder) return false;

  // 5% chance per check
  return Math.random() < 0.05;
}

// --- Generate religion content via LLM ---

export async function generateReligion(village: Village): Promise<ReligionState> {
  try {
    const raw = await callLLM({
      system: `Create one religion that emerges in a JRPG village. Return only the following JSON format:
{
  "name": "religion name (short)",
  "deities": ["deity name"],
  "beliefs": ["tenet 1", "tenet 2"],
  "rituals": ["ritual 1", "ritual 2"]
}`,
      userMessage: `Village name: ${village.name}\nGovernance: ${village.governance.type}\nTraditions: ${village.culture.traditions.join(', ') || 'none'}\nGreeting style: ${village.culture.greetingStyle}`,
      importance: 'social',
      maxTokens: 256,
    });
    const parsed = extractJSON<{ name: string; deities: string[]; beliefs: string[]; rituals: string[] }>(raw);
    return {
      name: parsed.name,
      deities: parsed.deities ?? [],
      beliefs: parsed.beliefs ?? [],
      rituals: parsed.rituals ?? [],
      orthodoxy: 80,
    };
  } catch {
    // Fallback template
    return FALLBACK_RELIGIONS[Math.floor(Math.random() * FALLBACK_RELIGIONS.length)];
  }
}

// --- Check religion spread via cultural exchange ---

export function checkReligionSpread(
  fromVillage: Village,
  toVillage: Village,
): boolean {
  if (!fromVillage.culture.religion) return false;
  if (toVillage.culture.religion) return false; // already has one

  // 5% chance per cultural exchange
  return Math.random() < 0.05;
}

export function spreadReligion(fromVillage: Village, toVillage: Village): void {
  if (!fromVillage.culture.religion) return;

  // Copy religion with slight orthodoxy reduction
  toVillage.culture.religion = {
    ...fromVillage.culture.religion,
    orthodoxy: Math.max(40, fromVillage.culture.religion.orthodoxy - 10),
  };
}

// --- Diplomacy impact of religion ---

export function getReligionTensionModifier(v1: Village, v2: Village): number {
  const r1 = v1.culture.religion;
  const r2 = v2.culture.religion;

  if (!r1 && !r2) return 0;
  if (r1 && r2 && r1.name === r2.name) return -20;   // Same religion: -20 tension
  if (r1 && r2 && r1.name !== r2.name) return 15;     // Different religion: +15 tension
  return 0;
}

// --- Relationship compatibility modifier ---

export function getReligionCompatibilityMod(v1: Village, v2: Village): number {
  const r1 = v1.culture.religion;
  const r2 = v2.culture.religion;

  if (r1 && r2 && r1.name === r2.name) return 0.15;
  if (r1 && r2 && r1.name !== r2.name) return -0.10;
  return 0;
}

// --- Orthodoxy drift ---

export function processOrthodoxy(village: Village, members: AgentState[]): void {
  if (!village.culture.religion) return;

  const avgOpenness = members.reduce((s, a) => s + a.identity.personality.openness, 0) /
    Math.max(1, members.length);

  // High openness erodes orthodoxy
  if (avgOpenness > 60) {
    village.culture.religion.orthodoxy = Math.max(0,
      village.culture.religion.orthodoxy - (avgOpenness - 60) * 0.02);
  }

  // Schism: low orthodoxy + high-ambition agent
  if (village.culture.religion.orthodoxy < 20) {
    const schismLeader = members.find(a =>
      a.identity.personality.ambition > 70 && a.identity.status !== 'dead',
    );
    if (schismLeader && Math.random() < 0.1) {
      // Schism: religion is lost
      village.culture.religion = undefined;
    }
  }
}
