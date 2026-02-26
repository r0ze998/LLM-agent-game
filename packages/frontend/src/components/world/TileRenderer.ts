import type { TerrainType, Tile } from '@murasato/shared';
import { TILE_SIZE } from '@murasato/shared';
import { getTilePatternCanvas } from './TilePatternCache.ts';

// Terrain color palette (JRPG-inspired pixel art colors)
const TERRAIN_COLORS: Record<TerrainType, number> = {
  plains:   0x7ec850,  // bright green
  forest:   0x2d6b30,  // dark green
  mountain: 0x8b7355,  // brown
  water:    0x3a7bd5,  // blue
  desert:   0xd4b36a,  // sandy
  swamp:    0x5a6e3a,  // murky green
};

const STRUCTURE_COLORS: Record<string, number> = {
  house:        0xc4956a,
  farm:         0xd4c36a,
  workshop:     0x8b6914,
  warehouse:    0xa0522d,
  market:       0xdaa520,
  meeting_hall: 0xcd853f,
  school:       0xb0c4de,
  temple:       0xffd700,
  wall:         0x808080,
  watchtower:   0x696969,
  well:         0x4682b4,
  road:         0xa09080,
};

export function getTileColor(tile: Tile): number {
  if (tile.structureId) {
    // Would look up structure type; for now use generic
    return 0xc4956a;
  }
  return TERRAIN_COLORS[tile.terrain] ?? 0x333333;
}

export function getStructureColor(structureType: string): number {
  return STRUCTURE_COLORS[structureType] ?? 0xc4956a;
}

// Get an elevation-adjusted shade
export function getElevationShade(baseColor: number, elevation: number): number {
  const factor = 0.7 + elevation * 0.6; // 0.7 to 1.3
  const r = Math.min(255, Math.round(((baseColor >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((baseColor >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((baseColor & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/**
 * Draw a FRLG-style tile pattern at the given screen position.
 * Uses cached 16×16 pattern canvases stamped via drawImage().
 * Elevation is applied as a semi-transparent color overlay on top.
 */
export function drawTilePattern(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  tx: number,
  ty: number,
  screenX: number,
  screenY: number,
  size: number,
) {
  const pattern = getTilePatternCanvas(tile.terrain, tx, ty);

  // Stamp the 16×16 pattern scaled to `size`
  ctx.drawImage(pattern, 0, 0, TILE_SIZE, TILE_SIZE, screenX, screenY, size, size);

  // Elevation overlay: warm highlight for high ground, cool shadow for low ground
  const mid = 0.5;
  const delta = tile.elevation - mid;
  if (delta > 0.05) {
    // High ground — warm highlight
    const intensity = Math.min(0.25, delta * 0.5);
    ctx.fillStyle = `rgba(255,255,200,${intensity})`;
    ctx.fillRect(screenX, screenY, size, size);
  } else if (delta < -0.05) {
    // Low ground — cool shadow
    const intensity = Math.min(0.25, Math.abs(delta) * 0.5);
    ctx.fillStyle = `rgba(0,0,30,${intensity})`;
    ctx.fillRect(screenX, screenY, size, size);
  }
}

// Personality-to-color mapping for agent sprites
export function getAgentColor(personality: {
  openness: number;
  agreeableness: number;
  ambition: number;
}): number {
  // High openness → brighter
  // High ambition → red/gold
  // High agreeableness → green/blue
  const r = Math.round(100 + personality.ambition * 1.5);
  const g = Math.round(100 + personality.agreeableness * 1.2);
  const b = Math.round(100 + personality.openness * 1.0);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
}
