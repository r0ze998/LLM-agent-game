/**
 * TilePatternCache — FRLG-style 16x16 procedural tile patterns
 *
 * Pre-renders each terrain variant onto small OffscreenCanvas tiles.
 * At render time we just drawImage() — no per-pixel work on the hot path.
 */

import type { TerrainType } from '@murasato/shared';
import { TILE_SIZE } from '@murasato/shared';

// ── helpers ──────────────────────────────────────────────────────────────

/** Deterministic hash for (tx, ty) → variant index. Same tile always looks the same. */
export function tileVariantHash(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) >>> 0;
  h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
  return h;
}

/** Pseudo-random from hash — returns 0..1 */
function hashF(tx: number, ty: number, seed: number): number {
  return ((tileVariantHash(tx + seed * 17, ty + seed * 31)) & 0xffff) / 0xffff;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

type PatternCanvas = HTMLCanvasElement;

// ── pattern drawing functions ────────────────────────────────────────────

function createTile(): [PatternCanvas, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// ─── Plains ──────────────────────────────────────────────────────────────

function drawPlains(variant: number): PatternCanvas {
  const [c, ctx] = createTile();
  // Base green
  ctx.fillStyle = '#78C848';
  ctx.fillRect(0, 0, 16, 16);

  // Subtle lighter pixels for texture
  const h = tileVariantHash(variant, 100);
  for (let i = 0; i < 12; i++) {
    const sx = ((h + i * 7) * 3) % 16;
    const sy = ((h + i * 13) * 5) % 16;
    px(ctx, sx, sy, '#88D858');
  }

  if (variant === 0) {
    // Grass tufts — small darker L-shapes
    px(ctx, 3, 10, '#58A828'); px(ctx, 4, 10, '#58A828'); px(ctx, 3, 9, '#58A828');
    px(ctx, 11, 4, '#58A828'); px(ctx, 12, 4, '#58A828'); px(ctx, 11, 3, '#58A828');
  } else if (variant === 1) {
    // Different tuft positions
    px(ctx, 7, 12, '#58A828'); px(ctx, 8, 12, '#58A828'); px(ctx, 7, 11, '#58A828');
    px(ctx, 2, 5, '#58A828'); px(ctx, 3, 5, '#58A828'); px(ctx, 2, 4, '#58A828');
    // Tiny flower
    px(ctx, 13, 7, '#F8E858');
  } else {
    // Sparse variant — mostly flat with highlights
    px(ctx, 5, 8, '#68B838'); px(ctx, 10, 3, '#68B838'); px(ctx, 14, 12, '#68B838');
    px(ctx, 1, 14, '#90E068'); px(ctx, 9, 9, '#90E068');
  }

  return c;
}

// ─── Forest ──────────────────────────────────────────────────────────────

function drawForest(variant: number): PatternCanvas {
  const [c, ctx] = createTile();

  // 明るめの緑ベース。ドットは最小限、キャラの邪魔をしない
  const base  = '#4A8838'; // 明るい森の緑
  const shade = '#3E7830'; // 1段暗い緑（影に使う）
  const lite  = '#589848'; // ほんの少し明るい緑
  const trunk = '#6B4830'; // 幹

  // ベース塗り
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);

  if (variant === 0) {
    // 小さな丸い樹冠 + 幹だけ
    px(ctx, 7, 11, trunk); px(ctx, 8, 11, trunk);
    px(ctx, 7, 12, trunk); px(ctx, 8, 12, trunk);

    ctx.fillStyle = shade;
    ctx.fillRect(5, 4, 6, 5);  // 樹冠ベース
    ctx.fillStyle = lite;
    ctx.fillRect(6, 5, 4, 3);  // 樹冠ハイライト

  } else if (variant === 1) {
    // 幹なし、2つの小さな樹冠で密林感
    ctx.fillStyle = shade;
    ctx.fillRect(2, 2, 5, 4);
    ctx.fillRect(9, 5, 5, 4);
    ctx.fillStyle = lite;
    ctx.fillRect(3, 3, 3, 2);
    ctx.fillRect(10, 6, 3, 2);

  } else {
    // ほぼフラット、控えめな草のアクセントだけ
    px(ctx, 3, 6, shade); px(ctx, 4, 6, shade);
    px(ctx, 10, 10, shade); px(ctx, 11, 10, shade);
    px(ctx, 7, 3, lite); px(ctx, 12, 13, lite);
  }

  return c;
}

// ─── Mountain ────────────────────────────────────────────────────────────

function drawMountain(variant: number): PatternCanvas {
  const [c, ctx] = createTile();
  // Rocky base
  ctx.fillStyle = '#8B7355';
  ctx.fillRect(0, 0, 16, 16);

  // Triangular rock face
  // Left side (lit)
  ctx.fillStyle = '#A08868';
  for (let y = 4; y < 16; y++) {
    const x0 = Math.max(0, 8 - (y - 4));
    ctx.fillRect(x0, y, 8 - x0, 1);
  }
  // Right side (shadow)
  ctx.fillStyle = '#6B5B45';
  for (let y = 4; y < 16; y++) {
    const x1 = Math.min(16, 8 + (y - 4));
    ctx.fillRect(8, y, x1 - 8, 1);
  }

  // Snow/highlight on peak
  px(ctx, 7, 4, '#D8D0C0'); px(ctx, 8, 4, '#D8D0C0');
  px(ctx, 7, 5, '#C8C0B0'); px(ctx, 8, 5, '#C8C0B0');

  if (variant === 0) {
    // Cracks
    px(ctx, 5, 9, '#5B4B35'); px(ctx, 6, 10, '#5B4B35'); px(ctx, 6, 11, '#5B4B35');
    px(ctx, 10, 8, '#5B4B35'); px(ctx, 11, 9, '#5B4B35');
  } else {
    // Different crack pattern + rubble at base
    px(ctx, 4, 10, '#5B4B35'); px(ctx, 5, 11, '#5B4B35');
    px(ctx, 12, 10, '#5B4B35'); px(ctx, 11, 11, '#5B4B35');
    // Rubble
    px(ctx, 2, 14, '#9B8365'); px(ctx, 3, 15, '#9B8365');
    px(ctx, 13, 14, '#9B8365'); px(ctx, 14, 15, '#9B8365');
  }

  return c;
}

// ─── Water (animated, 3 frames) ─────────────────────────────────────────

function drawWater(frame: number): PatternCanvas {
  const [c, ctx] = createTile();
  // Base water
  ctx.fillStyle = '#3878C8';
  ctx.fillRect(0, 0, 16, 16);

  // Darker depth
  ctx.fillStyle = '#2868B8';
  ctx.fillRect(0, 0, 16, 16);

  // Horizontal wave pattern — shifts by 2px per frame
  const offset = frame * 2;
  for (let y = 0; y < 16; y += 4) {
    for (let x = 0; x < 18; x += 6) {
      const wx = (x + offset + (y % 8 === 0 ? 0 : 3)) % 18 - 1;
      ctx.fillStyle = '#4888D8';
      ctx.fillRect(wx, y, 4, 1);
      ctx.fillStyle = '#5898E8';
      ctx.fillRect(wx + 1, y, 2, 1);
    }
    // Second wave row
    for (let x = 0; x < 18; x += 6) {
      const wx = (x + offset + 2 + (y % 8 === 0 ? 3 : 0)) % 18 - 1;
      ctx.fillStyle = '#3070B8';
      ctx.fillRect(wx, y + 2, 3, 1);
    }
  }

  // Foam/bubble pixels
  if (frame === 0) {
    px(ctx, 3, 5, '#78B8E8'); px(ctx, 11, 10, '#78B8E8');
  } else if (frame === 1) {
    px(ctx, 5, 7, '#78B8E8'); px(ctx, 13, 3, '#78B8E8');
  } else {
    px(ctx, 7, 11, '#78B8E8'); px(ctx, 1, 2, '#78B8E8');
  }

  return c;
}

// ─── Desert ──────────────────────────────────────────────────────────────

function drawDesert(variant: number): PatternCanvas {
  const [c, ctx] = createTile();
  // Sand base
  ctx.fillStyle = '#D4B36A';
  ctx.fillRect(0, 0, 16, 16);

  // Sandy texture — lighter grains
  for (let i = 0; i < 10; i++) {
    const sx = ((variant * 41 + i * 7) * 3) % 16;
    const sy = ((variant * 29 + i * 13) * 5) % 16;
    px(ctx, sx, sy, '#E0C480');
  }

  // Darker grains
  for (let i = 0; i < 6; i++) {
    const sx = ((variant * 53 + i * 11) * 3) % 16;
    const sy = ((variant * 37 + i * 19) * 5) % 16;
    px(ctx, sx, sy, '#C4A35A');
  }

  if (variant === 0) {
    // Small pebbles
    px(ctx, 4, 12, '#B09050'); px(ctx, 5, 12, '#B09050');
    px(ctx, 11, 6, '#B09050');
    // Wind ripple
    ctx.fillStyle = '#C8A860';
    ctx.fillRect(1, 9, 6, 1);
    ctx.fillRect(9, 13, 5, 1);
  } else {
    // Cactus-like mark
    px(ctx, 8, 5, '#78A830'); px(ctx, 8, 6, '#78A830'); px(ctx, 8, 7, '#78A830');
    px(ctx, 7, 6, '#78A830'); px(ctx, 9, 6, '#78A830');
    // Sand ripples
    ctx.fillStyle = '#C8A860';
    ctx.fillRect(2, 11, 5, 1);
    ctx.fillRect(10, 4, 4, 1);
  }

  return c;
}

// ─── Swamp ───────────────────────────────────────────────────────────────

function drawSwamp(variant: number): PatternCanvas {
  const [c, ctx] = createTile();
  // Dark green-brown base
  ctx.fillStyle = '#4A6030';
  ctx.fillRect(0, 0, 16, 16);

  // Muddy patches
  ctx.fillStyle = '#3A5020';
  ctx.fillRect(2, 3, 5, 4);
  ctx.fillRect(9, 10, 4, 3);

  // Water puddles (irregular)
  ctx.fillStyle = '#3868A0';
  if (variant === 0) {
    ctx.fillRect(4, 8, 3, 2);
    ctx.fillRect(5, 7, 2, 1);
    px(ctx, 12, 3, '#3868A0'); px(ctx, 13, 3, '#3868A0'); px(ctx, 12, 4, '#3868A0');
  } else {
    ctx.fillRect(8, 5, 4, 2);
    ctx.fillRect(9, 4, 2, 1);
    px(ctx, 2, 12, '#3868A0'); px(ctx, 3, 12, '#3868A0');
  }

  // Puddle highlights
  px(ctx, variant === 0 ? 5 : 9, variant === 0 ? 8 : 5, '#4878B0');

  // Dead grass
  px(ctx, 1, 13, '#8B8040'); px(ctx, 2, 12, '#8B8040');
  px(ctx, 14, 6, '#8B8040'); px(ctx, 13, 5, '#8B8040');

  // Bubbles
  if (variant === 0) {
    px(ctx, 5, 9, '#68A870');
  } else {
    px(ctx, 10, 6, '#68A870');
    px(ctx, 3, 13, '#68A870');
  }

  return c;
}

// ── Cache singleton ──────────────────────────────────────────────────────

interface PatternSet {
  variants: PatternCanvas[];    // static terrain variants
}

const terrainPatterns = new Map<TerrainType, PatternSet>();
const waterFrames: PatternCanvas[] = [];
let initialized = false;

function initPatterns() {
  if (initialized) return;
  initialized = true;

  // Plains — 3 variants
  terrainPatterns.set('plains', {
    variants: [drawPlains(0), drawPlains(1), drawPlains(2)],
  });

  // Forest — 3 variants (single tree, dense canopy, clearing with stump)
  terrainPatterns.set('forest', {
    variants: [drawForest(0), drawForest(1), drawForest(2)],
  });

  // Mountain — 2 variants
  terrainPatterns.set('mountain', {
    variants: [drawMountain(0), drawMountain(1)],
  });

  // Desert — 2 variants
  terrainPatterns.set('desert', {
    variants: [drawDesert(0), drawDesert(1)],
  });

  // Swamp — 2 variants
  terrainPatterns.set('swamp', {
    variants: [drawSwamp(0), drawSwamp(1)],
  });

  // Water — 3 animation frames
  waterFrames.push(drawWater(0), drawWater(1), drawWater(2));

  // Water still needs a PatternSet entry for fallback
  terrainPatterns.set('water', {
    variants: [waterFrames[0]],
  });
}

/**
 * Get the tile pattern canvas for a given terrain type at tile coordinates.
 * For water, returns the current animation frame.
 */
export function getTilePatternCanvas(
  terrain: TerrainType,
  tx: number,
  ty: number,
): PatternCanvas {
  initPatterns();

  if (terrain === 'water') {
    const frame = Math.floor(Date.now() / 600) % 3;
    return waterFrames[frame];
  }

  const set = terrainPatterns.get(terrain);
  if (!set) {
    // Fallback: return plains variant 0
    return terrainPatterns.get('plains')!.variants[0];
  }

  const variantIdx = tileVariantHash(tx, ty) % set.variants.length;
  return set.variants[variantIdx];
}
