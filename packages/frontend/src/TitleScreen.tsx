import { useState, useCallback, useEffect, useRef } from 'react';
import { useGameStore } from './store/gameStore.ts';
import { useUIStore } from './store/uiStore.ts';
import { api } from './services/api.ts';
import {
  titleContainerStyle,
  titleStyle,
  subtitleStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  labelStyle,
  inputStyle,
  textareaStyle,
  backLinkStyle,
} from './styles/appStyles.ts';

type TitlePhase = 'title' | 'create-agent';

export function TitleScreen() {
  const [phase, setPhase] = useState<TitlePhase>('title');
  const [loading, setLoading] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [soul, setSoul] = useState('');
  const [agentName, setAgentName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const autoJoinAttempted = useRef(false);

  const setGame = useGameStore((s) => s.setGame);
  const setGameMode = useUIStore((s) => s.setGameMode);
  const selectAgent = useUIStore((s) => s.selectAgent);
  const followAgent = useUIStore((s) => s.followAgent);

  // Auto-join a running headless game if one exists
  useEffect(() => {
    if (autoJoinAttempted.current) return;
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
        setAutoJoining(false);
      }
    })();
  }, [setGame, setGameMode]);

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
