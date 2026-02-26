// === Combat Engine — 戦闘解決の物理法則 ===

import { UNIT_DEFS, TERRAIN_RULES } from '@murasato/shared';
import type { ArmyUnit, CombatResult, VillageState4X, Resources4X } from '@murasato/shared';
import {
  COMBAT_RANDOM_MIN,
  COMBAT_RANDOM_MAX,
  ATTACKER_LOSS_RATE,
  DEFENDER_LOSS_RATE,
  VETERANCY_GAIN_PER_BATTLE,
} from '@murasato/shared';
import type { TerrainType4X } from '@murasato/shared';
import { aggregateEffects } from './ruleEngine.ts';

// --- 攻撃力計算 ---

function computeAttackPower(
  units: ArmyUnit[],
  village: VillageState4X,
  terrain: TerrainType4X,
): number {
  const agg = aggregateEffects(village);
  const terrainRule = TERRAIN_RULES[terrain];
  const terrainAttackMod = 1 - (terrainRule?.attackPenalty || 0);

  let total = 0;
  for (const unit of units) {
    const def = UNIT_DEFS[unit.defId];
    if (!def) continue;

    const baseAttack = def.attack * unit.count;
    const veterancyMod = 1 + unit.veterancy * 0.01;
    const techMod = 1 + agg.attackBonus + (agg.unitAttackBonus.get(unit.defId) || 0);

    total += baseAttack * veterancyMod * terrainAttackMod * techMod;
  }

  return total;
}

// --- 防御力計算 ---

function computeDefensePower(
  units: ArmyUnit[],
  village: VillageState4X,
  terrain: TerrainType4X,
  includeFortification: boolean,
): number {
  const agg = aggregateEffects(village);
  const terrainRule = TERRAIN_RULES[terrain];
  const terrainDefMod = 1 + (terrainRule?.defenseBonus || 0);

  let total = includeFortification ? agg.fortification : 0;

  for (const unit of units) {
    const def = UNIT_DEFS[unit.defId];
    if (!def) continue;

    const baseDefense = def.defense * unit.count;
    const veterancyMod = 1 + unit.veterancy * 0.01;
    const techMod = 1 + agg.defenseBonus + (agg.unitDefenseBonus.get(unit.defId) || 0);

    total += baseDefense * veterancyMod * terrainDefMod * techMod;
  }

  return total;
}

// --- 損害適用 ---

function applyLosses(units: ArmyUnit[], lossRate: number): ArmyUnit[] {
  const losses: ArmyUnit[] = [];

  for (const unit of units) {
    const lostCount = Math.max(0, Math.ceil(unit.count * lossRate));
    losses.push({ defId: unit.defId, count: lostCount, veterancy: unit.veterancy });
    unit.count = Math.max(0, unit.count - lostCount);
  }

  return losses;
}

function addVeterancy(units: ArmyUnit[]): void {
  for (const unit of units) {
    if (unit.count > 0) {
      unit.veterancy = Math.min(100, unit.veterancy + VETERANCY_GAIN_PER_BATTLE);
    }
  }
}

// --- 戦闘解決 ---

export function resolveCombat(
  attackerVillage: VillageState4X,
  defenderVillage: VillageState4X,
  attackingUnits: ArmyUnit[],
  defendingUnits: ArmyUnit[],
  terrain: TerrainType4X,
): CombatResult {
  const attackPower = computeAttackPower(attackingUnits, attackerVillage, terrain);
  const defensePower = computeDefensePower(
    defendingUnits,
    defenderVillage,
    terrain,
    true, // 防御側は城壁含む
  );

  const ratio = attackPower / Math.max(1, defensePower);
  const randomFactor = COMBAT_RANDOM_MIN + Math.random() * (COMBAT_RANDOM_MAX - COMBAT_RANDOM_MIN);
  const effectiveRatio = ratio * randomFactor;

  let attackerLosses: ArmyUnit[];
  let defenderLosses: ArmyUnit[];
  const attackerWon = effectiveRatio > 1.0;

  if (attackerWon) {
    // 攻撃側勝利
    const defLossRate = Math.min(1, (effectiveRatio - 1) * DEFENDER_LOSS_RATE);
    const atkLossRate = Math.min(0.5, (1 / effectiveRatio) * 0.2); // 勝者にも軽い損害
    defenderLosses = applyLosses(defendingUnits, defLossRate);
    attackerLosses = applyLosses(attackingUnits, atkLossRate);
  } else {
    // 防御側勝利
    const atkLossRate = Math.min(1, (1 - effectiveRatio + 1) * ATTACKER_LOSS_RATE);
    const defLossRate = Math.min(0.3, effectiveRatio * 0.15); // 勝者にも軽い損害
    attackerLosses = applyLosses(attackingUnits, atkLossRate);
    defenderLosses = applyLosses(defendingUnits, defLossRate);
  }

  // 経験値付与
  addVeterancy(attackingUnits);
  addVeterancy(defendingUnits);

  // 0のユニットを除去
  const cleanUnits = (units: ArmyUnit[]) => units.filter(u => u.count > 0);
  attackingUnits.splice(0, attackingUnits.length, ...cleanUnits(attackingUnits));
  defendingUnits.splice(0, defendingUnits.length, ...cleanUnits(defendingUnits));

  return {
    attackerVillageId: attackerVillage.villageId,
    defenderVillageId: defenderVillage.villageId,
    attackerWon,
    attackerLosses,
    defenderLosses,
    attackPower,
    defensePower,
    effectiveRatio,
    position: { x: 0, y: 0 }, // 呼び出し側で設定
  };
}

/** 村を征服: 人口半減、建物ダメージ、所有者変更 */
export function conquerVillage(
  winner: VillageState4X,
  loser: VillageState4X,
): void {
  // 人口半減
  loser.population = Math.max(1, Math.floor(loser.population / 2));

  // 建物にダメージ
  for (const building of loser.buildings) {
    building.health = Math.max(0, building.health - 30);
  }
  loser.buildings = loser.buildings.filter(b => b.health > 0);

  // 資源の一部を略奪
  for (const res of ['food', 'wood', 'stone', 'iron', 'gold'] as const) {
    const loot = Math.floor(loser.resources[res] * 0.5);
    loser.resources[res] -= loot;
    winner.resources[res] += loot;
  }

  // 所有者変更
  loser.ownerId = winner.ownerId;

  // 駐留部隊を除去
  loser.garrison = [];
  loser.armies = [];
}
