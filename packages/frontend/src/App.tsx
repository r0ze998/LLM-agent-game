import { useState, useCallback } from 'react';
import { useWorldState } from './hooks/useWorldState.ts';
import { useGameStore } from './store/gameStore.ts';
import { useUIStore } from './store/uiStore.ts';
import { api } from './services/api.ts';
import { WorldCanvas } from './components/world/WorldCanvas.tsx';
import { DialogueBox } from './components/ui/DialogueBox.tsx';
import { IntentionPanel } from './components/ui/IntentionPanel.tsx';
import { AgentInspector } from './components/ui/AgentInspector.tsx';
import { SpeedControl } from './components/ui/SpeedControl.tsx';
import { VillagePanel } from './components/ui/VillagePanel.tsx';
import { TimelinePanel } from './components/ui/TimelinePanel.tsx';
import { Minimap } from './components/ui/Minimap.tsx';
import { DashboardPanel } from './components/ui/DashboardPanel.tsx';
import { TICKS_PER_DAY, TICKS_PER_YEAR } from '@murasato/shared';

export default function App() {
  const [loading, setLoading] = useState(false);
  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const agents = useGameStore((s) => s.agents);
  const toggleIntention = useUIStore((s) => s.toggleIntentionPanel);
  const toggleTimeline = useUIStore((s) => s.toggleTimeline);
  const toggleDashboard = useUIStore((s) => s.toggleDashboard);

  useWorldState(game?.id ?? null);

  const handleNewGame = useCallback(async () => {
    setLoading(true);
    try {
      const gameState = await api.createGame();
      setGame(gameState);
      await api.startGame(gameState.id);
    } catch (err) {
      console.error('Failed to create game:', err);
    }
    setLoading(false);
  }, [setGame]);

  // Title screen
  if (!game) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0d0d24',
        color: '#e8e8e8',
        fontFamily: '"M PLUS 1p", "Hiragino Kaku Gothic ProN", monospace',
      }}>
        <h1 style={{ fontSize: 48, marginBottom: 8, color: '#7ab8ff', textShadow: '0 0 20px rgba(122,184,255,0.3)' }}>
          村里
        </h1>
        <p style={{ color: '#7a9ec7', marginBottom: 32, fontSize: 14 }}>
          AI自己繁殖JRPGビレッジビルダー
        </p>
        <button
          onClick={handleNewGame}
          disabled={loading}
          style={{
            background: 'linear-gradient(180deg, #4a6fa5 0%, #2a4a7a 100%)',
            border: '2px solid #5a8fd5',
            borderRadius: 8,
            padding: '12px 48px',
            color: '#fff',
            fontSize: 18,
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            fontWeight: 'bold',
            transition: 'all 0.2s',
          }}
        >
          {loading ? '世界を創造中...' : 'はじめる'}
        </button>
      </div>
    );
  }

  // Game view
  const tick = game.tick;
  const day = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_DAY) + 1;
  const year = Math.floor(tick / TICKS_PER_YEAR) + 1;
  const livingCount = [...agents.values()].filter(a => a.identity.status !== 'dead').length;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* World */}
      <WorldCanvas />

      {/* Top bar */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 44,
        background: 'linear-gradient(180deg, rgba(13,13,36,0.95) 0%, rgba(13,13,36,0.7) 100%)',
        borderBottom: '1px solid #333',
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
          <span style={{ color: '#7ab8ff', fontWeight: 'bold' }}>村里</span>
          <span>年{year} / {day}日目</span>
          <span>人口: {livingCount}</span>
          <span style={{ color: '#666' }}>tick: {tick}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <HeaderButton onClick={toggleIntention}>天の声</HeaderButton>
          <HeaderButton onClick={toggleTimeline}>年代記</HeaderButton>
          <HeaderButton onClick={toggleDashboard}>統計</HeaderButton>
        </div>
      </div>

      {/* UI Panels */}
      <Minimap />
      <AgentInspector />
      <VillagePanel />
      <TimelinePanel />
      <IntentionPanel />
      <DialogueBox />
      <DashboardPanel />
      <SpeedControl />
    </div>
  );
}

function HeaderButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1px solid #4a6fa5',
        borderRadius: 4,
        padding: '2px 10px',
        color: '#7a9ec7',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
