import { useState, useMemo } from 'react';
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';
import type { GameEvent, DialogueLine } from '@murasato/shared';

type FilterCategory = 'all' | 'conversation' | 'incident' | 'construction' | 'social' | 'onchain';

const FILTER_TABS: { key: FilterCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'conversation', label: 'Conversations' },
  { key: 'incident', label: 'Incidents' },
  { key: 'construction', label: 'Construction' },
  { key: 'social', label: 'Social' },
  { key: 'onchain', label: 'On-chain' },
];

const CATEGORY_MAP: Record<string, FilterCategory> = {
  conversation: 'conversation',
  birth: 'incident',
  death: 'incident',
  war: 'incident',
  peace: 'incident',
  construction: 'construction',
  founding: 'social',
  election: 'social',
  diplomacy: 'social',
  alliance: 'social',
  trade: 'social',
  discovery: 'social',
  reproduction: 'incident',
  migration: 'social',
};

export function TimelinePanel() {
  const show = useUIStore((s) => s.showTimeline);
  const events = useGameStore((s) => s.events);
  const currentTick = useGameStore((s) => s.game?.tick ?? 0);
  const agents = useGameStore((s) => s.agents);
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const recent = events.slice(-80);
    if (filter === 'all') return recent;
    if (filter === 'onchain') return recent.filter(e => e.data?._origin === 'onchain');
    return recent.filter(e => (CATEGORY_MAP[e.type] ?? 'social') === filter);
  }, [events, filter]);

  if (!show) return null;

  function relativeTime(tick: number): string {
    const diff = currentTick - tick;
    if (diff < 60) return 'now';
    if (diff < 1200) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1200)}d ago`;
  }

  function getAgentName(id: string): string {
    return agents.get(id)?.identity.name ?? id.slice(0, 6);
  }

  return (
    <div style={{
      animation: 'slideDown 0.2s ease',
      position: 'fixed',
      top: 60,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(600px, 90vw)',
      maxHeight: 500,
      overflowY: 'auto',
      background: 'linear-gradient(180deg, #2a2a1a 0%, #1a1a0d 100%)',
      border: '2px solid #a5a54a',
      borderRadius: 8,
      padding: 12,
      color: '#e8e8e8',
      fontFamily: '"M PLUS 1p", monospace',
      fontSize: 12,
      zIndex: 85,
    }}>
      <div style={{ fontWeight: 'bold', color: '#d4d47a', marginBottom: 8 }}>Timeline</div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              background: filter === tab.key ? '#5a5a2a' : 'transparent',
              border: `1px solid ${filter === tab.key ? '#a5a54a' : '#555'}`,
              borderRadius: 4,
              padding: '2px 8px',
              color: filter === tab.key ? '#d4d47a' : '#888',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && <div style={{ color: '#888' }}>No records yet</div>}

      <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
        {filtered.slice(-50).reverse().map((event) => {
          const isExpanded = expandedId === event.id;
          const hasDetail = hasExpandableContent(event);

          const isOnchain = event.data?._origin === 'onchain';

          return (
            <div
              key={event.id}
              onClick={() => hasDetail && setExpandedId(isExpanded ? null : event.id)}
              style={{
                borderBottom: '1px solid #333',
                borderLeft: isOnchain ? '3px solid #8b8bff' : 'none',
                paddingBottom: 4,
                paddingLeft: isOnchain ? 6 : 0,
                cursor: hasDetail ? 'pointer' : 'default',
              }}
            >
              {/* Summary row */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#777', minWidth: 48, textAlign: 'right', fontSize: 10 }}>
                  {relativeTime(event.tick)}
                </span>
                <span style={{
                  color: eventColor(event.type),
                  fontWeight: 'bold',
                  minWidth: 16,
                  textAlign: 'center',
                }}>
                  {eventIcon(event.type)}
                </span>
                {isOnchain && (
                  <span style={{
                    color: '#8b8bff',
                    fontSize: 9,
                    fontWeight: 'bold',
                    background: 'rgba(139,139,255,0.15)',
                    borderRadius: 3,
                    padding: '1px 4px',
                  }}>chain</span>
                )}
                <span style={{ flex: 1 }}>{event.description}</span>
                {hasDetail && (
                  <span style={{ color: '#666', fontSize: 10 }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ marginTop: 6, marginLeft: 72, paddingLeft: 8, borderLeft: `2px solid ${eventColor(event.type)}33` }}>
                  <EventDetail event={event} getAgentName={getAgentName} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function hasExpandableContent(event: GameEvent): boolean {
  switch (event.type) {
    case 'conversation': return Array.isArray(event.data.dialogue) && (event.data.dialogue as DialogueLine[]).length > 0;
    case 'death': return true;
    case 'birth': return true;
    case 'construction': return true;
    case 'election': return true;
    case 'war': return true;
    case 'diplomacy': return true;
    case 'discovery': return true;
    default: return false;
  }
}

function EventDetail({ event, getAgentName }: { event: GameEvent; getAgentName: (id: string) => string }) {
  switch (event.type) {
    case 'conversation': {
      const dialogue = event.data.dialogue as DialogueLine[] | undefined;
      const sentimentChange = event.data.sentimentChange as Record<string, number> | undefined;
      if (!dialogue?.length) return null;

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {dialogue.map((line, i) => {
            const name = getAgentName(line.speakerId);
            const isFirst = event.actorIds[0] === line.speakerId;
            return (
              <div key={i} style={{
                display: 'flex',
                flexDirection: isFirst ? 'row' : 'row-reverse',
                gap: 6,
                alignItems: 'flex-start',
              }}>
                <span style={{
                  color: isFirst ? '#7ab8ff' : '#ff9b7a',
                  fontSize: 10,
                  fontWeight: 'bold',
                  minWidth: 40,
                  textAlign: isFirst ? 'right' : 'left',
                  flexShrink: 0,
                }}>
                  {name}
                </span>
                <div style={{
                  background: isFirst ? 'rgba(122,184,255,0.1)' : 'rgba(255,155,122,0.1)',
                  border: `1px solid ${isFirst ? '#7ab8ff33' : '#ff9b7a33'}`,
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 11,
                  maxWidth: '80%',
                  lineHeight: 1.4,
                }}>
                  {line.text}
                </div>
              </div>
            );
          })}
          {sentimentChange && Object.keys(sentimentChange).length > 0 && (
            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
              {Object.entries(sentimentChange).map(([id, delta]) => {
                const sign = (delta as number) > 0 ? '+' : '';
                return <span key={id} style={{ marginRight: 8 }}>{getAgentName(id)} {sign}{delta as number}</span>;
              })}
            </div>
          )}
        </div>
      );
    }

    case 'death': {
      const cause = event.data.cause as string | undefined;
      const age = event.data.age as number | undefined;
      const role = event.data.role as string | undefined;
      const village = event.data.villageName as string | undefined;
      return (
        <div style={{ fontSize: 11, color: '#caa' }}>
          {cause && <div>Cause: {cause}</div>}
          {age != null && <div>Age: {age}</div>}
          {role && <div>Role: {role}</div>}
          {village && <div>Village: {village}</div>}
        </div>
      );
    }

    case 'birth': {
      const childId = event.data.childId as string | undefined;
      const generation = event.data.generation as number | undefined;
      return (
        <div style={{ fontSize: 11, color: '#adc' }}>
          {childId && <div>Child: {getAgentName(childId)}</div>}
          {event.actorIds.length >= 2 && (
            <div>Parents: {getAgentName(event.actorIds[0])} & {getAgentName(event.actorIds[1])}</div>
          )}
          {generation != null && <div>Gen {generation}</div>}
        </div>
      );
    }

    case 'construction': {
      const type = event.data.type as string | undefined;
      const pos = event.data.position as { x: number; y: number } | undefined;
      return (
        <div style={{ fontSize: 11, color: '#dca' }}>
          {type && <div>Structure: {type}</div>}
          {pos && <div>Position: ({pos.x}, {pos.y})</div>}
          {event.actorIds[0] && <div>Builder: {getAgentName(event.actorIds[0])}</div>}
        </div>
      );
    }

    case 'election': {
      const law = event.data.law as string | undefined;
      const passed = event.data.passed as boolean | undefined;
      const covenantName = event.data.covenantName as string | undefined;
      return (
        <div style={{ fontSize: 11, color: '#daf' }}>
          {law && <div>Law: {law}</div>}
          {passed != null && <div>Result: {passed ? 'Passed' : 'Rejected'}</div>}
          {covenantName && <div>Covenant: {covenantName}</div>}
        </div>
      );
    }

    case 'war': {
      const combatResult = event.data.combatResult as Record<string, unknown> | undefined;
      return (
        <div style={{ fontSize: 11, color: '#faa' }}>
          {combatResult && (
            <>
              {combatResult.winner && <div>Winner: {String(combatResult.winner)}</div>}
              {combatResult.casualties != null && <div>Casualties: {String(combatResult.casualties)}</div>}
            </>
          )}
        </div>
      );
    }

    case 'diplomacy': {
      const commandCount = event.data.commandCount as number | undefined;
      return (
        <div style={{ fontSize: 11, color: '#adf' }}>
          {commandCount != null && <div>Commands issued: {commandCount}</div>}
        </div>
      );
    }

    case 'discovery': {
      const dtype = event.data.type as string | undefined;
      const inventionName = event.data.inventionName as string | undefined;
      const institutionName = event.data.institutionName as string | undefined;
      return (
        <div style={{ fontSize: 11, color: '#dda' }}>
          {dtype && <div>Type: {dtype}</div>}
          {inventionName && <div>Invention: {inventionName}</div>}
          {institutionName && <div>Institution: {institutionName}</div>}
        </div>
      );
    }

    default:
      return null;
  }
}

function eventColor(type: string): string {
  switch (type) {
    case 'birth': return '#7aff7a';
    case 'death': return '#ff7a7a';
    case 'founding': return '#ffd700';
    case 'construction': return '#c4956a';
    case 'conversation': return '#7ab8ff';
    case 'election': return '#d4a0ff';
    case 'war': return '#ff4040';
    case 'reproduction': return '#ff80c0';
    case 'diplomacy': return '#70d0ff';
    case 'discovery': return '#ffe070';
    case 'trade': return '#80e080';
    case 'alliance': return '#80c0ff';
    default: return '#ccc';
  }
}

function eventIcon(type: string): string {
  switch (type) {
    case 'birth': return '\u2727';
    case 'death': return '\u2620';
    case 'founding': return '\u2302';
    case 'construction': return '\u2692';
    case 'conversation': return '\u2661';
    case 'election': return '\u2696';
    case 'war': return '\u2694';
    case 'reproduction': return '\u2640';
    case 'diplomacy': return '\u2691';
    case 'discovery': return '\u2605';
    case 'trade': return '\u2619';
    case 'alliance': return '\u2614';
    default: return '\u2022';
  }
}
