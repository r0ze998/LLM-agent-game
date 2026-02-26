// === Victory Checker — 勝利条件判定 ===

import { VICTORY_DEFS, TECH_DEFS, getTechsByBranch, getMaxTier } from '@murasato/shared';
import type { VictoryConditionDef, VictoryType } from '@murasato/shared';
import type { VillageState4X, VictoryEvent } from '@murasato/shared';
import type { DiplomaticRelation } from '@murasato/shared';
import { SCORE_VICTORY_TICK } from '@murasato/shared';

export interface VictoryCheckContext {
  villageStates: Map<string, VillageState4X>;
  diplomacy: DiplomaticRelation[];
  tick: number;
}

/** 全勝利条件をチェックし、達成した場合はVictoryEventを返す */
export function checkVictory(ctx: VictoryCheckContext): VictoryEvent | null {
  for (const def of VICTORY_DEFS) {
    for (const [villageId, vs] of ctx.villageStates) {
      if (!vs.ownerId) continue; // AI村はスコア勝利のみ

      const metric = computeMetric(def.check.metric, vs, ctx);
      const met = compareMetric(metric, def.check.threshold, def.check.comparison);

      if (met) {
        // スコア勝利は時間が来るまで待つ
        if (def.type === 'score' && ctx.tick < SCORE_VICTORY_TICK) continue;

        return {
          winnerId: vs.ownerId || villageId,
          villageId,
          victoryType: def.type,
          tick: ctx.tick,
          score: vs.score,
        };
      }
    }
  }

  return null;
}

function computeMetric(
  metric: string,
  village: VillageState4X,
  ctx: VictoryCheckContext,
): number {
  switch (metric) {
    case 'village_control_ratio': {
      const total = ctx.villageStates.size;
      if (total === 0) return 0;
      let controlled = 0;
      for (const vs of ctx.villageStates.values()) {
        if (vs.ownerId === village.ownerId) controlled++;
      }
      return controlled / total;
    }

    case 'culture_points':
      return village.totalCulturePoints;

    case 'alliance_ratio': {
      const total = ctx.villageStates.size - 1; // 自分を除く
      if (total <= 0) return 1;
      let alliedCount = 0;
      for (const rel of ctx.diplomacy) {
        if (rel.status !== 'allied') continue;
        const otherVillageId = rel.villageId1 === village.villageId
          ? rel.villageId2 : (rel.villageId2 === village.villageId ? rel.villageId1 : null);
        if (!otherVillageId) continue;
        // 同盟先がこのプレイヤーの村であることを確認
        const otherVs = ctx.villageStates.get(otherVillageId);
        if (otherVs && otherVs.ownerId !== village.ownerId) alliedCount++;
      }
      return alliedCount / total;
    }

    case 'branch_mastery_count': {
      let count = 0;
      for (const branch of ['agriculture', 'military', 'culture']) {
        const maxTier = getMaxTier(branch);
        const branchTechs = getTechsByBranch(branch);
        const allResearched = branchTechs.every(t => village.researchedTechs.has(t.id));
        if (allResearched) count++;
      }
      return count;
    }

    case 'tick_count':
      return ctx.tick;

    default:
      return 0;
  }
}

function compareMetric(value: number, threshold: number, comparison: 'gte' | 'lte' | 'eq'): boolean {
  switch (comparison) {
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
  }
}

/** スコア勝利時のランキング計算 */
export function computeScoreRanking(
  villageStates: Map<string, VillageState4X>,
): { villageId: string; ownerId: string | null; score: number }[] {
  const ranking = Array.from(villageStates.values())
    .map(vs => ({
      villageId: vs.villageId,
      ownerId: vs.ownerId,
      score: vs.score,
    }))
    .sort((a, b) => b.score - a.score);
  return ranking;
}
