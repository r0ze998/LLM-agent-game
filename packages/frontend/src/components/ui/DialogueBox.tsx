import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore.ts';

const CHAR_DELAY = 40; // ms per character (typewriter effect)

export function DialogueBox() {
  const dialogueQueue = useGameStore((s) => s.dialogueQueue);
  const dialogue = dialogueQueue[0] ?? null;
  const agents = useGameStore((s) => s.agents);
  const shiftDialogue = useGameStore((s) => s.shiftDialogue);
  const [currentLine, setCurrentLine] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!dialogue) {
      setCurrentLine(0);
      setDisplayText('');
      return;
    }
    setCurrentLine(0);
    setDisplayText('');
    setIsTyping(true);
  }, [dialogue]);

  // Typewriter effect
  useEffect(() => {
    if (!dialogue || currentLine >= dialogue.lines.length) return;

    const line = dialogue.lines[currentLine];
    const fullText = line.text;
    let charIdx = 0;

    setDisplayText('');
    setIsTyping(true);

    timerRef.current = setInterval(() => {
      charIdx++;
      setDisplayText(fullText.slice(0, charIdx));
      if (charIdx >= fullText.length) {
        clearInterval(timerRef.current);
        setIsTyping(false);
      }
    }, CHAR_DELAY);

    return () => clearInterval(timerRef.current);
  }, [dialogue, currentLine]);

  if (!dialogue || dialogue.lines.length === 0) return null;

  const line = dialogue.lines[currentLine];
  const speaker = agents.get(line?.speakerId);
  const speakerName = speaker?.identity.name ?? '???';

  const handleAdvance = () => {
    if (isTyping) {
      // Skip to full text
      clearInterval(timerRef.current);
      setDisplayText(dialogue.lines[currentLine].text);
      setIsTyping(false);
    } else if (currentLine < dialogue.lines.length - 1) {
      setCurrentLine(currentLine + 1);
    } else {
      shiftDialogue();
    }
  };

  return (
    <div
      onClick={handleAdvance}
      style={{
        animation: 'slideUp 0.2s ease',
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(700px, 90vw)',
        background: 'linear-gradient(180deg, #1a1a3e 0%, #0d0d24 100%)',
        border: '3px solid #4a6fa5',
        borderRadius: 8,
        padding: '16px 20px',
        color: '#e8e8e8',
        fontFamily: '"M PLUS 1p", "Hiragino Kaku Gothic ProN", monospace',
        fontSize: 16,
        lineHeight: 1.6,
        cursor: 'pointer',
        zIndex: 100,
        boxShadow: '0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(74,111,165,0.3)',
        userSelect: 'none',
      }}
    >
      {/* Speaker name tag */}
      <div style={{
        position: 'absolute',
        top: -14,
        left: 16,
        background: '#4a6fa5',
        padding: '2px 12px',
        borderRadius: 4,
        fontSize: 13,
        fontWeight: 'bold',
        color: '#fff',
      }}>
        {speakerName}
      </div>

      {/* Text */}
      <div style={{ minHeight: 48 }}>
        {displayText}
        {isTyping && <span style={{ animation: 'blink 0.5s infinite' }}>|</span>}
      </div>

      {/* Advance indicator */}
      {!isTyping && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          right: 16,
          fontSize: 12,
          color: '#7a9ec7',
          animation: 'bounce 1s infinite',
        }}>
          {currentLine < dialogue.lines.length - 1 ? '▼' : '■ 閉じる'}
        </div>
      )}
    </div>
  );
}
