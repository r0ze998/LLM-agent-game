import { useState } from 'react';
import type { IntentionType, IntentionStrength } from '@murasato/shared';
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';
import { api } from '../../services/api.ts';
import { useEvmWalletStore } from '../../store/evmWalletStore.ts';

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 100,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(500px, 85vw)',
  background: 'linear-gradient(180deg, #2a1a3e 0%, #1a0d24 100%)',
  border: '2px solid #8a5fa5',
  borderRadius: 8,
  padding: 16,
  color: '#e8e8e8',
  fontFamily: '"M PLUS 1p", monospace',
  fontSize: 14,
  zIndex: 90,
};

export function IntentionPanel() {
  const show = useUIStore((s) => s.showIntentionPanel);
  const toggle = useUIStore((s) => s.toggleIntentionPanel);
  const gameMode = useUIStore((s) => s.gameMode);
  const game = useGameStore((s) => s.game);
  const selectedAgentId = useUIStore((s) => s.selectedAgentId);

  const [message, setMessage] = useState('');
  const [type, setType] = useState<IntentionType>('guide');
  const [strength, setStrength] = useState<IntentionStrength>('suggestion');
  const [sending, setSending] = useState(false);
  const evmConnected = useEvmWalletStore((s) => s.isConnected);

  const INTENTION_COST_USD = '$0.001';

  if (gameMode === 'observer' || !show || !game) return null;

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.sendIntention(game.id, {
        type,
        targetType: selectedAgentId ? 'agent' : 'world',
        targetId: selectedAgentId ?? undefined,
        message,
        strength,
      });
      setMessage('');
    } catch (err) {
      console.error('Failed to send intention:', err);
    }
    setSending(false);
  };

  return (
    <div style={{ ...panelStyle, animation: 'slideDown 0.2s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 'bold', color: '#d4a0ff' }}>天の声</span>
        <button onClick={toggle} style={closeBtn}>✕</button>
      </div>

      <div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>
        対象: {selectedAgentId ? `選択されたエージェント` : '全世界'}
      </div>

      {/* Type selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['guide', 'value', 'warning', 'question', 'name'] as IntentionType[]).map((t) => (
          <button key={t} onClick={() => setType(t)} style={type === t ? chipActive : chip}>
            {t === 'guide' && '導き'}
            {t === 'value' && '価値観'}
            {t === 'warning' && '警告'}
            {t === 'question' && '問い'}
            {t === 'name' && '命名'}
          </button>
        ))}
      </div>

      {/* Strength selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['whisper', 'suggestion', 'decree'] as IntentionStrength[]).map((s) => (
          <button key={s} onClick={() => setStrength(s)} style={strength === s ? chipActive : chip}>
            {s === 'whisper' && 'ささやき'}
            {s === 'suggestion' && '提案'}
            {s === 'decree' && '布告'}
          </button>
        ))}
      </div>

      {/* Cost indicator */}
      {evmConnected && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          padding: '4px 8px',
          background: 'rgba(79, 195, 247, 0.1)',
          border: '1px solid rgba(79, 195, 247, 0.3)',
          borderRadius: 4,
          fontSize: 11,
        }}>
          <span style={{ color: '#4fc3f7' }}>USDC</span>
          <span style={{ color: '#aaa' }}>コスト: {INTENTION_COST_USD} / コマンド</span>
          <span style={{ color: '#666', marginLeft: 'auto' }}>Base</span>
        </div>
      )}

      {/* Text input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="天の声を入力..."
          style={inputStyle}
        />
        <button onClick={handleSend} disabled={sending || !message.trim()} style={sendBtn}>
          {sending ? '...' : evmConnected ? `送信 (${INTENTION_COST_USD})` : '送信'}
        </button>
      </div>
    </div>
  );
}

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16,
};

const chip: React.CSSProperties = {
  background: '#333', border: '1px solid #555', borderRadius: 4, padding: '2px 8px',
  color: '#ccc', cursor: 'pointer', fontSize: 12,
};

const chipActive: React.CSSProperties = {
  ...chip, background: '#6a3fa5', borderColor: '#8a5fa5', color: '#fff',
};

const inputStyle: React.CSSProperties = {
  flex: 1, background: '#111', border: '1px solid #555', borderRadius: 4, padding: '6px 10px',
  color: '#eee', fontSize: 14, fontFamily: 'inherit', outline: 'none',
};

const sendBtn: React.CSSProperties = {
  background: '#6a3fa5', border: 'none', borderRadius: 4, padding: '6px 16px',
  color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
};
