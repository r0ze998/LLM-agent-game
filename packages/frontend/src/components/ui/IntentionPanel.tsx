import { useState } from 'react';
import type { IntentionType, IntentionStrength } from '@murasato/shared';
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';
import { api } from '../../services/api.ts';

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
        <span style={{ fontWeight: 'bold', color: '#d4a0ff' }}>Divine Voice</span>
        <button onClick={toggle} style={closeBtn}>✕</button>
      </div>

      <div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>
        Target: {selectedAgentId ? `Selected agent` : 'Entire world'}
      </div>

      {/* Type selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['guide', 'value', 'warning', 'question', 'name'] as IntentionType[]).map((t) => (
          <button key={t} onClick={() => setType(t)} style={type === t ? chipActive : chip}>
            {t === 'guide' && 'Guide'}
            {t === 'value' && 'Values'}
            {t === 'warning' && 'Warning'}
            {t === 'question' && 'Question'}
            {t === 'name' && 'Naming'}
          </button>
        ))}
      </div>

      {/* Strength selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['whisper', 'suggestion', 'decree'] as IntentionStrength[]).map((s) => (
          <button key={s} onClick={() => setStrength(s)} style={strength === s ? chipActive : chip}>
            {s === 'whisper' && 'Whisper'}
            {s === 'suggestion' && 'Suggestion'}
            {s === 'decree' && 'Decree'}
          </button>
        ))}
      </div>

      {/* Text input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Enter your divine message..."
          style={inputStyle}
        />
        <button onClick={handleSend} disabled={sending || !message.trim()} style={sendBtn}>
          {sending ? '...' : 'Send'}
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
