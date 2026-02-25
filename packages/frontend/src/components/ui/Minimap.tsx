import { useRef, useEffect } from 'react';
import { MAP_SIZE, TILE_SIZE } from '@murasato/shared';
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';

const MINIMAP_SIZE = 140;
const SCALE = MINIMAP_SIZE / MAP_SIZE;

const TERRAIN_MINI_COLORS: Record<string, string> = {
  plains: '#5a9a3a',
  forest: '#2a5a2a',
  mountain: '#7a6a50',
  water: '#2a5ab0',
  desert: '#b09a60',
  swamp: '#4a5a3a',
};

export function Minimap() {
  const show = useUIStore((s) => s.showMinimap);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chunks = useGameStore((s) => s.chunks);
  const agents = useGameStore((s) => s.agents);

  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Draw terrain from chunks
    for (const chunk of chunks.values()) {
      for (let dy = 0; dy < chunk.tiles.length; dy++) {
        for (let dx = 0; dx < chunk.tiles[dy].length; dx++) {
          const tile = chunk.tiles[dy][dx];
          const worldX = chunk.cx * 16 + dx;
          const worldY = chunk.cy * 16 + dy;
          ctx.fillStyle = TERRAIN_MINI_COLORS[tile.terrain] ?? '#333';
          ctx.fillRect(worldX * SCALE, worldY * SCALE, Math.max(1, SCALE), Math.max(1, SCALE));
        }
      }
    }

    // Draw agents as dots
    for (const agent of agents.values()) {
      if (agent.identity.status === 'dead') continue;
      ctx.fillStyle = '#ff0';
      ctx.fillRect(agent.position.x * SCALE - 1, agent.position.y * SCALE - 1, 3, 3);
    }
  }, [show, chunks, agents]);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      zIndex: 60,
    }}>
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        style={{
          border: '2px solid #4a6fa5',
          borderRadius: 4,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
