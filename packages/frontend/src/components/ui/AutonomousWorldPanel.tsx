// F19: Autonomous World Panel — 自治レイヤー L1-3 可視化
import { useState } from 'react';
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';
import { wsClient } from '../../services/wsClient.ts';
import type { Covenant, Invention, Institution } from '@murasato/shared';

type Tab = 'covenants' | 'inventions' | 'institutions';

export function AutonomousWorldPanel() {
  const showAutonomousWorld = useUIStore((s) => s.showAutonomousWorld);
  const toggleAutonomousWorld = useUIStore((s) => s.toggleAutonomousWorld);
  const selectedVillageId = useUIStore((s) => s.selectedVillageId);
  const gameMode = useUIStore((s) => s.gameMode);
  const covenants = useGameStore((s) => s.covenants);
  const inventions = useGameStore((s) => s.inventions);
  const institutions = useGameStore((s) => s.institutions);
  const [tab, setTab] = useState<Tab>('covenants');

  if (!showAutonomousWorld) return null;

  const isPlayer = gameMode === 'player';

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
      padding: 20,
      width: 'min(560px, 92vw)',
      maxHeight: '80vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"M PLUS 1p", monospace',
      color: '#e8e8e8',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        flexShrink: 0,
      }}>
        <h3 style={{ margin: 0, color: '#7ab8ff', fontSize: 16 }}>
          {'\u{1F3DB}\uFE0F'} Autonomous World
        </h3>
        <button onClick={toggleAutonomousWorld} style={closeBtnStyle}>{'\u2715'}</button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 12,
        flexShrink: 0,
      }}>
        {([
          ['covenants', '\u5951\u7D04', covenants.length] as const,
          ['inventions', '\u767A\u660E', inventions.length] as const,
          ['institutions', '\u5236\u5EA6', institutions.length] as const,
        ]).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1,
              padding: '6px 0',
              background: tab === key ? 'rgba(74, 111, 165, 0.3)' : 'transparent',
              border: `1px solid ${tab === key ? '#4a6fa5' : 'rgba(74,111,165,0.2)'}`,
              borderRadius: 6,
              color: tab === key ? '#fff' : '#7a9ec7',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {tab === 'covenants' && (
          <CovenantList
            covenants={covenants}
            villageId={selectedVillageId}
            isPlayer={isPlayer}
          />
        )}
        {tab === 'inventions' && (
          <InventionList inventions={inventions} />
        )}
        {tab === 'institutions' && (
          <InstitutionList
            institutions={institutions}
            villageId={selectedVillageId}
            isPlayer={isPlayer}
          />
        )}
      </div>
    </div>
  );
}

