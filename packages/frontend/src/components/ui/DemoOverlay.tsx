import { useEffect, useState, useRef } from 'react';
import { useUIStore } from '../../store/uiStore.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { GameEvent } from '@murasato/shared';

type DemoPhase = 'conversation' | 'construction' | 'war' | 'birth' | 'default';

const PHASE_CONFIG: Record<DemoPhase, { label: string; color: string }> = {
  conversation: { label: 'Generating AI dialogue...', color: '#d4a0ff' },
  construction: { label: 'Building...', color: '#ffb464' },
  war: { label: 'Resolving combat...', color: '#ff6b6b' },
  birth: { label: 'New agent born...', color: '#64ffb4' },
  default: { label: 'Agents acting...', color: '#7ab8ff' },
};

function eventToPhase(type: string): DemoPhase {
  if (type === 'conversation') return 'conversation';
  if (type === 'construction') return 'construction';
  if (type === 'war') return 'war';
  if (type === 'birth' || type === 'reproduction') return 'birth';
  return 'default';
}

interface FeedItem {
  id: string;
  text: string;
  phase: DemoPhase;
  tick: number;
}

export function DemoOverlay() {
  const show = useUIStore((s) => s.showDemoOverlay);
  const toggle = useUIStore((s) => s.toggleDemoOverlay);
  const events = useGameStore((s) => s.events);

  const [phase, setPhase] = useState<DemoPhase>('default');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const prevEventsLen = useRef(0);

  // D key toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        // Ignore if typing in an input
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  // React to new events
  useEffect(() => {
    if (events.length <= prevEventsLen.current) {
      prevEventsLen.current = events.length;
      return;
    }

    const newEvents = events.slice(prevEventsLen.current);
    prevEventsLen.current = events.length;

    // Update phase from latest event
    if (newEvents.length > 0) {
      const latest = newEvents[newEvents.length - 1];
      setPhase(eventToPhase(latest.type));
    }

    // Add to feed (keep last 5)
    const newItems: FeedItem[] = newEvents.map((ev: GameEvent) => ({
      id: ev.id,
      text: ev.description,
      phase: eventToPhase(ev.type),
      tick: ev.tick,
    }));

    setFeed((prev) => [...prev, ...newItems].slice(-5));
  }, [events]);

  if (!show) return null;

  const { label, color } = PHASE_CONFIG[phase];

  return (
    <>
      {/* Phase indicator — top left */}
      <div style={{
        position: 'fixed',
        top: 52,
        left: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(13,13,36,0.85)',
        border: '1px solid #4a6fa5',
        borderRadius: 6,
        padding: '6px 14px',
        fontFamily: '"M PLUS 1p", monospace',
        fontSize: 13,
        color: '#e8e8e8',
        zIndex: 110,
        backdropFilter: 'blur(4px)',
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${color}`,
          animation: 'demoPulse 1.5s ease-in-out infinite',
        }} />
        {label}
      </div>

      {/* Event feed — top right */}
      <div style={{
        position: 'fixed',
        top: 52,
        right: 16,
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        zIndex: 110,
        pointerEvents: 'none',
      }}>
        {feed.map((item, i) => (
          <div
            key={item.id}
            style={{
              background: 'rgba(13,13,36,0.85)',
              border: '1px solid #4a6fa5',
              borderRadius: 6,
              padding: '6px 12px',
              fontFamily: '"M PLUS 1p", monospace',
              fontSize: 11,
              color: '#ccc',
              backdropFilter: 'blur(4px)',
              animation: 'demoFadeIn 0.4s ease-out',
              opacity: 0.5 + (i / feed.length) * 0.5,
            }}
          >
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: PHASE_CONFIG[item.phase].color,
              marginRight: 8,
              verticalAlign: 'middle',
            }} />
            <span style={{ color: '#666', marginRight: 6 }}>t{item.tick}</span>
            {item.text.length > 60 ? item.text.slice(0, 60) + '...' : item.text}
          </div>
        ))}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes demoPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes demoFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
