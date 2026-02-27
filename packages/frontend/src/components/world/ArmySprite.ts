// F15: Army Visualization — 軍隊表示
import type { Army } from '@murasato/shared';
import { TILE_SIZE } from '@murasato/shared';

const STATUS_ICONS: Record<string, string> = {
  idle: '\u2691',       // flag
  moving: '\u2794',     // arrow
  attacking: '\u2694',  // swords
  defending: '\u26E8',  // shield
};

export function drawArmy(
  ctx: CanvasRenderingContext2D,
  army: Army,
  villageColor: string,
  camX: number,
  camY: number,
  halfW: number,
  halfH: number,
  zoom: number,
  tick: number,
): void {
  const worldX = army.position.x * TILE_SIZE + TILE_SIZE / 2;
  const worldY = army.position.y * TILE_SIZE + TILE_SIZE / 2;

  const screenX = halfW + (worldX - camX) * zoom;
  const screenY = halfH + (worldY - camY) * zoom;

  const baseSize = 16 * zoom;

  // Draw flag pole
  ctx.strokeStyle = '#333';
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(screenX, screenY + baseSize * 0.5);
  ctx.lineTo(screenX, screenY - baseSize * 0.5);
  ctx.stroke();

  // Draw flag (colored triangle)
  ctx.fillStyle = villageColor;
  ctx.beginPath();
  ctx.moveTo(screenX, screenY - baseSize * 0.5);
  ctx.lineTo(screenX + baseSize * 0.6, screenY - baseSize * 0.3);
  ctx.lineTo(screenX, screenY - baseSize * 0.1);
  ctx.closePath();
  ctx.fill();

  // Attacking: red pulse effect
  if (army.status === 'attacking') {
    const pulse = 0.3 + 0.3 * Math.sin(tick * 0.3);
    ctx.fillStyle = `rgba(255, 60, 60, ${pulse})`;
    ctx.beginPath();
    ctx.arc(screenX, screenY, baseSize * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Moving: draw line to target
  if (army.status === 'moving' && army.targetPosition) {
    const targetWorldX = army.targetPosition.x * TILE_SIZE + TILE_SIZE / 2;
    const targetWorldY = army.targetPosition.y * TILE_SIZE + TILE_SIZE / 2;
    const targetScreenX = halfW + (targetWorldX - camX) * zoom;
    const targetScreenY = halfH + (targetWorldY - camY) * zoom;

    ctx.strokeStyle = villageColor + '60';
    ctx.lineWidth = Math.max(1, zoom * 0.5);
    ctx.setLineDash([4 * zoom, 4 * zoom]);
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(targetScreenX, targetScreenY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Status icon
  const icon = STATUS_ICONS[army.status] ?? STATUS_ICONS.idle;
  const fontSize = Math.max(8, 10 * zoom);
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(icon, screenX + baseSize * 0.3, screenY + baseSize * 0.6);

  // Unit count badge
  const totalUnits = army.units.reduce((sum, u) => sum + u.count, 0);
  if (totalUnits > 0) {
    const badgeText = `\u00d7${totalUnits}`;
    const badgeFontSize = Math.max(7, 8 * zoom);
    ctx.font = `bold ${badgeFontSize}px monospace`;

    const textWidth = ctx.measureText(badgeText).width;
    const badgeX = screenX + baseSize * 0.4;
    const badgeY = screenY - baseSize * 0.5;

    // Badge background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(badgeX - 2, badgeY - badgeFontSize, textWidth + 4, badgeFontSize + 2, 3);
    ctx.fill();

    // Badge text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(badgeText, badgeX, badgeY - 1);
  }

  ctx.textAlign = 'start'; // Reset
}
