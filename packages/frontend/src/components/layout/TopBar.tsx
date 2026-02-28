import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';
import { TICKS_PER_DAY, TICKS_PER_YEAR } from '@murasato/shared';
import { WalletConnect } from '../ui/WalletConnect.tsx';
import { EvmWalletConnect } from '../ui/EvmWalletConnect.tsx';

export function TopBar() {
  const tick = useGameStore((s) => s.game?.tick ?? 0);
  const agents = useGameStore((s) => s.agents);
  const gameMode = useUIStore((s) => s.gameMode);
  const toggleIntention = useUIStore((s) => s.toggleIntentionPanel);
  const toggleTimeline = useUIStore((s) => s.toggleTimeline);
  const toggleDashboard = useUIStore((s) => s.toggleDashboard);
  const toggleDeployer = useUIStore((s) => s.toggleAgentDeployer);
  const toggleStrategy = useUIStore((s) => s.toggleStrategy);
  const toggleTechTree = useUIStore((s) => s.toggleTechTree);
  const toggleDiplomacy = useUIStore((s) => s.toggleDiplomacy);
  const toggleSocialGraph = useUIStore((s) => s.toggleSocialGraph);
  const toggleVictory = useUIStore((s) => s.toggleVictory);
  const toggleAutonomousWorld = useUIStore((s) => s.toggleAutonomousWorld);
  const togglePaymentDashboard = useUIStore((s) => s.togglePaymentDashboard);

  const day = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_DAY) + 1;
  const year = Math.floor(tick / TICKS_PER_YEAR) + 1;
  const livingCount = [...agents.values()].filter(a => a.identity.status !== 'dead').length;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 48,
      background: 'linear-gradient(180deg, rgba(13,13,36,0.95) 0%, rgba(13,13,36,0.7) 100%)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(74,111,165,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      fontFamily: '"M PLUS 1p", monospace',
      fontSize: 13,
      color: '#ccc',
      zIndex: 100,
    }}>
      <div style={{ display: 'flex', gap: 16 }}>
        <span style={{ color: '#7ab8ff', fontWeight: 'bold', textShadow: '0 0 12px rgba(122,184,255,0.4)' }}>村里</span>
        <span>年{year} / {day}日目</span>
        <span>人口: {livingCount}</span>
        <span style={{ color: '#666', animation: 'pulse 2s infinite' }}>tick: {tick}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <HeaderDropdown label="4X" items={[
          { label: '戦略', onClick: toggleStrategy },
          { label: '技術', onClick: toggleTechTree },
          { label: '外交', onClick: toggleDiplomacy },
          { label: '勝利', onClick: toggleVictory },
          { label: '自治', onClick: toggleAutonomousWorld },
        ]} />
        <HeaderDropdown label="情報" items={[
          { label: '年代記', onClick: toggleTimeline },
          { label: '統計', onClick: toggleDashboard },
          { label: '社会', onClick: toggleSocialGraph },
          { label: '決済', onClick: togglePaymentDashboard },
        ]} />
        {gameMode === 'player' && (
          <>
            <HeaderButton onClick={toggleDeployer}>召喚</HeaderButton>
            <HeaderButton onClick={toggleIntention}>天の声</HeaderButton>
          </>
        )}
        <EvmWalletConnect />
        <WalletConnect />
      </div>
    </div>
  );
}

function HeaderButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(74,111,165,0.25)' : 'transparent',
        border: '1px solid #4a6fa5',
        borderRadius: 6,
        padding: '5px 14px',
        color: hovered ? '#fff' : '#7a9ec7',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

function HeaderDropdown({ label, items }: { label: string; items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: (hovered || open) ? 'rgba(74,111,165,0.25)' : 'transparent',
          border: '1px solid #4a6fa5',
          borderRadius: 6,
          padding: '5px 14px',
          color: (hovered || open) ? '#fff' : '#7a9ec7',
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'inherit',
        }}
      >
        {label}▼
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 4,
          background: 'rgba(13,13,36,0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(74,111,165,0.4)',
          borderRadius: 6,
          zIndex: 150,
          minWidth: 100,
          overflow: 'hidden',
        }}>
          {items.map((item, i) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false); }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(-1)}
              style={{
                display: 'block',
                width: '100%',
                background: hoveredIdx === i ? 'rgba(74,111,165,0.3)' : 'transparent',
                border: 'none',
                padding: '6px 16px',
                color: hoveredIdx === i ? '#fff' : '#7a9ec7',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
                textAlign: 'left',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
