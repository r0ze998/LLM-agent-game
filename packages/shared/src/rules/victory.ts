// === Victory Condition Definitions (6 types) ===

import type { VictoryConditionDef } from './types.ts';

export const VICTORY_DEFS: VictoryConditionDef[] = [
  {
    type: 'domination',
    name: 'Domination Victory',
    description: 'Conquer 75% of all villages',
    check: { metric: 'village_control_ratio', threshold: 0.75, comparison: 'gte' },
  },
  {
    type: 'culture',
    name: 'Culture Victory',
    description: 'Accumulate 1,000 culture points',
    check: { metric: 'culture_points', threshold: 1000, comparison: 'gte' },
  },
  {
    type: 'diplomacy',
    name: 'Diplomacy Victory',
    description: 'Form alliances with 60% of all villages',
    check: { metric: 'alliance_ratio', threshold: 0.60, comparison: 'gte' },
  },
  {
    type: 'technology',
    name: 'Technology Victory',
    description: 'Complete all techs in one branch',
    check: { metric: 'branch_mastery_count', threshold: 1, comparison: 'gte' },
  },
  {
    type: 'economic',
    name: 'Economic Victory',
    description: 'Earn 10,000 cumulative gold',
    check: { metric: 'total_gold_earned', threshold: 10000, comparison: 'gte' },
  },
  {
    type: 'score',
    name: 'Score Victory',
    description: 'Win by highest score after 500 turns',
    check: { metric: 'tick_count', threshold: 500, comparison: 'gte' },
  },
];
