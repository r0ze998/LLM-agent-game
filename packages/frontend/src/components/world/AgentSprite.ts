/**
 * AgentSprite — FRLG-style chibi characters with cached sprite canvases.
 *
 * Each unique agent color produces 3 walk-frame canvases (16×16 each).
 * At render time we just drawImage() from the cache.
 */

import type { AgentState } from '@murasato/shared';
import { TILE_SIZE } from '@murasato/shared';
import { getAgentColor } from './TileRenderer.ts';

// ── Constants ────────────────────────────────────────────────────────────

const SPRITE_W = 16;
const SPRITE_H = 16;
const WALK_FRAMES = 3;
const FRAME_DURATION = 200; // ms per frame

// ── Sprite data interface ────────────────────────────────────────────────

export interface AgentSpriteData {
  id: string;
  name: string;
  color: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  frame: number;
  isMoving: boolean;
  status: string;
  currentAction: string | null;
  isBlueprint: boolean;
}

export function createAgentSpriteData(agent: AgentState): AgentSpriteData {
  return {
    id: agent.identity.id,
    name: agent.identity.name,
    color: getAgentColor(agent.identity.personality),
    x: agent.position.x * TILE_SIZE,
    y: agent.position.y * TILE_SIZE,
    prevX: agent.position.x * TILE_SIZE,
    prevY: agent.position.y * TILE_SIZE,
    frame: 0,
    isMoving: false,
    status: agent.identity.status,
    currentAction: agent.currentAction,
    isBlueprint: !!agent.identity.blueprintId,
  };
}

export function updateAgentSpriteData(sprite: AgentSpriteData, agent: AgentState, deltaMs: number): void {
  const targetX = agent.position.x * TILE_SIZE;
  const targetY = agent.position.y * TILE_SIZE;

  if (targetX !== sprite.x || targetY !== sprite.y) {
    sprite.prevX = sprite.x;
    sprite.prevY = sprite.y;
    sprite.isMoving = true;
  }

  const speed = 0.1;
  sprite.x += (targetX - sprite.x) * speed;
  sprite.y += (targetY - sprite.y) * speed;

  if (Math.abs(targetX - sprite.x) < 0.5 && Math.abs(targetY - sprite.y) < 0.5) {
    sprite.x = targetX;
    sprite.y = targetY;
    sprite.isMoving = false;
  }

  if (sprite.isMoving) {
    sprite.frame = (sprite.frame + 1) % (WALK_FRAMES * 4);
  } else {
    sprite.frame = 0;
  }

  sprite.status = agent.identity.status;
  sprite.currentAction = agent.currentAction;
}

// ── Sprite canvas cache (keyed by quantized color) ───────────────────────

/** Quantize color to 4-bit per channel → fewer cache entries */
function quantizeColor(c: number): number {
  const r = ((c >> 16) & 0xff) & 0xf0;
  const g = ((c >> 8) & 0xff) & 0xf0;
  const b = (c & 0xff) & 0xf0;
  return (r << 16) | (g << 8) | b;
}

function colorToHex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

function darken(c: number, amt: number): number {
  const r = Math.max(0, ((c >> 16) & 0xff) - amt);
  const g = Math.max(0, ((c >> 8) & 0xff) - amt);
  const b = Math.max(0, (c & 0xff) - amt);
  return (r << 16) | (g << 8) | b;
}

function lighten(c: number, amt: number): number {
  const r = Math.min(255, ((c >> 16) & 0xff) + amt);
  const g = Math.min(255, ((c >> 8) & 0xff) + amt);
  const b = Math.min(255, (c & 0xff) + amt);
  return (r << 16) | (g << 8) | b;
}

// Cache: quantizedColor → [frame0, frame1, frame2]
const spriteCache = new Map<number, HTMLCanvasElement[]>();

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

/**
 * FRLG 風フィールドスプライト — fillRect ベースのソリッドブロック描画
 *
 * 大きな塗り潰し矩形を重ねて描くことで、ズームアウトでも視認性の高い
 * チャンキーなちびキャラを実現。px() は目のみ。
 *
 * Layout (16×16, 二頭身):
 *  y0-4  : 髪（8px幅ソリッドブロック + ハイライト）
 *  y4-7  : 顔（6px幅、肌色ブロック + 目2dot）
 *  y8-10 : 服（6px幅、パーソナリティカラー）
 *  y11-12: 脚（パンツ）
 *  y13   : 靴
 */
