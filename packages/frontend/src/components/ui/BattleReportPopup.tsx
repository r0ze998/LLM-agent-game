// F16: Battle Report Popup — combat report popup
import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../../store/gameStore.ts';
import { UNIT_DEFS } from '@murasato/shared';

export function BattleReportPopup() {
  const lastBattleResult = useGameStore((s) => s.lastBattleResult);
  const villages = useGameStore((s) => s.villages);
  const [visible, setVisible] = useState(false);
  const [display, setDisplay] = useState(lastBattleResult);

  useEffect(() => {
    if (!lastBattleResult) return;
    setDisplay(lastBattleResult);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(timer);
  }, [lastBattleResult]);

  const close = useCallback(() => setVisible(false), []);

  if (!visible || !display) return null;

  const attackerName = villages.get(display.attackerVillageId)?.name ?? display.attackerVillageId.slice(0, 8);
  const defenderName = villages.get(display.defenderVillageId)?.name ?? display.defenderVillageId.slice(0, 8);

  const totalPower = display.attackPower + display.defensePower;
  const attackPercent = totalPower > 0 ? (display.attackPower / totalPower) * 100 : 50;

  const formatLosses = (losses: typeof display.attackerLosses) =>
    losses.length === 0
      ? 'none'
      : losses.map((u) => {
          const def = UNIT_DEFS[u.defId];
          return `${def?.name ?? u.defId} \u00d7${u.count}`;
        }).join(', ');

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 300,
      background: 'rgba(13, 13, 36, 0.95)',
      border: '1px solid rgba(74, 111, 165, 0.5)',
      borderRadius: 10,
      padding: '16px 24px',
      minWidth: 360,
      maxWidth: 480,
      fontFamily: '"M PLUS 1p", monospace',
      color: '#e8e8e8',
      animation: 'slideUp 0.3s ease',
    }}>
      {/* Close button */}
      <button onClick={close} style={{
        position: 'absolute',
        top: 8,
        right: 12,
        background: 'none',
        border: 'none',
        color: '#666',
        cursor: 'pointer',
        fontSize: 16,
        fontFamily: 'inherit',
      }}>{'\u2715'}</button>

      {/* Header */}
      <div style={{
        textAlign: 'center',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 12,
        color: '#7ab8ff',
      }}>
        {'\u2694\uFE0F'} Battle Report
      </div>

      {/* Attacker vs Defender */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 'bold',
            color: display.attackerWon ? '#4ad97a' : '#d94a4a',
          }}>
            {attackerName}
          </div>
          <div style={{ fontSize: 10, color: '#888' }}>Attacker</div>
        </div>
        <div style={{
          fontSize: 16,
          fontWeight: 'bold',
          color: '#7a9ec7',
          padding: '0 12px',
        }}>VS</div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 'bold',
            color: !display.attackerWon ? '#4ad97a' : '#d94a4a',
          }}>
            {defenderName}
          </div>
          <div style={{ fontSize: 10, color: '#888' }}>Defender</div>
        </div>
      </div>

      {/* Result */}
      <div style={{
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 'bold',
        color: display.attackerWon ? '#4ad97a' : '#d94a4a',
        marginBottom: 10,
      }}>
        {display.attackerWon ? `${attackerName} wins!` : `${defenderName} wins!`}
      </div>

      {/* Power bar */}
      <div style={{
        display: 'flex',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 10,
        border: '1px solid rgba(74,111,165,0.3)',
      }}>
        <div style={{
          width: `${attackPercent}%`,
          background: 'linear-gradient(90deg, #4a90d9, #5ac8fa)',
        }} />
        <div style={{
          width: `${100 - attackPercent}%`,
          background: 'linear-gradient(90deg, #d94a4a, #ff6b6b)',
        }} />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 10,
        color: '#888',
        marginBottom: 10,
      }}>
        <span>ATK: {display.attackPower.toFixed(0)}</span>
        <span>DEF: {display.defensePower.toFixed(0)}</span>
      </div>

      {/* Losses */}
      <div style={{ fontSize: 11, color: '#aaa' }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: '#7a9ec7' }}>Attacker losses: </span>
          {formatLosses(display.attackerLosses)}
        </div>
        <div>
          <span style={{ color: '#7a9ec7' }}>Defender losses: </span>
          {formatLosses(display.defenderLosses)}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
