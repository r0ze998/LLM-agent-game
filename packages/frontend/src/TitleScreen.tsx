import { useState, useCallback, useEffect, useRef } from 'react';
import { useGameStore } from './store/gameStore.ts';
import { useUIStore } from './store/uiStore.ts';
import { useWalletStore } from './store/walletStore.ts';
import { api } from './services/api.ts';
import { initializeOnChain } from './services/dojoGameInit.ts';
import { initTxService } from './services/starknetTx.ts';
import { VillageIdMapper } from './services/dojoSync.ts';
import { DojoTxService } from './services/dojoTxService.ts';
import { DojoStateReader } from './services/dojoStateReader.ts';
import { DojoStateSync } from './services/dojoStateSync.ts';
import { DojoTickAdvancer } from './services/dojoTickAdvancer.ts';
import { WORLD_ADDRESS } from './services/dojoConfig.ts';
import {
  createTitleScene,
  updateTitleScene,
  renderTitleScene,
  skipToEnd,
} from './components/world/TitleBackground.ts';
import type { TitleScene } from './components/world/TitleBackground.ts';
import {
  titleScreenContainerStyle,
  backgroundCanvasStyle,
  contentOverlayStyle,
  glassCardStyle,
  glassInputStyle,
  glassTextareaStyle,
  primaryButtonGlassStyle,
  secondaryButtonGlassStyle,
  stepHeadingStyle,
  stepDescStyle,
  buttonRowStyle,
  wizardBackButtonStyle,
  nextButtonStyle,
  confirmButtonStyle,
  previewFieldStyle,
  previewLabelStyle,
  previewValueStyle,
  previewSoulStyle,
  errorStyle,
  phaseTextStyle,
  skipHintStyle,
} from './styles/appStyles.ts';

type WizardStep = 0 | 1 | 2 | 3;

// ---- Sub-components ----

function TitleHeader({ shrink }: { shrink: boolean }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: shrink ? 20 : 32, transition: 'margin 0.3s' }}>
      <h1
        style={{
          fontSize: shrink ? 28 : 56,
          color: '#7ab8ff',
          animation: 'titleGlow 4s ease-in-out infinite',
          transition: 'font-size 0.3s',
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        村里
      </h1>
      <p
        style={{
          color: '#7a9ec7',
          fontSize: shrink ? 11 : 14,
          marginTop: shrink ? 4 : 8,
          transition: 'all 0.3s',
          opacity: shrink ? 0.7 : 1,
        }}
      >
        AI自己繁殖JRPGビレッジビルダー
      </p>
    </div>
  );
}

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
      {([1, 2, 3] as const).map((s) => (
        <div
          key={s}
          style={{
            width: s === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: s === current ? '#7ab8ff' : s < current ? '#4a6fa5' : 'rgba(122,184,255,0.15)',
            transition: 'all 0.3s',
          }}
        />
      ))}
    </div>
  );
}

function MainMenu({
  onStart,
  onObserve,
  loading,
}: {
  onStart: () => void;
  onObserve: () => void;
  loading: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      <button onClick={onStart} disabled={loading} style={primaryButtonGlassStyle}>
        始める
      </button>
      <button onClick={onObserve} disabled={loading} style={secondaryButtonGlassStyle}>
        {loading ? '世界を創造中...' : '観察する'}
      </button>
    </div>
  );
}

function NameStep({
  agentName,
  setAgentName,
  onNext,
  onBack,
}: {
  agentName: string;
  setAgentName: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 style={stepHeadingStyle}>名前を決める</h2>
      <p style={stepDescStyle}>
        あなたの分身となるエージェントの名前を入力してください。
        <br />
        空欄にするとAIが自動で名付けます。
      </p>
      <input
        value={agentName}
        onChange={(e) => setAgentName(e.target.value)}
        placeholder="例: タロウ"
        style={glassInputStyle}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') onNext(); }}
      />
      <div style={buttonRowStyle}>
        <button onClick={onBack} style={wizardBackButtonStyle}>← 戻る</button>
        <button onClick={onNext} style={nextButtonStyle}>次へ</button>
      </div>
    </div>
  );
}

