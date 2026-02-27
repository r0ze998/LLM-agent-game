import { useState } from 'react';
import { useUIStore } from '../../store/uiStore.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { useWalletStore } from '../../store/walletStore.ts';
import { wsClient } from '../../services/wsClient.ts';
import { executeCommandOnChain } from '../../services/starknetTx.ts';
import { BUILDING_DEFS, TECH_DEFS, UNIT_DEFS } from '@murasato/shared';
import type { ResourceType4X, VillageState4XSerialized } from '@murasato/shared';

const RESOURCE_COLORS: Record<ResourceType4X, string> = {
  food: '#5add5a',
  wood: '#c4956a',
  stone: '#999',
  iron: '#7a9ec7',
  gold: '#ffd700',
};

const RESOURCE_NAMES: Record<ResourceType4X, string> = {
  food: '食料',
  wood: '木材',
  stone: '石材',
  iron: '鉄',
  gold: '金',
};

const CATEGORY_NAMES: Record<string, string> = {
  economy: '経済',
  military: '軍事',
  culture: '文化',
  infrastructure: 'インフラ',
};

export function StrategyPanel() {
  const selectedVillageId = useUIStore((s) => s.selectedVillageId);
  const showStrategy = useUIStore((s) => s.showStrategy);
  const selectVillage = useUIStore((s) => s.selectVillage);
  const village4xStates = useGameStore((s) => s.village4xStates);
  const villages = useGameStore((s) => s.villages);

  const [buildId, setBuildId] = useState('');
  const [trainId, setTrainId] = useState('');
  const [trainCount, setTrainCount] = useState(1);

  if (!showStrategy || !selectedVillageId) return null;

  const state = village4xStates.get(selectedVillageId);
  const village = villages.get(selectedVillageId);
  if (!state) {
    return (
      <div style={panelStyle}>
        <Header name={village?.name ?? selectedVillageId} onClose={() => selectVillage(null)} />
        <p style={{ color: '#888', fontSize: 12, padding: 8 }}>4X状態がまだ読み込まれていません</p>
      </div>
    );
  }

  const isOnChain = useWalletStore((s) => s.isOnChain);
  const [txPending, setTxPending] = useState(false);

  const sendCmd = async (command: any) => {
    if (isOnChain) {
      setTxPending(true);
      try {
        const result = await executeCommandOnChain(command);
        if (result.success) {
          console.log(`[StrategyPanel] On-chain TX: ${result.txHash}`);
        } else {
          console.error(`[StrategyPanel] On-chain TX failed: ${result.error}`);
        }
      } finally {
        setTxPending(false);
      }
    } else {
      wsClient.sendCommand('player', command);
    }
  };

  return (
    <div style={panelStyle}>
      <Header
        name={village?.name ?? selectedVillageId}
        score={state.score}
        population={state.population}
        housing={state.housingCapacity}
        onClose={() => selectVillage(null)}
      />

      {/* Resources */}
      <Section title="資源">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(['food', 'wood', 'stone', 'iron', 'gold'] as ResourceType4X[]).map((r) => (
            <ResourceBadge
              key={r}
              type={r}
              amount={Math.floor(state.resources[r])}
              max={state.resourceStorage[r]}
            />
          ))}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: '#aaa' }}>
          人口: {state.population} / {state.housingCapacity}
          {' | '}研究: {Math.floor(state.researchPoints)}
          {' | '}文化: {Math.floor(state.culturePoints)}
        </div>
      </Section>

      {/* Buildings */}
      <Section title="建物">
        <BuildingsSection buildings={state.buildings} />
      </Section>

      {/* Queues */}
      {(state.buildQueue.length > 0 || state.researchQueue.length > 0 || state.trainQueue.length > 0) && (
        <Section title="キュー">
          <QueueSection items={[...state.buildQueue, ...state.researchQueue, ...state.trainQueue]} />
        </Section>
      )}

      {/* Military */}
      {state.garrison.length > 0 && (
        <Section title="駐留軍">
          <MilitarySection garrison={state.garrison} />
        </Section>
      )}

      {/* Actions */}
      <Section title="アクション">
        {/* Build */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <select
            value={buildId}
            onChange={(e) => setBuildId(e.target.value)}
            style={selectStyle}
          >
            <option value="">建設...</option>
            {Object.values(BUILDING_DEFS).map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameJa} ({Object.entries(b.cost).map(([r, v]) => `${RESOURCE_NAMES[r as ResourceType4X]}${v}`).join(', ')})
              </option>
            ))}
          </select>
          <button
            style={actionBtnStyle}
            disabled={!buildId}
            onClick={() => {
              if (!buildId) return;
              sendCmd({ type: 'build', villageId: selectedVillageId, buildingDefId: buildId, position: { x: 0, y: 0 } });
              setBuildId('');
            }}
          >
            建設
          </button>
        </div>

        {/* Research */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                sendCmd({ type: 'research', villageId: selectedVillageId, techDefId: e.target.value });
              }
            }}
            style={selectStyle}
          >
            <option value="">研究...</option>
            {Object.values(TECH_DEFS)
              .filter((t) => !state.researchedTechs.includes(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nameJa} (コスト: {t.researchCost})
                </option>
              ))}
          </select>
        </div>

        {/* Train */}
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={trainId}
            onChange={(e) => setTrainId(e.target.value)}
            style={selectStyle}
          >
            <option value="">訓練...</option>
            {Object.values(UNIT_DEFS).map((u) => (
              <option key={u.id} value={u.id}>
                {u.nameJa} ({Object.entries(u.trainCost).map(([r, v]) => `${RESOURCE_NAMES[r as ResourceType4X]}${v}`).join(', ')})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={20}
            value={trainCount}
            onChange={(e) => setTrainCount(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ ...selectStyle, width: 40, textAlign: 'center' }}
          />
          <button
            style={actionBtnStyle}
            disabled={!trainId}
            onClick={() => {
              if (!trainId) return;
              sendCmd({ type: 'train', villageId: selectedVillageId, unitDefId: trainId, count: trainCount });
              setTrainId('');
            }}
          >
            訓練
          </button>
        </div>
      </Section>
    </div>
  );
}

function Header({ name, score, population, housing, onClose }: {
  name: string;
  score?: number;
  population?: number;
  housing?: number;
  onClose: () => void;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 12px', borderBottom: '1px solid rgba(74,111,165,0.3)',
    }}>
      <div>
        <span style={{ color: '#7ab8ff', fontWeight: 'bold', fontSize: 14 }}>{name}</span>
        {score !== undefined && (
          <span style={{ color: '#ffd700', fontSize: 11, marginLeft: 8 }}>★{score}</span>
        )}
        {population !== undefined && (
          <span style={{ color: '#aaa', fontSize: 11, marginLeft: 8 }}>👤{population}/{housing}</span>
        )}
      </div>
      <button onClick={onClose} style={closeBtnStyle}>✕</button>
    </div>
  );
}