function CovenantList({ covenants, villageId, isPlayer }: {
  covenants: Covenant[];
  villageId: string | null;
  isPlayer: boolean;
}) {
  if (covenants.length === 0) {
    return <EmptyState text="No active covenants" />;
  }

  const handleVote = (covenantId: string, approve: boolean) => {
    if (!villageId) return;
    wsClient.sendCommand('player', {
      type: 'vote_covenant',
      villageId,
      covenantId,
      approve,
    });
  };

  const handleRepeal = (covenantId: string) => {
    if (!villageId) return;
    wsClient.sendCommand('player', {
      type: 'repeal_covenant',
      villageId,
      covenantId,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {covenants.map((c) => (
        <div key={c.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', fontSize: 12, color: '#c8d8e8' }}>{c.name}</span>
            <span style={scopeBadgeStyle(c.scope)}>{c.scope}</span>
          </div>
          <div style={{ fontSize: 11, color: '#999', margin: '4px 0' }}>{c.description}</div>
          <div style={{ fontSize: 10, color: '#7a9ec7' }}>
            Clauses: {c.clauses.map((cl) => cl.type.replace(/_/g, ' ')).join(', ')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#888' }}>
              <span>Ratified: {c.ratifiedByAgentIds.length}</span>
              <RelevanceBar value={c.relevance} />
            </div>
            {isPlayer && villageId && (
              <div style={{ display: 'flex', gap: 4 }}>
                <SmallButton onClick={() => handleVote(c.id, true)} color="#4ad97a">Vote</SmallButton>
                <SmallButton onClick={() => handleRepeal(c.id)} color="#d94a4a">Repeal</SmallButton>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function InventionList({ inventions }: { inventions: Invention[] }) {
  if (inventions.length === 0) {
    return <EmptyState text="No inventions discovered" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {inventions.map((inv) => (
        <div key={inv.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', fontSize: 12, color: '#c8d8e8' }}>{inv.name}</span>
            <span style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'rgba(155, 89, 182, 0.2)',
              color: '#9b59b6',
              border: '1px solid rgba(155,89,182,0.3)',
            }}>{inv.type}</span>
          </div>
          <div style={{ fontSize: 11, color: '#999', margin: '4px 0' }}>{inv.description}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#888' }}>
            <span>Known by {inv.knownByVillages.length} village(s)</span>
            <RelevanceBar value={inv.relevance} />
          </div>
        </div>
      ))}
    </div>
  );
}

function InstitutionList({ institutions, villageId, isPlayer }: {
  institutions: Institution[];
  villageId: string | null;
  isPlayer: boolean;
}) {
  if (institutions.length === 0) {
    return <EmptyState text="No institutions founded" />;
  }

  const handleJoin = (institutionId: string) => {
    if (!villageId) return;
    wsClient.sendCommand('player', {
      type: 'join_institution',
      villageId,
      institutionId,
    });
  };

  const handleLeave = (institutionId: string) => {
    if (!villageId) return;
    wsClient.sendCommand('player', {
      type: 'leave_institution',
      villageId,
      institutionId,
    });
  };

  const INST_ICONS: Record<string, string> = {
    guild: '\u{1F6E0}\uFE0F',
    religion: '\u26EA',
    alliance: '\u{1F91D}',
    academy: '\u{1F3EB}',
    custom: '\u2699\uFE0F',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {institutions.map((inst) => {
        const isMember = villageId ? inst.memberVillageIds.includes(villageId) : false;
        return (
          <div key={inst.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', fontSize: 12, color: '#c8d8e8' }}>
                {INST_ICONS[inst.type] ?? ''} {inst.name}
              </span>
              <span style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgba(26,188,156,0.2)',
                color: '#1abc9c',
                border: '1px solid rgba(26,188,156,0.3)',
              }}>{inst.type}</span>
            </div>
            <div style={{ fontSize: 11, color: '#999', margin: '4px 0' }}>{inst.charter}</div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 6,
            }}>
              <div style={{ fontSize: 10, color: '#888', display: 'flex', gap: 12 }}>
                <span>Members: {inst.memberVillageIds.length}</span>
                <RelevanceBar value={inst.relevance} />
              </div>
              {isPlayer && villageId && (
                <div>
                  {isMember ? (
                    <SmallButton onClick={() => handleLeave(inst.id)} color="#d94a4a">Leave</SmallButton>
                  ) : (
                    <SmallButton onClick={() => handleJoin(inst.id)} color="#4ad97a">Join</SmallButton>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RelevanceBar({ value }: { value: number }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    }}>
      <div style={{
        width: 40,
        height: 4,
        background: 'rgba(74, 111, 165, 0.2)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${value * 100}%`,
          background: value > 0.5 ? '#4ad97a' : value > 0.2 ? '#e67e22' : '#d94a4a',
          borderRadius: 2,
        }} />
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      textAlign: 'center',
      color: '#666',
      fontSize: 12,
      padding: 32,
    }}>
      {text}
    </div>
  );
}

function SmallButton({ onClick, color, children }: {
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 8px',
      fontSize: 10,
      background: 'transparent',
      border: `1px solid ${color}`,
      borderRadius: 4,
      color,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }}>
      {children}
    </button>
  );
}

function scopeBadgeStyle(scope: string): React.CSSProperties {
  const colors: Record<string, string> = {
    village: '#4a90d9',
    bilateral: '#e67e22',
    global: '#9b59b6',
  };
  const c = colors[scope] ?? '#888';
  return {
    fontSize: 9,
    padding: '1px 6px',
    borderRadius: 4,
    background: `${c}33`,
    color: c,
    border: `1px solid ${c}44`,
  };
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  fontSize: 18,
  fontFamily: 'inherit',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(74, 111, 165, 0.08)',
  border: '1px solid rgba(74, 111, 165, 0.2)',
  borderRadius: 8,
  padding: '10px 12px',
};
