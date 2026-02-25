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
      background: '#1a1a2e',
      border: '2px solid #4a6fa5',
      borderRadius: 6,
      padding: 4,
      zIndex: 80,
    }}>
      {SPEED_OPTIONS.map((s) => (
        <button
          key={s}
          onClick={() => handleSpeed(s)}
          style={{
            background: speed === s ? '#4a6fa5' : 'transparent',
            border: 'none',
            borderRadius: 4,
            padding: '4px 8px',
            color: speed === s ? '#fff' : '#7a9ec7',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: speed === s ? 'bold' : 'normal',
            minWidth: 32,
          }}
        >
          {s === 0 ? '⏸' : `${s}x`}
        </button>
      ))}
    </div>
  );
}
