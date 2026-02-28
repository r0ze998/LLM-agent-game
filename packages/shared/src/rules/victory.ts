// === 勝利条件定義（5種） ===

import type { VictoryConditionDef } from './types.ts';

export const VICTORY_DEFS: VictoryConditionDef[] = [
  {
    type: 'domination',
    name: 'Domination Victory',
    nameJa: '制覇勝利',
    description: '全村の75%を征服する',
    check: { metric: 'village_control_ratio', threshold: 0.75, comparison: 'gte' },
  },
  {
    type: 'culture',
    name: 'Culture Victory',
    nameJa: '文化勝利',
    description: '文化ポイントを1000蓄積する',
    check: { metric: 'culture_points', threshold: 1000, comparison: 'gte' },
  },
  {
    type: 'diplomacy',
    name: 'Diplomacy Victory',
    nameJa: '外交勝利',
    description: '全村の60%と同盟を結ぶ',
    check: { metric: 'alliance_ratio', threshold: 0.60, comparison: 'gte' },
  },
  {
    type: 'technology',
    name: 'Technology Victory',
    nameJa: '技術勝利',
    description: '1つの技術ブランチを完全制覇する',
    check: { metric: 'branch_mastery_count', threshold: 1, comparison: 'gte' },
  },
  {
    type: 'economic',
    name: 'Economic Victory',
    nameJa: '経済勝利',
    description: '累計ゴールド獲得量10,000を達成する',
    check: { metric: 'total_gold_earned', threshold: 10000, comparison: 'gte' },
  },
  {
    type: 'score',
    name: 'Score Victory',
    nameJa: 'スコア勝利',
    description: '500ターン経過時の最高スコアで勝利',
    check: { metric: 'tick_count', threshold: 500, comparison: 'gte' },
  },
];