function SoulStep({
  soul,
  setSoul,
  onNext,
  onBack,
}: {
  soul: string;
  setSoul: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const canProceed = soul.trim().length >= 10;
  return (
    <div>
      <h2 style={stepHeadingStyle}>魂を描く</h2>
      <p style={stepDescStyle}>
        エージェントの性格や価値観を自由に描写してください。
        <br />
        この文章がAIの行動指針となります。
      </p>
      <textarea
        value={soul}
        onChange={(e) => setSoul(e.target.value)}
        placeholder="穏やかな農夫で、土地と季節のリズムを深く敬う。争いを嫌い、常に対話で解決しようとする。"
        rows={5}
        style={glassTextareaStyle}
        autoFocus
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: canProceed ? '#5a8a5a' : '#7a5a5a' }}>
          {soul.trim().length}/10
        </span>
        {!canProceed && soul.trim().length > 0 && (
          <span style={{ fontSize: 11, color: '#a07070' }}>10文字以上必要です</span>
        )}
      </div>
      <div style={buttonRowStyle}>
        <button onClick={onBack} style={wizardBackButtonStyle}>← 戻る</button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          style={{
            ...nextButtonStyle,
            opacity: canProceed ? 1 : 0.4,
            cursor: canProceed ? 'pointer' : 'not-allowed',
          }}
        >
          次へ
        </button>
      </div>
    </div>
  );
}

