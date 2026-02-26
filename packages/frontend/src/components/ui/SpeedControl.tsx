import { SPEED_OPTIONS } from '@murasato/shared';
import { useUIStore } from '../../store/uiStore.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { api } from '../../services/api.ts';

export function SpeedControl() {
  const speed = useUIStore((s) => s.speed);
  const setSpeed = useUIStore((s) => s.setSpeed);
  const game = useGameStore((s) => s.game);

  const handleSpeed = async (newSpeed: number) => {
    setSpeed(newSpeed);
    if (!game) return;

    if (newSpeed === 0) {
      await api.pauseGame(game.id);
    } else {
      await api.setSpeed(game.id, newSpeed);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      display: 'flex',
      gap: 2,
      background: 'rgba(26,26,46,0.85)',
      backdropFilter: 'blur(8px)',
      border: '2px solid rgba(74,111,165,0.5)',
      borderRadius: 8,
      padding: 6,
      zIndex: 80,
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    }}>
      {SPEED_OPTIONS.map((s) => (
        <button
          key={s}
          onClick={() => handleSpeed(s)}
          style={{
            background: speed === s ? '#4a6fa5' : 'transparent',
            border: 'none',
            borderRadius: 6,
            padding: '5px 10px',
            color: speed === s ? '#fff' : '#7a9ec7',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: speed === s ? 'bold' : 'normal',
            minWidth: 32,
            ...(speed === s && s !== 0 ? { boxShadow: '0 0 8px rgba(122,184,255,0.4)' } : {}),
            ...(speed === s && s === 0 ? { animation: 'pulse 1.5s infinite' } : {}),
          }}
        >
          {s === 0 ? '⏸' : `${s}x`}
        </button>
      ))}
    </div>
  );
}
