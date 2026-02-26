import { useState, useCallback, useEffect, useRef } from 'react';
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
import { AgentDeployer } from './components/ui/AgentDeployer.tsx';
import { DemoOverlay } from './components/ui/DemoOverlay.tsx';
import { TICKS_PER_DAY, TICKS_PER_YEAR } from '@murasato/shared';

type TitlePhase = 'title' | 'create-agent';

export default function App() {
  const [phase, setPhase] = useState<TitlePhase>('title');
  const [loading, setLoading] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [soul, setSoul] = useState('');
  const [agentName, setAgentName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const autoJoinAttempted = useRef(false);

  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const agents = useGameStore((s) => s.agents);
  const gameMode = useUIStore((s) => s.gameMode);
  const setGameMode = useUIStore((s) => s.setGameMode);
  const selectAgent = useUIStore((s) => s.selectAgent);
  const followAgent = useUIStore((s) => s.followAgent);
  const toggleIntention = useUIStore((s) => s.toggleIntentionPanel);
  const toggleTimeline = useUIStore((s) => s.toggleTimeline);
  const toggleDashboard = useUIStore((s) => s.toggleDashboard);
  const toggleDeployer = useUIStore((s) => s.toggleAgentDeployer);

  useWorldState(game?.id ?? null);

  // Auto-join a running headless game if one exists
  useEffect(() => {
    if (game || autoJoinAttempted.current) return;
    autoJoinAttempted.current = true;

    (async () => {
      try {
        const games = await api.listActiveGames();
        const running = games.find(g => g.running);
        if (running) {
          setAutoJoining(true);
          const gameState = await api.getGame(running.gameId);
          setGame(gameState);
          setGameMode('observer');
          setAutoJoining(false);
        }
      } catch {
        // Server not ready or no games — fall through to title screen
        setAutoJoining(false);
      }
    })();
  }, [game, setGame, setGameMode]);

  const handleStartPlayer = useCallback(async () => {
    if (soul.trim().length < 10) {
      setError('魂の描写は10文字以上必要です');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const gameState = await api.createGame();
      setGame(gameState);
      const { agent } = await api.deployBlueprint(gameState.id, {
        soul: soul.trim(),
        ...(agentName.trim() ? { name: agentName.trim() } : {}),
      });
      await api.startGame(gameState.id);
      setGameMode('player');
      selectAgent(agent.identity.id);
      followAgent(agent.identity.id);
    } catch (err) {
      console.error('Failed to start game:', err);
      setError(err instanceof Error ? err.message : 'ゲーム作成に失敗しました');
    }
    setLoading(false);
  }, [soul, agentName, setGame, setGameMode, selectAgent, followAgent]);

  const handleStartObserver = useCallback(async () => {
    setLoading(true);
    try {
      const gameState = await api.createGame();
      setGame(gameState);
      await api.startGame(gameState.id);
      setGameMode('observer');
    } catch (err) {
      console.error('Failed to create game:', err);
    }
    setLoading(false);
  }, [setGame, setGameMode]);

  // Auto-join connecting indicator
  if (autoJoining) {
    return (
      <div style={titleContainerStyle}>
        <h1 style={titleStyle}>村里</h1>
        <p style={{ color: '#7a9ec7', fontSize: 14 }}>接続中...</p>
      </div>
    );
  }

  // Title screen
  if (!game) {
    if (phase === 'create-agent') {
      return (
        <div style={titleContainerStyle}>
          <h1 style={titleStyle}>村里</h1>
          <p style={subtitleStyle}>AI自己繁殖JRPGビレッジビルダー</p>

          <div style={{
            width: 'min(400px, 85vw)',
            background: 'rgba(30, 20, 50, 0.6)',
            border: '1px solid #5a3d7a',
            borderRadius: 8,
            padding: 24,
          }}>
            <label style={labelStyle}>名前 (省略時はAIが生成)</label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="例: タロウ"
              style={inputStyle}
            />

            <label style={labelStyle}>魂の描写 (10文字以上)</label>
            <textarea
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              placeholder="穏やかな農夫で、土地と季節のリズムを深く敬う。争いを嫌い、常に対話で解決しようとする。"
              rows={5}
              style={textareaStyle}
            />

            {error && (
              <div style={{ color: '#f66', fontSize: 12, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleStartPlayer}
              disabled={loading}
              style={{
                ...primaryButtonStyle,
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
                width: '100%',
                marginBottom: 12,
              }}
            >
              {loading ? '世界を創造中...' : '世界に降り立つ'}
            </button>

            <button
              onClick={() => { setPhase('title'); setError(null); }}
              style={backLinkStyle}
            >
              ← 戻る
            </button>
          </div>
        </div>
      );
    }

    // phase === 'title'
    return (
      <div style={titleContainerStyle}>
        <h1 style={titleStyle}>村里</h1>
        <p style={subtitleStyle}>AI自己繁殖JRPGビレッジビルダー</p>
        <div style={{ display: 'flex', gap: 16 }}>
          <button
            onClick={() => setPhase('create-agent')}
            disabled={loading}
            style={primaryButtonStyle}
          >
            始める
          </button>
          <button
            onClick={handleStartObserver}
            disabled={loading}
            style={secondaryButtonStyle}
          >
            {loading ? '世界を創造中...' : '観察する'}
          </button>
        </div>
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
          {gameMode === 'player' && (
            <>
              <HeaderButton onClick={toggleDeployer}>召喚</HeaderButton>
              <HeaderButton onClick={toggleIntention}>天の声</HeaderButton>
            </>
          )}
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
      <AgentDeployer />
      <SpeedControl />
      <DemoOverlay />
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

/* ── Styles ── */

const titleContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  background: '#0d0d24',
  color: '#e8e8e8',
  fontFamily: '"M PLUS 1p", "Hiragino Kaku Gothic ProN", monospace',
};

const titleStyle: React.CSSProperties = {
  fontSize: 48,
  marginBottom: 8,
  color: '#7ab8ff',
  textShadow: '0 0 20px rgba(122,184,255,0.3)',
};

const subtitleStyle: React.CSSProperties = {
  color: '#7a9ec7',
  marginBottom: 32,
  fontSize: 14,
};

const primaryButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #4a6fa5 0%, #2a4a7a 100%)',
  border: '2px solid #5a8fd5',
  borderRadius: 8,
  padding: '12px 48px',
  color: '#fff',
  fontSize: 18,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 'bold',
  transition: 'all 0.2s',
};

const secondaryButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '2px solid #4a6fa5',
  borderRadius: 8,
  padding: '12px 48px',
  color: '#7a9ec7',
  fontSize: 18,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 'bold',
  transition: 'all 0.2s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#a88fc4',
  fontSize: 12,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#111',
  border: '1px solid #555',
  borderRadius: 4,
  color: '#eee',
  padding: '8px 10px',
  fontSize: 14,
  fontFamily: 'inherit',
  marginBottom: 12,
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#111',
  border: '1px solid #555',
  borderRadius: 4,
  color: '#eee',
  padding: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'vertical',
  marginBottom: 12,
  boxSizing: 'border-box',
};

const backLinkStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7a9ec7',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'inherit',
  padding: 0,
};
