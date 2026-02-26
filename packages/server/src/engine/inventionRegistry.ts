// === Layer 2: 発明レジストリ — エージェントが発明した建物・技術・ユニットの管理 ===

import type { Effect, BuildingDef, TechDef, UnitDef } from '@murasato/shared';
import type {
  Invention,
  VillageState4X,
  AutonomousWorldState,
  ResourceType4X,
} from '@murasato/shared';
import {
  BUILDING_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  RESOURCE_TYPES_4X,
} from '@murasato/shared';
import {
  validateInventionDef,
  INVENTION_LIMITS,
  clampEffect,
  RELEVANCE_DECAY_RATE,
} from '@murasato/shared';

// --- InventionRegistry ---

export class InventionRegistry {
  private awState: AutonomousWorldState;

  constructor(awState: AutonomousWorldState) {
    this.awState = awState;
  }

  /** 発明を登録する。物理検証を通過した場合のみ成功 */
  register(invention: Invention): { success: boolean; violations: string[] } {
    // 既に同IDがある場合は拒否
    if (this.awState.inventions.has(invention.id)) {
      return { success: false, violations: ['Invention ID already exists'] };
    }

    // 村あたりの発明数チェック
    const villageInventionCount = this.getInventionsByVillage(invention.originVillageId).length;
    if (villageInventionCount >= INVENTION_LIMITS.maxInventionsPerVillage) {
      return { success: false, violations: [`Village has reached max inventions (${INVENTION_LIMITS.maxInventionsPerVillage})`] };
    }

    // 定義を復元して物理検証
    const def = invention.definition;
    const validationResult = validateInventionDef(def as any, invention.type);

    if (!validationResult.valid) {
      return { success: false, violations: validationResult.violations };
    }

    // 登録
    invention.relevance = 1.0;
    this.awState.inventions.set(invention.id, invention);
    return { success: true, violations: [] };
  }

  /** 特定の村が利用可能な発明を取得 */
  getAvailableFor(villageId: string): Invention[] {
    const available: Invention[] = [];
    for (const inv of this.awState.inventions.values()) {
      if (inv.relevance <= 0) continue;
      if (inv.knownByVillages.includes(villageId) || inv.originVillageId === villageId) {
        available.push(inv);
      }
    }
    return available;
  }

  /** 特定の村が発明したものを取得 */
  getInventionsByVillage(villageId: string): Invention[] {
    const result: Invention[] = [];
    for (const inv of this.awState.inventions.values()) {
      if (inv.originVillageId === villageId) result.push(inv);
    }
    return result;
  }

  /** 知識を交易経路に沿って伝播する */
  spreadKnowledge(villageStates: Map<string, VillageState4X>, currentTick: number): void {
    for (const inv of this.awState.inventions.values()) {
      if (inv.relevance <= 0) continue;

      // 伝播遅延チェック
      if (currentTick - inv.inventedAtTick < INVENTION_LIMITS.spreadDelayTicks) continue;

      const originVillage = villageStates.get(inv.originVillageId);
      if (!originVillage) continue;

      // 交易経路に沿って伝播
      for (const route of originVillage.tradeRoutes) {
        const targetVillageId = route.fromVillageId === inv.originVillageId
          ? route.toVillageId
          : route.fromVillageId;

        if (!inv.knownByVillages.includes(targetVillageId)) {
          inv.knownByVillages.push(targetVillageId);
        }

        // 二次伝播: 知識を持つ村の交易先にも伝播（さらに遅延あり）
        if (currentTick - inv.inventedAtTick >= INVENTION_LIMITS.spreadDelayTicks * 2) {
          const targetVillage = villageStates.get(targetVillageId);
          if (targetVillage) {
            for (const route2 of targetVillage.tradeRoutes) {
              const tertiaryId = route2.fromVillageId === targetVillageId
                ? route2.toVillageId
                : route2.fromVillageId;
              if (!inv.knownByVillages.includes(tertiaryId)) {
                inv.knownByVillages.push(tertiaryId);
              }
            }
          }
        }
      }
    }
  }
}

// --- 発明からの Effect 取得 ---

export function getInventionEffects(
  village: VillageState4X,
  awState: AutonomousWorldState,
): Effect[] {
  const effects: Effect[] = [];
  const registry = new InventionRegistry(awState);
  const available = registry.getAvailableFor(village.villageId);

  for (const inv of available) {
    if (inv.type === 'building') {
      // 村にこの発明建物が建っているかチェック
      const hasBuilding = village.buildings.some(b => b.defId === inv.id);
      if (!hasBuilding) continue;

      const def = inv.definition as unknown as BuildingDef;
      if (def.effects) {
        effects.push(...def.effects.map(e => clampEffect(e)));
      }
    } else if (inv.type === 'tech') {
      // 村がこの発明技術を研究済みかチェック
      if (!village.researchedTechs.has(inv.id)) continue;

      const def = inv.definition as unknown as TechDef;
      if (def.effects) {
        effects.push(...def.effects.map(e => clampEffect(e)));
      }
    }
    // unit は Effect を直接持たない（戦闘時にステータスを参照）
  }

  return effects;
}

// --- 発明の relevance 減衰 ---

export function decayInventionRelevance(awState: AutonomousWorldState): void {
  for (const inv of awState.inventions.values()) {
    inv.relevance = Math.max(0, inv.relevance - RELEVANCE_DECAY_RATE);
  }
}

// --- 発明 BuildingDef / TechDef / UnitDef のルックアップ ---

/** 発明を含めた BuildingDef のルックアップ */
export function lookupBuildingDef(
  defId: string,
  awState: AutonomousWorldState,
): BuildingDef | null {
  // まずハードコード定義を検索
  const hardcoded = BUILDING_DEFS[defId];
  if (hardcoded) return hardcoded;

  // 発明を検索
  const inv = awState.inventions.get(defId);
  if (inv && inv.type === 'building' && inv.relevance > 0) {
    return inv.definition as unknown as BuildingDef;
  }

  return null;
}

/** 発明を含めた TechDef のルックアップ */
export function lookupTechDef(
  defId: string,
  awState: AutonomousWorldState,
): TechDef | null {
  const hardcoded = TECH_DEFS[defId];
  if (hardcoded) return hardcoded;

  const inv = awState.inventions.get(defId);
  if (inv && inv.type === 'tech' && inv.relevance > 0) {
    return inv.definition as unknown as TechDef;
  }

  return null;
}

/** 発明を含めた UnitDef のルックアップ */
export function lookupUnitDef(
  defId: string,
  awState: AutonomousWorldState,
): UnitDef | null {
  const hardcoded = UNIT_DEFS[defId];
  if (hardcoded) return hardcoded;

  const inv = awState.inventions.get(defId);
  if (inv && inv.type === 'unit' && inv.relevance > 0) {
    return inv.definition as unknown as UnitDef;
  }

  return null;
}
