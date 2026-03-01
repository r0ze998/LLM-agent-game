// F18: Victory Announcement — victory declaration overlay
import { useGameStore } from '../../store/gameStore.ts';

export function VictoryAnnouncement() {
  const victoryEvent = useGameStore((s) => s.victoryEvent);
  const villages = useGameStore((s) => s.villages);
  const setVictoryEvent = useGameStore((s) => s.setVictoryEvent);

  if (!victoryEvent) return null;

  const villageName = villages.get(victoryEvent.villageId)?.name ?? victoryEvent.villageId.slice(0, 8);

  const victoryTypeNames: Record<string, string> = {
    domination: 'Domination Victory',
    culture: 'Cultural Victory',
    diplomacy: 'Diplomatic Victory',
    technology: 'Technology Victory',
    score: 'Score Victory',
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 500,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '"M PLUS 1p", monospace',
      animation: 'victoryFadeIn 1s ease',
    }}>
      {/* Trophy */}
      <div style={{
        fontSize: 72,
        marginBottom: 16,
        animation: 'victoryPulse 2s ease-in-out infinite',
      }}>
        {'\u{1F3C6}'}
      </div>

      {/* Title */}
      <h1 style={{
        fontSize: 48,
        color: '#ffd700',
        textShadow: '0 0 30px rgba(255, 215, 0, 0.5), 0 0 60px rgba(255, 215, 0, 0.2)',
        margin: '0 0 12px 0',
        letterSpacing: 8,
      }}>
        {'VICTORY!'}
      </h1>

      {/* Victory type */}
      <div style={{
        fontSize: 20,
        color: '#e8c547',
        marginBottom: 24,
      }}>
        {victoryTypeNames[victoryEvent.victoryType] ?? victoryEvent.victoryType}
      </div>

      {/* Village name */}
      <div style={{
        fontSize: 24,
        color: '#e8e8e8',
        marginBottom: 8,
      }}>
        {villageName}
      </div>

      {/* Score */}
      <div style={{
        fontSize: 16,
        color: '#7a9ec7',
        marginBottom: 48,
      }}>
        Score: {victoryEvent.score.toLocaleString()}
      </div>

      {/* Close button */}
      <button
        onClick={() => setVictoryEvent(null as any)}
        style={{
          background: 'linear-gradient(180deg, #4a6fa5 0%, #2a4a7a 100%)',
          border: '2px solid #5a8fd5',
          borderRadius: 8,
          padding: '12px 48px',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 'bold',
        }}
      >
        {'Close'}
      </button>

      <style>{`
        @keyframes victoryFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes victoryPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
