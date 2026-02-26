// === Layer 1: 契約エンジン — Covenant → Effect[] 変換 + バリデーション ===
//
// ClauseType → Effect[] の変換ルールは Layer 0 的に不変。
// エージェントは ClauseType の組み合わせとパラメータを選択するが、
// 変換ロジック自体は変更できない。

import type { Effect } from '@murasato/shared';
import type {
  Covenant,
  CovenantClause,
  ClauseType,
  ResourceType4X,
  AutonomousWorldState,
} from '@murasato/shared';
import {
  CLAUSE_PARAM_BOUNDS,
  COVENANT_LIMITS,
  clampEffect,
  RELEVANCE_DECAY_RATE,
} from '@murasato/shared';

// --- ClauseType → Effect[] 変換 ---

export function clauseToEffects(clause: CovenantClause): Effect[] {
  const p = clause.params;

  switch (clause.type) {
    case 'tax_rate': {
      const rate = p.rate as number;
      const resource = (p.resource as ResourceType4X) || 'gold';
      return [
        { type: 'resource_production', target: { scope: 'village', resource: 'gold' }, value: rate * 5 },
        { type: 'resource_production', target: { scope: 'village', resource }, value: -(rate * 2) },
      ];
    }

    case 'trade_tariff': {
      const rate = p.rate as number;
      return [
        { type: 'trade_income', target: { scope: 'village', resource: 'gold' }, value: rate * 3 },
        { type: 'trade_income', target: { scope: 'village', resource: 'food' }, value: -(rate * 1) },
      ];
    }

    case 'conscription': {
      const ratio = p.ratio as number;
      return [
        { type: 'defense_bonus', target: { scope: 'village' }, value: ratio * 3 },
        { type: 'population_growth', target: { scope: 'village' }, value: -(ratio * 2) },
      ];
    }

    case 'resource_sharing': {
      const percent = p.percent as number;
      const resource = (p.resource as ResourceType4X) || 'food';
      return [
        { type: 'resource_production', target: { scope: 'village', resource }, value: percent * 4 },
      ];
    }

    case 'building_ban': {
      // 建物禁止は Effect では表現しにくいが、後でコマンド処理時にチェックする
      // ここではペナルティとして build_speed に影響
      return [
        { type: 'build_speed', target: { scope: 'village' }, value: -0.1 },
      ];
    }

    case 'building_subsidy': {
      const discount = p.discount as number;
      return [
        { type: 'build_speed', target: { scope: 'village' }, value: discount * 0.5 },
        { type: 'resource_production', target: { scope: 'village', resource: 'gold' }, value: -(discount * 2) },
      ];
    }

    case 'research_focus': {
      const bonus = p.bonus as number;
      return [
        { type: 'research_points', target: { scope: 'village' }, value: bonus * 4 },
      ];
    }

    case 'military_pact': {
      return [
        { type: 'defense_bonus', target: { scope: 'village' }, value: 0.2 },
        { type: 'attack_bonus', target: { scope: 'village' }, value: 0.1 },
      ];
    }

    case 'non_aggression': {
      // 非侵略条約はEffect不要。外交ステータスで管理。
      // 平和ボーナスとして trade_income を付与
      return [
        { type: 'trade_income', target: { scope: 'village', resource: 'gold' }, value: 1 },
      ];
    }

    case 'tribute': {
      const amount = p.amount as number;
      const resource = (p.resource as ResourceType4X) || 'gold';
      // 貢ぐ側にはマイナス、受ける側にはプラス（bilateral scopeで処理）
      return [
        { type: 'resource_production', target: { scope: 'village', resource }, value: -(amount * 0.2) },
      ];
    }

    case 'immigration_policy': {
      const open = p.open as boolean;
      return [
        { type: 'population_growth', target: { scope: 'village' }, value: open ? 0.02 : -0.01 },
      ];
    }

    case 'rationing': {
      const mod = p.consumption_mod as number;
      return [
        { type: 'food_consumption_mod', target: { scope: 'village' }, value: -(1 - mod) },
        { type: 'population_growth', target: { scope: 'village' }, value: -0.01 },
      ];
    }

    case 'festival': {
      const cultureBonus = p.culture_bonus as number;
      const foodCost = p.food_cost as number;
      return [
        { type: 'culture_points', target: { scope: 'village' }, value: cultureBonus },
        { type: 'resource_production', target: { scope: 'village', resource: 'food' }, value: -(foodCost * 0.1) },
      ];
    }

    default:
      return [];
  }
}

// --- バリデーション ---

