// F18: Victory Progress Tracker — 勝利進捗パネル
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';
import { VICTORY_DEFS, SCORE_VICTORY_TICK, TECH_DEFS, ECONOMIC_VICTORY_REVENUE_USD } from '@murasato/shared';

const TECH_BRANCHES: Record<string, string[]> = {
  agriculture: ['agriculture', 'irrigation', 'animal_husbandry', 'crop_rotation', 'watermill', 'guilds', 'banking', 'economics', 'industrialization', 'agriculture_mastery'],
  military: ['bronze_working', 'archery', 'horseback_riding', 'iron_working', 'fortification', 'siege_warfare', 'steel', 'gunpowder', 'tactics', 'military_mastery'],
  culture: ['writing', 'philosophy', 'mysticism', 'education', 'arts', 'theology', 'printing', 'enlightenment', 'ideology', 'culture_mastery'],
};

export function VictoryPanel() {
  const showVictory = useUIStore((s) => s.showVictory);
  const toggleVictory = useUIStore((s) => s.toggleVictory);
  const selectedVillageId = useUIStore((s) => s.selectedVillageId);
  const village4xStates = useGameStore((s) => s.village4xStates);
  const villages = useGameStore((s) => s.villages);
  const game = useGameStore((s) => s.game);
  const diplomaticRelations = useGameStore((s) => s.diplomaticRelations);
  const paymentStats = useGameStore((s) => s.paymentStats);

  if (!showVictory) return null;

  const vs = selectedVillageId ? village4xStates.get(selectedVillageId) : null;
  const totalVillages = village4xStates.size;

  // Compute progress for each victory condition
  type Progress = { name: string; nameJa: string; current: number; target: number; pct: number };
  const progresses: Progress[] = [];

  for (const def of VICTORY_DEFS) {
    let current = 0;
    let target = 1;

    switch (def.type) {
      case 'domination': {
        // Villages controlled by this player (vs selected village)
        const ownedCount = vs ? 1 : 0; // Simplified: count villages with same ownerId
        if (vs) {
          let count = 0;
          for (const state of village4xStates.values()) {
            if (state.ownerId && state.ownerId === vs.ownerId) count++;
          }
          current = count;
        }
        target = Math.ceil(totalVillages * 0.75);
        break;
      }
      case 'culture': {
        current = vs?.totalCulturePoints ?? 0;
        target = 1000;
        break;
      }
      case 'diplomacy': {
        if (vs && totalVillages > 1) {
          const alliedCount = diplomaticRelations.filter(
            (r) =>
              r.status === 'allied' &&
              (r.villageId1 === selectedVillageId || r.villageId2 === selectedVillageId),
          ).length;
          current = alliedCount;
          target = Math.ceil((totalVillages - 1) * 0.6);
        }
        break;
      }
      case 'technology': {
        if (vs) {
          const researched = new Set(vs.researchedTechs);
          let bestBranch = 0;
          let bestBranchTotal = 10;
          for (const [, techs] of Object.entries(TECH_BRANCHES)) {
            const done = techs.filter((t) => researched.has(t)).length;
            if (done > bestBranch) {
              bestBranch = done;
              bestBranchTotal = techs.length;
            }
          }
          current = bestBranch;
          target = bestBranchTotal;
        }
        break;
      }
      case 'economic': {
        current = paymentStats?.totalRevenue ?? 0;
        target = ECONOMIC_VICTORY_REVENUE_USD;
        break;
      }
      case 'score': {
        current = game?.tick ?? 0;
        target = SCORE_VICTORY_TICK;
        break;
      }
    }

    const pct = target > 0 ? Math.min(1, current / target) : 0;
    progresses.push({ name: def.name, nameJa: def.nameJa, current, target, pct });
  }

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 310,
      background: 'rgba(13, 13, 36, 0.96)',
      border: '1px solid rgba(74, 111, 165, 0.5)',
      borderRadius: 12,
      padding: 24,
      width: 'min(440px, 90vw)',
      fontFamily: '"M PLUS 1p", monospace',
      color: '#e8e8e8',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <h3 style={{ margin: 0, color: '#7ab8ff', fontSize: 16 }}>
          {'\u{1F3C6}'} Victory Conditions
        </h3>
        <button onClick={toggleVictory} style={{
          background: 'none',
          border: 'none',
          color: '#666',
          cursor: 'pointer',
          fontSize: 18,
          fontFamily: 'inherit',
        }}>{'\u2715'}</button>
      </div>

      {!vs && (
        <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
          Select a village to see its victory progress.
        </div>
      )}

      {/* Victory conditions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {progresses.map((p) => (
          <div key={p.name}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#c8d8e8' }}>
                {p.nameJa}
              </span>
              <span style={{ fontSize: 11, color: '#888' }}>
                {p.current} / {p.target}
              </span>
            </div>
            <div style={{
              height: 8,
              background: 'rgba(74, 111, 165, 0.15)',
              borderRadius: 4,
              overflow: 'hidden',
              border: '1px solid rgba(74,111,165,0.2)',
            }}>
              <div style={{
                height: '100%',
                width: `${p.pct * 100}%`,
                background: p.pct >= 1
                  ? 'linear-gradient(90deg, #ffd700, #ffaa00)'
                  : 'linear-gradient(90deg, #4a6fa5, #5ac8fa)',
                borderRadius: 4,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
