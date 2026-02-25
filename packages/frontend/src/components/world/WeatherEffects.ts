import { TICKS_PER_DAY } from '@murasato/shared';

// Time-of-day overlay colors
export function getTimeOverlay(tickOfDay: number): { color: string; alpha: number } {
  const hour = (tickOfDay % TICKS_PER_DAY) / TICKS_PER_DAY * 24;

  // Night (0-5): dark blue
  if (hour < 5) return { color: '#0a0a2e', alpha: 0.5 };
  // Dawn (5-7): warm orange
  if (hour < 7) return { color: '#ff8c42', alpha: 0.15 };
  // Day (7-17): clear
  if (hour < 17) return { color: '#ffffff', alpha: 0 };
  // Sunset (17-19): warm orange
  if (hour < 19) return { color: '#ff6b35', alpha: 0.15 };
  // Dusk (19-21): purple
  if (hour < 21) return { color: '#2d1b69', alpha: 0.25 };
  // Night (21-24): dark blue
  return { color: '#0a0a2e', alpha: 0.45 };
}

export function applyTimeOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tickOfDay: number,
) {
  const { color, alpha } = getTimeOverlay(tickOfDay);
  if (alpha <= 0) return;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}