export function validateCovenant(covenant: Omit<Covenant, 'id' | 'enactedAtTick' | 'repealedAtTick' | 'relevance'>): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // 条項数チェック
  if (covenant.clauses.length === 0) {
    violations.push('Covenant must have at least one clause');
  }
  if (covenant.clauses.length > COVENANT_LIMITS.maxClausesPerCovenant) {
    violations.push(`Clause count ${covenant.clauses.length} exceeds max ${COVENANT_LIMITS.maxClausesPerCovenant}`);
  }

  // 各条項のパラメータ範囲チェック
  for (const clause of covenant.clauses) {
    const bounds = CLAUSE_PARAM_BOUNDS[clause.type];
    if (bounds) {
      for (const [key, range] of Object.entries(bounds)) {
        const val = clause.params[key];
        if (typeof val === 'number') {
          if (val < range.min || val > range.max) {
            violations.push(`${clause.type}.${key} = ${val} out of bounds [${range.min}, ${range.max}]`);
          }
        }
      }
    }

    // 全Effect を EFFECT_BOUNDS で検証
    const effects = clauseToEffects(clause);
    for (const eff of effects) {
      const clamped = clampEffect(eff);
      if (clamped.value !== eff.value) {
        // Effect が clamp されるが、これは警告であって致命的ではない
        // 実行時に clamp されるので OK
      }
    }
  }

  // bilateral scope には targetVillageId が必要
  if (covenant.scope === 'bilateral' && !covenant.targetVillageId) {
    violations.push('Bilateral covenant requires targetVillageId');
  }

  return { valid: violations.length === 0, violations };
}

// --- アクティブ Covenant の Effect 取得 ---

export function getActiveCovenantEffects(
  villageId: string,
  awState: AutonomousWorldState,
  currentTick: number,
): Effect[] {
  const effects: Effect[] = [];

  for (const covenant of awState.covenants.values()) {
    // アクティブかチェック
    if (covenant.repealedAtTick !== null) continue;
    if (covenant.expiresAtTick !== null && currentTick >= covenant.expiresAtTick) continue;
    if (covenant.relevance <= 0) continue;

    // この村に適用されるか
    const applies =
      (covenant.scope === 'village' && covenant.villageId === villageId) ||
      (covenant.scope === 'bilateral' && (covenant.villageId === villageId || covenant.targetVillageId === villageId)) ||
      (covenant.scope === 'global');

    if (!applies) continue;

    // 全条項の Effect を集める
    for (const clause of covenant.clauses) {
      const clauseEffects = clauseToEffects(clause);

      // bilateral の tribute は方向性がある
      if (clause.type === 'tribute' && covenant.scope === 'bilateral') {
        if (covenant.villageId === villageId) {
          // 制定村はコスト側
          effects.push(...clauseEffects.map(e => clampEffect(e)));
        } else if (covenant.targetVillageId === villageId) {
          // 対象村は受益側（符号反転）
          effects.push(...clauseEffects.map(e => clampEffect({ ...e, value: -e.value })));
        }
      } else {
        effects.push(...clauseEffects.map(e => clampEffect(e)));
      }
    }
  }

  return effects;
}

// --- 契約の relevance 減衰 (忘却法則) ---

export function decayCovenantRelevance(awState: AutonomousWorldState): void {
  for (const covenant of awState.covenants.values()) {
    if (covenant.repealedAtTick !== null) continue;
    covenant.relevance = Math.max(0, covenant.relevance - RELEVANCE_DECAY_RATE);
  }
}

// --- アクティブ契約数を取得 ---

export function getActiveCovenantCount(villageId: string, awState: AutonomousWorldState, currentTick: number): number {
  let count = 0;
  for (const covenant of awState.covenants.values()) {
    if (covenant.repealedAtTick !== null) continue;
    if (covenant.expiresAtTick !== null && currentTick >= covenant.expiresAtTick) continue;
    if (covenant.villageId === villageId) count++;
  }
  return count;
}

// --- 建物禁止チェック ---

export function isBuildingBanned(
  villageId: string,
  buildingDefId: string,
  awState: AutonomousWorldState,
  currentTick: number,
): boolean {
  for (const covenant of awState.covenants.values()) {
    if (covenant.repealedAtTick !== null) continue;
    if (covenant.expiresAtTick !== null && currentTick >= covenant.expiresAtTick) continue;
    if (covenant.villageId !== villageId && covenant.scope !== 'global') continue;

    for (const clause of covenant.clauses) {
      if (clause.type === 'building_ban' && clause.params.buildingDefId === buildingDefId) {
        return true;
      }
    }
  }
  return false;
}
