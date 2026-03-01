// F17: Event Notification Toasts — stacked display at bottom-right
import { useEffect, useState } from 'react';
import { useNotificationStore, type Notification } from '../../store/notificationStore.ts';

export function NotificationToasts() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const clearOld = useNotificationStore((s) => s.clearOld);

  // Auto-clear old notifications every second
  useEffect(() => {
    const interval = setInterval(clearOld, 1000);
    return () => clearInterval(interval);
  }, [clearOld]);

  const active = notifications.filter((n) => !n.dismissed);

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      right: 16,
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: 8,
      zIndex: 200,
      pointerEvents: 'none',
    }}>
      {active.map((n) => (
        <Toast key={n.id} notification={n} onDismiss={() => dismiss(n.id)} />
      ))}
    </div>
  );
}

function Toast({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const [opacity, setOpacity] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Slide in
    requestAnimationFrame(() => setOpacity(1));
    // Auto dismiss after 6s
    const timer = setTimeout(() => setExiting(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (exiting) {
      setOpacity(0);
      const timer = setTimeout(onDismiss, 400);
      return () => clearTimeout(timer);
    }
  }, [exiting, onDismiss]);

  const TYPE_ICONS: Record<string, string> = {
    birth: '\u{1F476}',
    death: '\u{1F480}',
    war: '\u2694\uFE0F',
    peace: '\u{1F54A}\uFE0F',
    founding: '\u{1F3D8}\uFE0F',
    discovery: '\u{1F52C}',
    election: '\u{1F5F3}\uFE0F',
    battle: '\u2694\uFE0F',
    tech: '\u{1F4D6}',
    victory: '\u{1F3C6}',
  };

  return (
    <div style={{
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'stretch',
      background: 'rgba(13, 13, 36, 0.92)',
      borderRadius: 8,
      border: '1px solid rgba(74, 111, 165, 0.4)',
      overflow: 'hidden',
      minWidth: 260,
      maxWidth: 340,
      opacity,
      transform: `translateX(${opacity === 0 ? 60 : 0}px)`,
      transition: 'opacity 0.35s ease, transform 0.35s ease',
      cursor: 'pointer',
      fontFamily: '"M PLUS 1p", monospace',
    }} onClick={() => setExiting(true)}>
      {/* Color bar */}
      <div style={{
        width: 4,
        background: notification.color,
        flexShrink: 0,
      }} />

      <div style={{ padding: '8px 12px', flex: 1 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 2,
        }}>
          <span style={{ fontSize: 14 }}>
            {TYPE_ICONS[notification.type] ?? '\u2139\uFE0F'}
          </span>
          <span style={{
            color: '#e8e8e8',
            fontSize: 12,
            fontWeight: 'bold',
          }}>
            {notification.title}
          </span>
        </div>
        <div style={{
          color: '#999',
          fontSize: 11,
          lineHeight: 1.3,
        }}>
          {notification.description}
        </div>
      </div>
    </div>
  );
}
