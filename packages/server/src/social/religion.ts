// === F8: Religion System ===

import type { AgentState, Village, ReligionState, CultureState } from '@murasato/shared';
import { callLLM, extractJSON, LLMBudgetExceeded } from '../agent/llmClient.ts';
import type { DiplomacyManager } from './diplomacy.ts';

// --- Template fallback religion names ---

const FALLBACK_RELIGIONS: ReligionState[] = [
  {
    name: '月光の道',
    deities: ['月神ツキヨミ'],
    beliefs: ['月の光が真実を照らす', '夜は内省の時'],
    rituals: ['満月の祈り', '新月の断食'],
    orthodoxy: 80,
  },
  {
    name: '大地の約束',
    deities: ['地母神テラ'],
    beliefs: ['大地は全ての母', '収穫は感謝で返す'],
    rituals: ['播種の舞', '収穫祭'],
    orthodoxy: 75,
  },
  {
    name: '炎の教え',
    deities: ['火神カグツチ'],
    beliefs: ['炎は浄化の力', '勇気こそ最高の美徳'],
    rituals: ['焚火を囲む瞑想', '武術奉納'],
    orthodoxy: 85,
  },
  {
    name: '水面の悟り',
    deities: ['水神ミズハ'],
    beliefs: ['流れに逆らわず生きる', '万物は変化する'],
    rituals: ['川辺の祈り', '雨乞いの歌'],
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
      system: `JRPGの村に生まれる宗教を1つ考えてください。以下のJSON形式のみで返してください:
{
  "name": "宗教名（4文字以内）",
  "deities": ["神の名前"],
  "beliefs": ["信仰の教え1", "信仰の教え2"],
  "rituals": ["儀式1", "儀式2"]
}`,
      userMessage: `村名: ${village.name}\n統治: ${village.governance.type}\n伝統: ${village.culture.traditions.join('、') || 'なし'}\n挨拶: ${village.culture.greetingStyle}`,
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
