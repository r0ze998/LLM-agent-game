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
    <div style={{ ...panelStyle, animation: 'slideDown 0.2s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 'bold', fontSize: 16, color: '#7ab8ff' }}>{identity.name}</span>
        <button onClick={() => selectAgent(null)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
      </div>

      {/* Basic info */}
      <Section title="Info">
        <Row label="Gen" value={`Gen ${identity.generation}`} />
        <Row label="Age" value={`${identity.age} / ${identity.lifespan}`} />
        <Row label="Status" value={statusLabel(identity.status)} />
        <Row label="Pos" value={`(${position.x}, ${position.y})`} />
        {currentAction && <Row label="Action" value={currentAction} />}
      </Section>

      {/* Needs */}
      <Section title="Needs">
        <Bar label="Hunger" value={needs.hunger} color="#e05050" />
        <Bar label="Energy" value={needs.energy} color="#50b050" />
        <Bar label="Social" value={needs.social} color="#5080e0" />
      </Section>

      {/* Personality radar (simple text) */}
      <Section title="Personality">
        <Bar label="Openness" value={p.openness} color="#ffa040" />
        <Bar label="Agreeableness" value={p.agreeableness} color="#40c040" />
        <Bar label="Conscientiousness" value={p.conscientiousness} color="#4080ff" />
        <Bar label="Courage" value={p.courage} color="#ff4040" />
        <Bar label="Ambition" value={p.ambition} color="#c040c0" />
      </Section>

      {/* Philosophy */}
      <Section title="Philosophy">
        <Row label="Governance" value={identity.philosophy.governance} />
        <Row label="Economics" value={identity.philosophy.economics} />
        <Row label="Values" value={identity.philosophy.values.join(', ')} />
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4, fontStyle: 'italic' }}>
          "{identity.philosophy.worldview}"
        </div>
      </Section>

      {/* AI Thought & Plan */}
      {(agent as any)._cachedPlan && (
        <Section title="AI Thought">
          <div style={{ fontSize: 12, color: '#d4c4f0', fontStyle: 'italic', marginBottom: 6, lineHeight: 1.5 }}>
            "{(agent as any)._cachedPlan.innerThought}"
          </div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Today's plan:</div>
          {((agent as any)._cachedPlan.schedule as { slot: number; action: string; reason: string }[])
            .filter((_: any, i: number) => i < 8)
            .map((s: { slot: number; action: string; reason: string }) => (
              <div key={s.slot} style={{ fontSize: 11, padding: '1px 0', display: 'flex', gap: 6 }}>
                <span style={{ color: '#666', minWidth: 20 }}>{s.slot}h</span>
                <span style={{ color: '#7ab8ff', minWidth: 48 }}>{s.action}</span>
                <span style={{ color: '#777', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.reason}</span>
              </div>
            ))}
        </Section>
      )}

      {/* Inventory */}
      {Object.keys(inventory).length > 0 && (
        <Section title="Inventory">
          {Object.entries(inventory).map(([resource, amount]) => (
            <Row key={resource} label={resource} value={String(amount)} />
          ))}
        </Section>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <button onClick={() => followAgent(selectedId)} style={actionBtn}>Follow</button>
        <button onClick={() => followAgent(null)} style={actionBtn}>Unfollow</button>
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
    case 'child': return 'Child';
    case 'adult': return 'Adult';
    case 'elder': return 'Elder';
    case 'dead': return 'Dead';
    default: return status;
  }
}

const actionBtn: React.CSSProperties = {
  flex: 1, background: '#2a3a5a', border: '1px solid #4a6fa5', borderRadius: 4,
  padding: '4px 8px', color: '#aaccff', cursor: 'pointer', fontSize: 12,
};
