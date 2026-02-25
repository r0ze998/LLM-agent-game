import type { Structure } from '@murasato/shared';
import { TILE_SIZE } from '@murasato/shared';
import { getStructureColor } from './TileRenderer.ts';

const BUILDING_SIZES: Record<string, { w: number; h: number }> = {
  house:        { w: 14, h: 14 },
  farm:         { w: 16, h: 12 },
  workshop:     { w: 14, h: 14 },
  warehouse:    { w: 16, h: 14 },
  market:       { w: 16, h: 14 },
  meeting_hall: { w: 16, h: 16 },
  school:       { w: 14, h: 14 },
  temple:       { w: 16, h: 18 },
  wall:         { w: 16, h: 8 },
  watchtower:   { w: 10, h: 18 },
  well:         { w: 10, h: 10 },
  road:         { w: 16, h: 16 },
};

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  structure: Structure,
  cameraX: number,
  cameraY: number,
  zoom: number,
) {
  const color = getStructureColor(structure.type);
  const size = BUILDING_SIZES[structure.type] ?? { w: 14, h: 14 };

  const screenX = (structure.position.x * TILE_SIZE - cameraX) * zoom;
  const screenY = (structure.position.y * TILE_SIZE - cameraY) * zoom;
  const w = size.w * zoom;
  const h = size.h * zoom;

  // Building body
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(screenX + (TILE_SIZE * zoom - w) / 2, screenY + TILE_SIZE * zoom - h, w, h);

  // Roof (darker shade)
  const roofColor = Math.max(0, color - 0x202020);
  ctx.fillStyle = `#${roofColor.toString(16).padStart(6, '0')}`;
  const roofH = h * 0.3;
  ctx.fillRect(screenX + (TILE_SIZE * zoom - w) / 2, screenY + TILE_SIZE * zoom - h, w, roofH);

  // Door (for houses and meeting halls)
  if (['house', 'meeting_hall', 'school', 'temple'].includes(structure.type)) {
    ctx.fillStyle = '#3d2817';
    const doorW = w * 0.2;
    const doorH = h * 0.3;
    ctx.fillRect(
      screenX + (TILE_SIZE * zoom - doorW) / 2,
      screenY + TILE_SIZE * zoom - doorH,
      doorW,
      doorH,
    );
  }
}
