import type { AgentState } from '@murasato/shared';
import { TILE_SIZE } from '@murasato/shared';
import { getAgentColor } from './TileRenderer.ts';

// Agent rendering constants
const AGENT_WIDTH = 12;
const AGENT_HEIGHT = 16;
const WALK_FRAMES = 3;
const FRAME_DURATION = 200; // ms per frame

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
  };
}

export function updateAgentSpriteData(sprite: AgentSpriteData, agent: AgentState, deltaMs: number): void {
  const targetX = agent.position.x * TILE_SIZE;
  const targetY = agent.position.y * TILE_SIZE;

  // Detect movement
  if (targetX !== sprite.x || targetY !== sprite.y) {
    sprite.prevX = sprite.x;
    sprite.prevY = sprite.y;
    sprite.isMoving = true;
  }

  // Smooth interpolation
  const speed = 0.1;
  sprite.x += (targetX - sprite.x) * speed;
  sprite.y += (targetY - sprite.y) * speed;

  // Snap when close
  if (Math.abs(targetX - sprite.x) < 0.5 && Math.abs(targetY - sprite.y) < 0.5) {
    sprite.x = targetX;
    sprite.y = targetY;
    sprite.isMoving = false;
  }

  // Animation frame
  if (sprite.isMoving) {
    sprite.frame = (sprite.frame + 1) % (WALK_FRAMES * 4);
  } else {
    sprite.frame = 0;
  }

  sprite.status = agent.identity.status;
  sprite.currentAction = agent.currentAction;
}

// Draw agent as a simple pixel character (no sprite sheet needed yet)
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
  const w = AGENT_WIDTH * zoom;
  const h = AGENT_HEIGHT * zoom;

  // Selection highlight
  if (isSelected) {
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX - 2, screenY - 2, w + 4, h + 4);
  }

  // Body (simple pixel character)
  const color = `#${sprite.color.toString(16).padStart(6, '0')}`;

  // Head
  ctx.fillStyle = '#ffd5b0'; // skin tone
  const headSize = w * 0.6;
  ctx.fillRect(screenX + (w - headSize) / 2, screenY, headSize, headSize);

  // Hair (color-coded)
  ctx.fillStyle = color;
  ctx.fillRect(screenX + (w - headSize) / 2, screenY, headSize, headSize * 0.3);

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(screenX + w * 0.15, screenY + headSize, w * 0.7, h * 0.45);

  // Legs (with walk animation)
  const walkOffset = sprite.isMoving ? Math.sin(sprite.frame * 0.5) * 2 * zoom : 0;
  ctx.fillStyle = '#4a3728';
  ctx.fillRect(screenX + w * 0.2, screenY + headSize + h * 0.45 + walkOffset, w * 0.25, h * 0.2);
  ctx.fillRect(screenX + w * 0.55, screenY + headSize + h * 0.45 - walkOffset, w * 0.25, h * 0.2);

  // Dead indicator
  if (sprite.status === 'dead') {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff0000';
    ctx.font = `${12 * zoom}px sans-serif`;
    ctx.fillText('X', screenX + w / 2 - 4, screenY + h / 2);
    ctx.globalAlpha = 1;
  }

  // Name label
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.max(8, 10 * zoom)}px "M PLUS 1p", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(sprite.name, screenX + w / 2, screenY - 4 * zoom);
  ctx.textAlign = 'start';
}
