import { useState } from 'react';
import { useUIStore } from '../../store/uiStore.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { wsClient } from '../../services/wsClient.ts';
import { TILE_SIZE } from '@murasato/shared';
import type { DiplomaticRelation, DiplomaticStatus, Village } from '@murasato/shared';

const STATUS_COLORS: Record<DiplomaticStatus, string> = {
  allied: '#5add5a',
  friendly: '#7ab8ff',
  neutral: '#ffd700',
  hostile: '#ff8844',
  war: '#dd5555',
};

const STATUS_NAMES: Record<DiplomaticStatus, string> = {
  allied: '同盟',
  friendly: '友好',
  neutral: '中立',
  hostile: '敵対',
  war: '戦争',
};

function getTerritoryCenterPixel(territory: { x: number; y: number }[]): { x: number; y: number } {
  if (territory.length === 0) return { x: 0, y: 0 };
  let sumX = 0, sumY = 0;
  for (const t of territory) {
    sumX += t.x;
    sumY += t.y;
  }
  return {
    x: (sumX / territory.length) * TILE_SIZE,
    y: (sumY / territory.length) * TILE_SIZE,
  };
}

function worldToScreen(wx: number, wy: number, vp: { x: number; y: number; zoom: number }, w: number, h: number) {
  return {
    sx: w / 2 + (wx - vp.x) * vp.zoom,
    sy: h / 2 + (wy - vp.y) * vp.zoom,
  };
}

