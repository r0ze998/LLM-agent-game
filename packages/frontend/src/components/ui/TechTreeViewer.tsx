import { useUIStore } from '../../store/uiStore.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { wsClient } from '../../services/wsClient.ts';
import { TECH_DEFS, getTechsByBranch } from '@murasato/shared';

const BRANCH_CONFIG = {
  agriculture: { color: '#5add5a', label: 'Agriculture' },
  military: { color: '#dd5555', label: 'Military' },
  culture: { color: '#bb77dd', label: 'Culture' },
} as const;

const BRANCHES = ['agriculture', 'military', 'culture'] as const;
const NODE_W = 140;
const NODE_H = 48;
const COL_GAP = 40;
const ROW_GAP = 20;
const HEADER_H = 40;
const PADDING = 24;

export function TechTreeViewer() {
  const showTechTree = useUIStore((s) => s.showTechTree);
  const toggleTechTree = useUIStore((s) => s.toggleTechTree);
  const selectedVillageId = useUIStore((s) => s.selectedVillageId);
  const village4xStates = useGameStore((s) => s.village4xStates);

  if (!showTechTree) return null;

  const state = selectedVillageId ? village4xStates.get(selectedVillageId) : null;
  const researchedTechs = new Set(state?.researchedTechs ?? []);
  const researchingIds = new Set(
    (state?.researchQueue ?? []).map((q) => q.defId)
  );

  const totalW = BRANCHES.length * NODE_W + (BRANCHES.length - 1) * COL_GAP + PADDING * 2;
  const totalH = 10 * (NODE_H + ROW_GAP) + HEADER_H + PADDING * 2;

  const getNodePos = (branchIdx: number, tier: number) => ({
    x: PADDING + branchIdx * (NODE_W + COL_GAP),
    y: HEADER_H + PADDING + (tier - 1) * (NODE_H + ROW_GAP),
  });

  const canResearch = (techId: string): boolean => {
    if (researchedTechs.has(techId)) return false;
    const def = TECH_DEFS[techId];
    if (!def) return false;
    if (def.requires.tech && !researchedTechs.has(def.requires.tech)) return false;
    return true;
  };

  const handleResearch = (techId: string) => {
    if (!selectedVillageId || !canResearch(techId)) return;
    wsClient.sendCommand('player', { type: 'research', villageId: selectedVillageId, techDefId: techId });
  };

  // Build prerequisite lines
  const lines: { fromBranch: number; fromTier: number; toBranch: number; toTier: number; color: string }[] = [];
  for (const [bi, branch] of BRANCHES.entries()) {
    const techs = getTechsByBranch(branch);
    for (const tech of techs) {
      if (tech.requires.tech) {
        const prereq = TECH_DEFS[tech.requires.tech];
        if (prereq) {
          const prereqBi = BRANCHES.indexOf(prereq.branch as typeof BRANCHES[number]);
          lines.push({
            fromBranch: prereqBi >= 0 ? prereqBi : bi,
            fromTier: prereq.tier,
            toBranch: bi,
            toTier: tech.tier,
            color: BRANCH_CONFIG[branch].color,
          });
        }
      }
    }
  }

  return (
    <div style={overlayStyle} onClick={toggleTechTree}>
      <div style={containerStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleBarStyle}>
          <span style={{ color: '#7ab8ff', fontWeight: 'bold', fontSize: 16 }}>Tech Tree</span>
          {!selectedVillageId && (
            <span style={{ color: '#888', fontSize: 11, marginLeft: 12 }}>Select a village</span>
          )}
          <button onClick={toggleTechTree} style={closeBtnStyle}>✕</button>
        </div>

        <div style={{ overflow: 'auto', maxHeight: 'calc(90vh - 48px)' }}>
          <svg width={totalW} height={totalH} style={{ display: 'block' }}>
            {/* Branch headers */}
            {BRANCHES.map((branch, bi) => {
              const x = PADDING + bi * (NODE_W + COL_GAP) + NODE_W / 2;
              return (
                <text
                  key={branch}
                  x={x}
                  y={PADDING + 12}
                  textAnchor="middle"
                  fill={BRANCH_CONFIG[branch].color}
                  fontSize={14}
                  fontWeight="bold"
                  fontFamily='"M PLUS 1p", monospace'
                >
                  {BRANCH_CONFIG[branch].label}
                </text>
              );
            })}

            {/* Prerequisite lines */}
            {lines.map((line, i) => {
              const from = getNodePos(line.fromBranch, line.fromTier);
              const to = getNodePos(line.toBranch, line.toTier);
              return (
                <line
                  key={i}
                  x1={from.x + NODE_W / 2}
                  y1={from.y + NODE_H}
                  x2={to.x + NODE_W / 2}
                  y2={to.y}
                  stroke={line.color}
                  strokeOpacity={0.3}
                  strokeWidth={2}
                />
              );
            })}

            {/* Tech nodes */}
            {BRANCHES.map((branch, bi) => {
              const techs = getTechsByBranch(branch);
              const cfg = BRANCH_CONFIG[branch];
              return techs.map((tech) => {
                const pos = getNodePos(bi, tech.tier);
                const researched = researchedTechs.has(tech.id);
                const available = canResearch(tech.id);
                const researching = researchingIds.has(tech.id);
                const locked = !researched && !available && !researching;

                return (
                  <g
                    key={tech.id}
                    style={{ cursor: available ? 'pointer' : 'default' }}
                    onClick={() => available && handleResearch(tech.id)}
                  >
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={6}
                      fill={researched ? cfg.color + '30' : 'rgba(13,13,36,0.8)'}
                      stroke={researched ? cfg.color : available ? cfg.color + '99' : cfg.color + '33'}
                      strokeWidth={researched ? 2 : 1}
                      opacity={locked ? 0.4 : 1}
                    />
                    <text
                      x={pos.x + NODE_W / 2}
                      y={pos.y + 20}
                      textAnchor="middle"
                      fill={researched ? '#fff' : locked ? '#666' : '#ccc'}
                      fontSize={11}
                      fontFamily='"M PLUS 1p", monospace'
                    >
                      {tech.name}
                    </text>
                    <text
                      x={pos.x + NODE_W / 2}
                      y={pos.y + 36}
                      textAnchor="middle"
                      fill={researched ? cfg.color : '#888'}
                      fontSize={9}
                      fontFamily='"M PLUS 1p", monospace'
                    >
                      {researched ? '✓ Researched' : researching ? '⏳ Researching' : `Cost: ${tech.researchCost}`}
                    </text>
                    {researched && (
                      <rect
                        x={pos.x}
                        y={pos.y}
                        width={NODE_W}
                        height={NODE_H}
                        rx={6}
                        fill={cfg.color}
                        opacity={0.08}
                      />
                    )}
                  </g>
                );
              });
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const containerStyle: React.CSSProperties = {
  background: 'rgba(13,13,36,0.95)',
  border: '1px solid rgba(74,111,165,0.4)',
  borderRadius: 12,
  maxWidth: '95vw',
  maxHeight: '90vh',
  fontFamily: '"M PLUS 1p", monospace',
};

const titleBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 16px',
  borderBottom: '1px solid rgba(74,111,165,0.3)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  fontSize: 16,
  padding: '2px 6px',
};
