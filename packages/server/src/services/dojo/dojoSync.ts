/**
 * dojoSync.ts — UUID ↔ u32 マッピング管理
 *
 * オフチェーンは UUID (string)、オンチェーンは連番 u32 (number)。
 * 建物・技術・ユニットは静的マッピング (setup.cairo に一致)。
 * 村は動的マッピング (創設時に割り当て)。
 */

// ── 建物定義 ID マッピング (25 buildings, matches setup.cairo) ──

export const BUILDING_STR_TO_U32: Record<string, number> = {
  farm: 1,
  granary: 2,
  lumber_mill: 3,
  mine: 4,
  market: 5,
  warehouse: 6,
  irrigation_canal: 7,
  mint: 8,
  barracks: 9,
  archery_range: 10,
  stable: 11,
  wall: 12,
  watchtower: 13,
  forge: 14,
  siege_workshop: 15,
  temple: 16,
  library: 17,
  school: 18,
  theater: 19,
  monument: 20,
  academy: 21,
  house: 22,
  well: 23,
  road: 24,
  meeting_hall: 25,
};

export const BUILDING_U32_TO_STR: Record<number, string> = Object.fromEntries(
  Object.entries(BUILDING_STR_TO_U32).map(([k, v]) => [v, k]),
);

// ── 技術定義 ID マッピング (30 techs, 3 branches × 10 tiers) ──

export const TECH_STR_TO_U32: Record<string, number> = {
  // Agriculture branch (1-10)
  agriculture: 1,
  irrigation: 2,
  animal_husbandry: 3,
  crop_rotation: 4,
  watermill: 5,
  guilds: 6,
  banking: 7,
  economics: 8,
  industrialization: 9,
  agriculture_mastery: 10,
  // Military branch (11-20)
  bronze_working: 11,
  archery: 12,
  horseback_riding: 13,
  iron_working: 14,
  fortification: 15,
  siege_warfare: 16,
  steel: 17,
  gunpowder: 18,
  tactics: 19,
  military_mastery: 20,
  // Culture branch (21-30)
  writing: 21,
  philosophy: 22,
  mysticism: 23,
  education: 24,
  arts: 25,
  theology: 26,
  printing: 27,
  enlightenment: 28,
  ideology: 29,
  culture_mastery: 30,
};

export const TECH_U32_TO_STR: Record<number, string> = Object.fromEntries(
  Object.entries(TECH_STR_TO_U32).map(([k, v]) => [v, k]),
);

// ── ユニット定義 ID マッピング (10 units) ──

export const UNIT_STR_TO_U32: Record<string, number> = {
  militia: 1,
  warrior: 2,
  archer: 3,
  spearman: 4,
  cavalry: 5,
  siege_ram: 6,
  catapult: 7,
  knight: 8,
  musketeer: 9,
  elite_guard: 10,
};

export const UNIT_U32_TO_STR: Record<number, string> = Object.fromEntries(
  Object.entries(UNIT_STR_TO_U32).map(([k, v]) => [v, k]),
);

// ── 村 UUID ↔ u32 動的マッピング ──

export class VillageIdMapper {
  private uuidToU32 = new Map<string, number>();
  private u32ToUuid = new Map<number, string>();
  private nextId = 1;

  /** 新しい村を登録し、u32 ID を返す */
  register(uuid: string): number {
    const existing = this.uuidToU32.get(uuid);
    if (existing !== undefined) return existing;

    const id = this.nextId++;
    this.uuidToU32.set(uuid, id);
    this.u32ToUuid.set(id, uuid);
    return id;
  }

  /** UUID → u32。未登録なら undefined */
  toU32(uuid: string): number | undefined {
    return this.uuidToU32.get(uuid);
  }

  /** u32 → UUID。未登録なら undefined */
  toUuid(u32: number): string | undefined {
    return this.u32ToUuid.get(u32);
  }

  /** 登録済み村数 */
  get size(): number {
    return this.uuidToU32.size;
  }

  /** 全マッピングを返す (デバッグ用) */
  entries(): [string, number][] {
    return [...this.uuidToU32.entries()];
  }
}
