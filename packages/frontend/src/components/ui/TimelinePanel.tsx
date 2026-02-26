import { useState, useMemo } from 'react';
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';
import type { GameEvent, DialogueLine } from '@murasato/shared';

type FilterCategory = 'all' | 'conversation' | 'incident' | 'construction' | 'social';

const FILTER_TABS: { key: FilterCategory; label: string }[] = [
  { key: 'all', label: '全て' },
  { key: 'conversation', label: '会話' },
  { key: 'incident', label: '事件' },
  { key: 'construction', label: '建設' },
  { key: 'social', label: '社会' },
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
    return recent.filter(e => (CATEGORY_MAP[e.type] ?? 'social') === filter);
  }, [events, filter]);

  if (!show) return null;

  function relativeTime(tick: number): string {
    const diff = currentTick - tick;
    if (diff < 60) return '今';
    if (diff < 1200) return `${Math.floor(diff / 60)}時間前`;
    return `${Math.floor(diff / 1200)}日前`;
  }

  function getAgentName(id: string): string {
    return agents.get(id)?.identity.name ?? id.slice(0, 6);
  }

  return (
    <div style={{
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
      <div style={{ fontWeight: 'bold', color: '#d4d47a', marginBottom: 8 }}>年代記</div>

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

      {filtered.length === 0 && <div style={{ color: '#888' }}>まだ記録がありません</div>}

      <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
        {filtered.slice(-50).reverse().map((event) => {
          const isExpanded = expandedId === event.id;
          const hasDetail = hasExpandableContent(event);

          return (
            <div
              key={event.id}
              onClick={() => hasDetail && setExpandedId(isExpanded ? null : event.id)}
              style={{
                borderBottom: '1px solid #333',
                paddingBottom: 4,
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
          {cause && <div>原因: {cause}</div>}
          {age != null && <div>享年: {age}</div>}
          {role && <div>役割: {role}</div>}
          {village && <div>所属: {village}</div>}
        </div>
      );
    }

    case 'birth': {
      const childId = event.data.childId as string | undefined;
      const generation = event.data.generation as number | undefined;
      return (
        <div style={{ fontSize: 11, color: '#adc' }}>
          {childId && <div>子: {getAgentName(childId)}</div>}
          {event.actorIds.length >= 2 && (
            <div>両親: {getAgentName(event.actorIds[0])} & {getAgentName(event.actorIds[1])}</div>
          )}
          {generation != null && <div>第{generation}世代</div>}
        </div>
      );
    }

    case 'construction': {
      const type = event.data.type as string | undefined;
      const pos = event.data.position as { x: number; y: number } | undefined;
      return (
        <div style={{ fontSize: 11, color: '#dca' }}>
          {type && <div>建造物: {type}</div>}
          {pos && <div>座標: ({pos.x}, {pos.y})</div>}
          {event.actorIds[0] && <div>建設者: {getAgentName(event.actorIds[0])}</div>}
        </div>
      );
    }

    case 'election': {
      const law = event.data.law as string | undefined;
      const passed = event.data.passed as boolean | undefined;
      const covenantName = event.data.covenantName as string | undefined;
      return (
        <div style={{ fontSize: 11, color: '#daf' }}>
          {law && <div>法律: {law}</div>}
          {passed != null && <div>結果: {passed ? '可決' : '否決'}</div>}
          {covenantName && <div>条約: {covenantName}</div>}
        </div>
      );
    }

    case 'war': {
      const combatResult = event.data.combatResult as Record<string, unknown> | undefined;
      return (
        <div style={{ fontSize: 11, color: '#faa' }}>
          {combatResult && (
            <>
              {combatResult.winner && <div>勝者: {String(combatResult.winner)}</div>}
              {combatResult.casualties != null && <div>犠牲者: {String(combatResult.casualties)}</div>}
            </>
          )}
        </div>
      );
    }

    case 'diplomacy': {
      const commandCount = event.data.commandCount as number | undefined;
      return (
        <div style={{ fontSize: 11, color: '#adf' }}>
          {commandCount != null && <div>発行命令数: {commandCount}</div>}
        </div>
      );
    }

    case 'discovery': {
      const dtype = event.data.type as string | undefined;
      const inventionName = event.data.inventionName as string | undefined;
      const institutionName = event.data.institutionName as string | undefined;
      return (
        <div style={{ fontSize: 11, color: '#dda' }}>
          {dtype && <div>種別: {dtype}</div>}
          {inventionName && <div>発明: {inventionName}</div>}
          {institutionName && <div>組織: {institutionName}</div>}
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
    case 'birth': return '誕';
    case 'death': return '没';
    case 'founding': return '建';
    case 'construction': return '造';
    case 'conversation': return '話';
    case 'election': return '選';
    case 'war': return '戦';
    case 'reproduction': return '子';
    case 'diplomacy': return '外';
    case 'discovery': return '発';
    case 'trade': return '商';
    case 'alliance': return '盟';
    default: return '記';
  }
}
