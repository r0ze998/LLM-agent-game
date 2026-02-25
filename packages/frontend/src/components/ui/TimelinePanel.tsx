import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';

export function TimelinePanel() {
  const show = useUIStore((s) => s.showTimeline);
  const events = useGameStore((s) => s.events);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(500px, 80vw)',
      maxHeight: 400,
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
      {events.length === 0 && <div style={{ color: '#888' }}>まだ記録がありません</div>}
      <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4 }}>
        {events.slice(-50).reverse().map((event) => (
          <div key={event.id} style={{ display: 'flex', gap: 8, borderBottom: '1px solid #333', paddingBottom: 4 }}>
            <span style={{ color: '#888', minWidth: 50, textAlign: 'right' }}>
              t{event.tick}
            </span>
            <span style={{ color: eventColor(event.type) }}>
              {eventIcon(event.type)}
            </span>
            <span>{event.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
    default: return '記';
  }
}
