import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 60,
  right: 16,
  width: 280,
  maxHeight: 'calc(100vh - 120px)',
  overflowY: 'auto',
  background: 'linear-gradient(180deg, #1a1a3e 0%, #0d0d24 100%)',
  border: '2px solid #4a6fa5',
  borderRadius: 8,
  padding: 12,
  color: '#e8e8e8',
  fontFamily: '"M PLUS 1p", monospace',
  fontSize: 13,
  zIndex: 80,
};

export function AgentInspector() {
  const show = useUIStore((s) => s.showAgentInspector);
  const selectedId = useUIStore((s) => s.selectedAgentId);
  const selectAgent = useUIStore((s) => s.selectAgent);
  const followAgent = useUIStore((s) => s.followAgent);
  const agents = useGameStore((s) => s.agents);

  if (!show || !selectedId) return null;

  const agent = agents.get(selectedId);
  if (!agent) return null;

  const { identity, needs, position, currentAction, inventory } = agent;
  const p = identity.personality;

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 'bold', fontSize: 16, color: '#7ab8ff' }}>{identity.name}</span>
        <button onClick={() => selectAgent(null)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
      </div>

      {/* Basic info */}
      <Section title="基本情報">
        <Row label="世代" value={`第${identity.generation}世代`} />
        <Row label="年齢" value={`${identity.age} / ${identity.lifespan}`} />
        <Row label="状態" value={statusLabel(identity.status)} />
        <Row label="位置" value={`(${position.x}, ${position.y})`} />
        {currentAction && <Row label="行動" value={currentAction} />}
      </Section>

      {/* Needs */}
      <Section title="状態">
        <Bar label="空腹" value={needs.hunger} color="#e05050" />
        <Bar label="体力" value={needs.energy} color="#50b050" />
        <Bar label="社交" value={needs.social} color="#5080e0" />
      </Section>

      {/* Personality radar (simple text) */}
      <Section title="性格">
        <Bar label="好奇心" value={p.openness} color="#ffa040" />
        <Bar label="協調性" value={p.agreeableness} color="#40c040" />
        <Bar label="勤勉性" value={p.conscientiousness} color="#4080ff" />
        <Bar label="勇敢さ" value={p.courage} color="#ff4040" />
        <Bar label="野心" value={p.ambition} color="#c040c0" />
      </Section>

      {/* Philosophy */}
      <Section title="信条">
        <Row label="統治" value={identity.philosophy.governance} />
        <Row label="経済" value={identity.philosophy.economics} />
        <Row label="価値観" value={identity.philosophy.values.join(', ')} />
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4, fontStyle: 'italic' }}>
          「{identity.philosophy.worldview}」
        </div>
      </Section>

      {/* Inventory */}
      {Object.keys(inventory).length > 0 && (
        <Section title="所持品">
          {Object.entries(inventory).map(([resource, amount]) => (
            <Row key={resource} label={resource} value={String(amount)} />
          ))}
        </Section>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <button onClick={() => followAgent(selectedId)} style={actionBtn}>追跡</button>
        <button onClick={() => followAgent(null)} style={actionBtn}>追跡解除</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 'bold', color: '#7a9ec7', fontSize: 11, marginBottom: 4, borderBottom: '1px solid #333', paddingBottom: 2 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
      <span style={{ color: '#999' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: '#999' }}>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div style={{ background: '#222', borderRadius: 2, height: 6, overflow: 'hidden' }}>
        <div style={{ background: color, width: `${value}%`, height: '100%', borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'child': return '子供';
    case 'adult': return '成人';
    case 'elder': return '老人';
    case 'dead': return '死亡';
    default: return status;
  }
}

const actionBtn: React.CSSProperties = {
  flex: 1, background: '#2a3a5a', border: '1px solid #4a6fa5', borderRadius: 4,
  padding: '4px 8px', color: '#aaccff', cursor: 'pointer', fontSize: 12,
};