export function DiplomacyOverlay() {
  const showDiplomacy = useUIStore((s) => s.showDiplomacy);
  const toggleDiplomacy = useUIStore((s) => s.toggleDiplomacy);
  const viewport = useUIStore((s) => s.viewport);
  const selectedVillageId = useUIStore((s) => s.selectedVillageId);

  const villages = useGameStore((s) => s.villages);
  const village4xStates = useGameStore((s) => s.village4xStates);
  const diplomaticRelations = useGameStore((s) => s.diplomaticRelations);

  const [popup, setPopup] = useState<{ villageId: string; x: number; y: number } | null>(null);

  if (!showDiplomacy) return null;

  const w = window.innerWidth;
  const h = window.innerHeight;

  // Compute village screen positions
  const villagePositions = new Map<string, { sx: number; sy: number; village: Village }>();
  for (const [id, village] of villages) {
    const state4x = village4xStates.get(id);
    const territory = state4x?.territory ?? village.territory;
    if (territory.length === 0) continue;
    const center = getTerritoryCenterPixel(territory);
    const { sx, sy } = worldToScreen(center.x, center.y, viewport, w, h);
    villagePositions.set(id, { sx, sy, village });
  }

  // Get relation between two villages
  const getRelation = (v1: string, v2: string): DiplomaticRelation | undefined => {
    return diplomaticRelations.find(
      (r) => (r.villageId1 === v1 && r.villageId2 === v2) || (r.villageId1 === v2 && r.villageId2 === v1)
    );
  };

  const getVillageColor = (villageId: string): string => {
    if (!selectedVillageId) return '#7ab8ff';
    if (villageId === selectedVillageId) return '#fff';
    const rel = getRelation(selectedVillageId, villageId);
    return STATUS_COLORS[rel?.status ?? 'neutral'];
  };

  const handleDiplomacy = (action: 'propose_alliance' | 'declare_war' | 'propose_peace' | 'break_alliance') => {
    if (!selectedVillageId || !popup) return;
    wsClient.sendCommand('player', {
      type: 'diplomacy',
      villageId: selectedVillageId,
      targetVillageId: popup.villageId,
      action,
    });
    setPopup(null);
  };

  return (
    <div style={overlayStyle}>
      {/* Close button */}
      <button onClick={toggleDiplomacy} style={closeOverlayBtnStyle}>
        ✕ 外交を閉じる
      </button>

      <svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        {/* Relation lines */}
        {diplomaticRelations.map((rel, i) => {
          const p1 = villagePositions.get(rel.villageId1);
          const p2 = villagePositions.get(rel.villageId2);
          if (!p1 || !p2) return null;
          const color = STATUS_COLORS[rel.status];
          const isDashed = rel.status === 'war' || rel.status === 'hostile';
          return (
            <g key={i}>
              <line
                x1={p1.sx} y1={p1.sy}
                x2={p2.sx} y2={p2.sy}
                stroke={color}
                strokeWidth={rel.status === 'allied' ? 2.5 : 1.5}
                strokeOpacity={0.6}
                strokeDasharray={isDashed ? '6,4' : undefined}
              />
              {rel.tradeActive && (
                <line
                  x1={p1.sx} y1={p1.sy + 3}
                  x2={p2.sx} y2={p2.sy + 3}
                  stroke="#ffd700"
                  strokeWidth={1}
                  strokeOpacity={0.4}
                />
              )}
            </g>
          );
        })}

        {/* Village markers */}
        {[...villagePositions.entries()].map(([id, { sx, sy, village }]) => {
          const color = getVillageColor(id);
          const isSelected = id === selectedVillageId;
          return (
            <g
              key={id}
              style={{ cursor: 'pointer', pointerEvents: 'all' }}
              onClick={(e) => {
                e.stopPropagation();
                if (id !== selectedVillageId) {
                  setPopup({ villageId: id, x: sx, y: sy });
                }
              }}
            >
              {/* Glow */}
              <circle cx={sx} cy={sy} r={isSelected ? 18 : 14} fill={color} opacity={0.15} />
              {/* Circle */}
              <circle
                cx={sx} cy={sy}
                r={isSelected ? 12 : 8}
                fill={isSelected ? color + '40' : color + '20'}
                stroke={color}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              {/* Label */}
              <text
                x={sx} y={sy - 16}
                textAnchor="middle"
                fill={color}
                fontSize={11}
                fontWeight={isSelected ? 'bold' : 'normal'}
                fontFamily='"M PLUS 1p", monospace'
              >
                {village.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Popup */}
      {popup && (() => {
        const rel = selectedVillageId ? getRelation(selectedVillageId, popup.villageId) : undefined;
        const targetVillage = villages.get(popup.villageId);
        const status = rel?.status ?? 'neutral';
        const popupX = Math.min(popup.x + 20, w - 220);
        const popupY = Math.min(popup.y - 20, h - 200);
        return (
          <div
            style={{
              position: 'absolute',
              left: popupX,
              top: popupY,
              background: 'rgba(13,13,36,0.95)',
              border: `1px solid ${STATUS_COLORS[status]}60`,
              borderRadius: 8,
              padding: 12,
              width: 200,
              fontFamily: '"M PLUS 1p", monospace',
              zIndex: 210,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                {targetVillage?.name ?? popup.villageId}
              </span>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: STATUS_COLORS[status] }}>
                {STATUS_NAMES[status]}
              </span>
              {rel && <span style={{ color: '#888', marginLeft: 8 }}>緊張: {rel.tension}</span>}
            </div>
            {selectedVillageId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {status !== 'allied' && status !== 'war' && (
                  <DipBtn label="同盟提案" color="#5add5a" onClick={() => handleDiplomacy('propose_alliance')} />
                )}
                {status !== 'war' && (
                  <DipBtn label="宣戦布告" color="#dd5555" onClick={() => handleDiplomacy('declare_war')} />
                )}
                {status === 'war' && (
                  <DipBtn label="和平提案" color="#ffd700" onClick={() => handleDiplomacy('propose_peace')} />
                )}
                {status === 'allied' && (
                  <DipBtn label="同盟破棄" color="#ff8844" onClick={() => handleDiplomacy('break_alliance')} />
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function DipBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: `${color}15`,
        border: `1px solid ${color}60`,
        borderRadius: 4,
        color,
        fontSize: 11,
        padding: '4px 8px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 150,
};

const closeOverlayBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 56,
  right: 16,
  background: 'rgba(13,13,36,0.9)',
  border: '1px solid rgba(74,111,165,0.4)',
  borderRadius: 6,
  color: '#7a9ec7',
  fontSize: 12,
  padding: '6px 14px',
  cursor: 'pointer',
  fontFamily: '"M PLUS 1p", monospace',
  zIndex: 160,
};