function PreviewStep({
  agentName,
  soul,
  loading,
  error,
  onConfirm,
  onBack,
}: {
  agentName: string;
  soul: string;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 style={stepHeadingStyle}>確認</h2>
      <p style={stepDescStyle}>以下の内容で世界に降り立ちます。</p>

      <div style={previewFieldStyle}>
        <div style={previewLabelStyle}>名前</div>
        <div style={previewValueStyle}>{agentName.trim() || '（AIが命名）'}</div>
      </div>

      <div style={previewFieldStyle}>
        <div style={previewLabelStyle}>魂の描写</div>
        <div style={previewSoulStyle}>{soul.trim()}</div>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <button
        onClick={onConfirm}
        disabled={loading}
        style={{
          ...confirmButtonStyle,
          opacity: loading ? 0.7 : 1,
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? <LoadingIndicator text="世界を創造中" /> : '世界に降り立つ'}
      </button>

      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <button onClick={onBack} disabled={loading} style={wizardBackButtonStyle}>← 戻る</button>
      </div>
    </div>
  );
}

function LoadingIndicator({ text }: { text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {text}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: '#fff',
            animation: `dotBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

function AutoJoinIndicator() {
  return (
    <div style={contentOverlayStyle}>
      <h1
        style={{
          fontSize: 56,
          color: '#7ab8ff',
          animation: 'titleGlow 4s ease-in-out infinite',
          margin: 0,
        }}
      >
        村里
      </h1>
      <p style={{ color: '#7a9ec7', fontSize: 14, marginTop: 16 }}>
        <LoadingIndicator text="接続中" />
      </p>
    </div>
  );
}

// ---- Phase text overlay ----

const PHASE_TEXTS = ['...', '大地を形成する', '文明の種を蒔く', '意識を吹き込む', ''];

function PhaseTextOverlay({ phase }: { phase: number }) {
  const [displayPhase, setDisplayPhase] = useState(0);
  const [animState, setAnimState] = useState<'in' | 'out'>('in');

  useEffect(() => {
    if (phase !== displayPhase) {
      // Fade out current text, then switch
      setAnimState('out');
      const timer = setTimeout(() => {
        setDisplayPhase(phase);
        setAnimState('in');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [phase, displayPhase]);

  const text = PHASE_TEXTS[displayPhase];
  if (!text) return null;

  return (
    <div
      style={{
        ...phaseTextStyle,
        animation: animState === 'in' ? 'phaseTextIn 0.6s ease-out forwards' : 'phaseTextOut 0.5s ease-in forwards',
      }}
    >
      {text}
    </div>
  );
}

// ---- Main Component ----

export function TitleScreen() {
  const [step, setStep] = useState<WizardStep>(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [loading, setLoading] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [soul, setSoul] = useState('');
  const [agentName, setAgentName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const autoJoinAttempted = useRef(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [showSkipHint, setShowSkipHint] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TitleScene | null>(null);

  const setGame = useGameStore((s) => s.setGame);
  const setGameMode = useUIStore((s) => s.setGameMode);
  const selectAgent = useUIStore((s) => s.selectAgent);
  const followAgent = useUIStore((s) => s.followAgent);

  // Canvas background animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scene = createTitleScene();
    sceneRef.current = scene;
    let lastTime = performance.now();
    let rafId: number;
    let introNotified = false;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function loop(now: number) {
      const delta = Math.min(now - lastTime, 50); // cap to avoid jumps
      lastTime = now;
      updateTitleScene(scene, delta);
      renderTitleScene(ctx!, scene, canvas!.width, canvas!.height);

      // Track phase changes
      setCurrentPhase(scene.phase);

      // Trigger intro complete after phase 4 settles
      if (scene.phase === 4 && scene.phaseTime > 1500 && !introNotified) {
        introNotified = true;
        setIntroComplete(true);
      }

      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Show skip hint after 3 seconds
  useEffect(() => {
    if (introComplete) return;
    const timer = setTimeout(() => setShowSkipHint(true), 3000);
    return () => clearTimeout(timer);
  }, [introComplete]);

  // Skip handler: click or keypress during intro
  const handleSkip = useCallback(() => {
    if (introComplete) return;
    const scene = sceneRef.current;
    if (scene) skipToEnd(scene);
    setIntroComplete(true);
    setCurrentPhase(4);
  }, [introComplete]);

  // Auto-join a running headless game if one exists
  useEffect(() => {
    if (autoJoinAttempted.current) return;
    autoJoinAttempted.current = true;

    (async () => {
      try {
        const games = await api.listActiveGames();
        const running = games.find((g) => g.running);
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

  const goForward = useCallback((to: WizardStep) => {
    setDirection('forward');
    setStep(to);
    setError(null);
  }, []);

  const goBack = useCallback((to: WizardStep) => {
    setDirection('back');
    setStep(to);
    setError(null);
  }, []);

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

      // On-chain initialization if connected to Katana
      const walletState = useWalletStore.getState();
      if (walletState.isOnChain && walletState.account && walletState.provider) {
        try {
          const mapper = new VillageIdMapper();
          // Find the player's village UUID from game state
          const playerVillageId = agent.identity.id;

          // Initialize TX service
          initTxService(walletState.account, walletState.provider, mapper);

          // Run on-chain initialization
          await initializeOnChain(
            walletState.account,
            walletState.provider,
            mapper,
            playerVillageId,
          );

          // Start tick advancer
          const txService = new DojoTxService(walletState.account, walletState.provider);
          const tickAdvancer = new DojoTickAdvancer(txService, mapper);
          tickAdvancer.start(3000);

          // Start state sync polling
          const stateReader = new DojoStateReader(walletState.provider, WORLD_ADDRESS);
          const stateSync = new DojoStateSync(stateReader, mapper);
          stateSync.startPolling(3000);

          console.log('[TitleScreen] On-chain initialization complete');
        } catch (onChainErr) {
          console.warn('[TitleScreen] On-chain init failed (game continues off-chain):', onChainErr);
        }
      }

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

  const animationName = direction === 'forward' ? 'wizardSlideInRight' : 'wizardSlideInLeft';

  // Render the current step content
  let stepContent: React.ReactNode;
  if (autoJoining) {
    stepContent = <AutoJoinIndicator />;
  } else if (step === 0) {
    stepContent = (
      <MainMenu
        onStart={() => goForward(1)}
        onObserve={handleStartObserver}
        loading={loading}
      />
    );
  } else if (step === 1) {
    stepContent = (
      <NameStep
        agentName={agentName}
        setAgentName={setAgentName}
        onNext={() => goForward(2)}
        onBack={() => goBack(0)}
      />
    );
  } else if (step === 2) {
    stepContent = (
      <SoulStep
        soul={soul}
        setSoul={setSoul}
        onNext={() => goForward(3)}
        onBack={() => goBack(1)}
      />
    );
  } else {
    stepContent = (
      <PreviewStep
        agentName={agentName}
        soul={soul}
        loading={loading}
        error={error}
        onConfirm={handleStartPlayer}
        onBack={() => goBack(2)}
      />
    );
  }

  return (
    <div
      style={titleScreenContainerStyle}
      onClick={!introComplete ? handleSkip : undefined}
      onKeyDown={!introComplete ? handleSkip : undefined}
      tabIndex={0}
    >
      <canvas ref={canvasRef} style={backgroundCanvasStyle} />

      {/* Phase text overlay during intro */}
      {!introComplete && <PhaseTextOverlay phase={currentPhase} />}

      {/* Skip hint */}
      {!introComplete && showSkipHint && (
        <div style={{
          ...skipHintStyle,
          animation: 'phaseTextIn 0.6s ease-out forwards',
        }}>
          クリックでスキップ
        </div>
      )}

      {/* Main UI — fades in after intro completes */}
      {introComplete && (
        <div style={{
          ...contentOverlayStyle,
          animation: 'fadeIn 1s ease-out',
        }}>
          <TitleHeader shrink={step > 0} />

          {step > 0 && !autoJoining && (
            <StepIndicator current={step as 1 | 2 | 3} />
          )}

          <div
            key={step}
            style={{
              animation: `${animationName} 0.3s ease-out`,
            }}
          >
            {step > 0 && !autoJoining ? (
              <div style={glassCardStyle}>{stepContent}</div>
            ) : (
              stepContent
            )}
          </div>
        </div>
      )}
    </div>
  );
}