function ResourceBadge({ type, amount, max }: { type: ResourceType4X; amount: number; max: number }) {
  const pct = Math.min(100, (amount / Math.max(max, 1)) * 100);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '2px 6px', fontSize: 11,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%', background: RESOURCE_COLORS[type],
        boxShadow: `0 0 4px ${RESOURCE_COLORS[type]}40`,
      }} />
      <span style={{ color: RESOURCE_COLORS[type] }}>{amount}</span>
      <div style={{
        width: 30, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: RESOURCE_COLORS[type], borderRadius: 2 }} />
      </div>
    </div>
  );
}

function BuildingsSection({ buildings }: { buildings: VillageState4XSerialized['buildings'] }) {
  if (buildings.length === 0) {
    return <span style={{ color: '#666', fontSize: 11 }}>建物なし</span>;
  }
  const grouped: Record<string, typeof buildings> = {};
  for (const b of buildings) {
    const def = BUILDING_DEFS[b.defId];
    const cat = def?.category ?? 'other';
    (grouped[cat] ??= []).push(b);
  }
  return (
    <div style={{ fontSize: 11 }}>
      {Object.entries(grouped).map(([cat, blds]) => (
        <div key={cat} style={{ marginBottom: 2 }}>
          <span style={{ color: '#7a9ec7', fontSize: 10 }}>{CATEGORY_NAMES[cat] ?? cat}</span>
          {' '}
          {blds.map((b, i) => {
            const def = BUILDING_DEFS[b.defId];
            return (
              <span key={i} style={{ color: '#ccc' }}>
                {def?.nameJa ?? b.defId}
                {i < blds.length - 1 ? ', ' : ''}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function QueueSection({ items }: { items: { defId: string; remainingTicks: number; totalTicks: number; queueType: string }[] }) {
  return (
    <div style={{ fontSize: 11 }}>
      {items.map((item, i) => {
        const def = BUILDING_DEFS[item.defId] ?? TECH_DEFS[item.defId] ?? UNIT_DEFS[item.defId];
        const name = (def as any)?.nameJa ?? item.defId;
        const pct = Math.max(0, ((item.totalTicks - item.remainingTicks) / item.totalTicks) * 100);
        const typeLabel = item.queueType === 'building' ? '建設' : item.queueType === 'research' ? '研究' : '訓練';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ color: '#888', fontSize: 10, width: 24 }}>{typeLabel}</span>
            <span style={{ color: '#ccc', flex: 1 }}>{name}</span>
            <div style={{ width: 50, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#5add5a', borderRadius: 2 }} />
            </div>
            <span style={{ color: '#888', fontSize: 10 }}>{item.remainingTicks}t</span>
          </div>
        );
      })}
    </div>
  );
}

function MilitarySection({ garrison }: { garrison: VillageState4XSerialized['garrison'] }) {
  return (
    <div style={{ fontSize: 11 }}>
      {garrison.map((u, i) => {
        const def = UNIT_DEFS[u.defId];
        return (
          <div key={i} style={{ display: 'flex', gap: 8, color: '#ccc' }}>
            <span>{def?.nameJa ?? u.defId}</span>
            <span style={{ color: '#ffd700' }}>×{u.count}</span>
            {u.veterancy > 0 && <span style={{ color: '#dd5555', fontSize: 10 }}>★{u.veterancy}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(74,111,165,0.15)' }}>
      <div style={{ color: '#7a9ec7', fontSize: 10, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 56,
  left: 8,
  width: 320,
  maxHeight: 'calc(100vh - 120px)',
  background: 'rgba(13,13,36,0.92)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(74,111,165,0.3)',
  borderRadius: 8,
  fontFamily: '"M PLUS 1p", monospace',
  color: '#e8e8e8',
  fontSize: 13,
  zIndex: 90,
  overflowY: 'auto',
  overflowX: 'hidden',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 4px',
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  background: '#111',
  border: '1px solid #444',
  borderRadius: 4,
  color: '#ccc',
  fontSize: 11,
  padding: '3px 6px',
  fontFamily: 'inherit',
};

const actionBtnStyle: React.CSSProperties = {
  background: 'rgba(74,111,165,0.3)',
  border: '1px solid #4a6fa5',
  borderRadius: 4,
  color: '#7ab8ff',
  fontSize: 11,
  padding: '3px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