function generateSpriteFrames(color: number): HTMLCanvasElement[] {
  const skin   = '#F8C8A0';
  const skinSh = '#E0B090';
  const hair   = colorToHex(darken(color, 60));
  const hairHi = colorToHex(darken(color, 25));
  const shirt  = colorToHex(color);
  const shirtD = colorToHex(darken(color, 40));
  const pants  = '#484860';
  const shoe   = '#383040';
  const eye    = '#202020';

  const frames: HTMLCanvasElement[] = [];

  for (let f = 0; f < 3; f++) {
    const c = document.createElement('canvas');
    c.width = SPRITE_W;
    c.height = SPRITE_H;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // ── HAIR (solid block) ──
    ctx.fillStyle = hair;
    ctx.fillRect(4, 0, 8, 5);      // 8px wide hair mass
    ctx.fillStyle = hairHi;
    ctx.fillRect(5, 1, 6, 2);      // highlight band

    // ── FACE (solid block, overlaps bottom of hair) ──
    ctx.fillStyle = skin;
    ctx.fillRect(5, 4, 6, 4);      // 6px wide face
    // Hair side-locks framing face
    ctx.fillStyle = hair;
    ctx.fillRect(4, 4, 1, 2);
    ctx.fillRect(11, 4, 1, 2);
    // Eyes — only detail using px()
    px(ctx, 6, 5, eye);
    px(ctx, 9, 5, eye);
    // Chin shadow
    ctx.fillStyle = skinSh;
    ctx.fillRect(6, 7, 4, 1);

    // ── BODY (solid shirt block) ──
    ctx.fillStyle = shirt;
    ctx.fillRect(5, 8, 6, 3);      // shirt
    ctx.fillStyle = shirtD;
    ctx.fillRect(5, 10, 6, 1);     // shirt shadow

    // ── LEGS + SHOES (walk animation) ──
    if (f === 0) {
      // Standing — legs together
      ctx.fillStyle = pants;
      ctx.fillRect(6, 11, 4, 2);
      ctx.fillStyle = shoe;
      ctx.fillRect(6, 13, 2, 1);
      ctx.fillRect(8, 13, 2, 1);
    } else if (f === 1) {
      // Stride left
      ctx.fillStyle = pants;
      ctx.fillRect(5, 11, 2, 2);
      ctx.fillRect(8, 11, 2, 2);
      ctx.fillStyle = shoe;
      ctx.fillRect(5, 13, 2, 1);
      ctx.fillRect(8, 13, 2, 1);
    } else {
      // Stride right
      ctx.fillStyle = pants;
      ctx.fillRect(6, 11, 2, 2);
      ctx.fillRect(9, 11, 2, 2);
      ctx.fillStyle = shoe;
      ctx.fillRect(6, 13, 2, 1);
      ctx.fillRect(9, 13, 2, 1);
    }

    frames.push(c);
  }

  return frames;
}

function getCachedFrames(color: number): HTMLCanvasElement[] {
  const q = quantizeColor(color);
  let frames = spriteCache.get(q);
  if (!frames) {
    frames = generateSpriteFrames(q);
    spriteCache.set(q, frames);
  }
  return frames;
}

// ── Public draw function ─────────────────────────────────────────────────

export function drawAgent(
  ctx: CanvasRenderingContext2D,
  sprite: AgentSpriteData,
  cameraX: number,
  cameraY: number,
  zoom: number,
  isSelected: boolean,
) {
  const screenX = (sprite.x - cameraX) * zoom;
  const screenY = (sprite.y - cameraY) * zoom;
  const w = SPRITE_W * zoom;
  const h = SPRITE_H * zoom;

  // Blueprint aura (pulsing purple glow)
  if (sprite.isBlueprint && sprite.status !== 'dead') {
    const pulse = 0.3 + Math.sin(Date.now() * 0.003) * 0.15;
    const auraSize = 6 * zoom;
    ctx.save();
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 8 * zoom;
    ctx.fillStyle = `rgba(168, 85, 247, ${pulse})`;
    ctx.beginPath();
    ctx.ellipse(screenX + w / 2, screenY + h / 2, w / 2 + auraSize, h / 2 + auraSize, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Selection highlight
  if (isSelected) {
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX - 2, screenY - 2, w + 4, h + 4);
  }

  // Pick walk frame
  const frameIdx = sprite.isMoving
    ? ((Math.floor(sprite.frame / 4) % WALK_FRAMES) || 1)  // cycle 1-2-1-2…
    : 0;

  const frames = getCachedFrames(sprite.color);
  const frameCanvas = frames[frameIdx];

  // Stamp the cached sprite canvas
  ctx.drawImage(frameCanvas, 0, 0, SPRITE_W, SPRITE_H, screenX, screenY, w, h);

  // Dead indicator
  if (sprite.status === 'dead') {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff0000';
    ctx.font = `${12 * zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('X', screenX + w / 2, screenY + h / 2 + 4 * zoom);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  // Name label
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.font = `${Math.max(8, 10 * zoom)}px "M PLUS 1p", sans-serif`;
  ctx.textAlign = 'center';
  const nameY = screenY - 4 * zoom;
  ctx.strokeText(sprite.name, screenX + w / 2, nameY);
  ctx.fillText(sprite.name, screenX + w / 2, nameY);
  ctx.textAlign = 'start';
}
