import { useRef, useEffect, useCallback } from 'react';
import { TILE_SIZE, CHUNK_SIZE } from '@murasato/shared';
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';
import { useViewport } from '../../hooks/useViewport.ts';
import { useAgentFocus } from '../../hooks/useAgentFocus.ts';
import { wsClient } from '../../services/wsClient.ts';
import { drawTilePattern } from './TileRenderer.ts';
import { createAgentSpriteData, updateAgentSpriteData, drawAgent, type AgentSpriteData } from './AgentSprite.ts';
import { drawBuildingFromId } from './BuildingSprite.ts';
import { applyTimeOverlay } from './WeatherEffects.ts';
import { buildTerritoryLookup, buildColorMap, drawTerritoryOverlay, type TerritoryLookup } from './TerritoryRenderer.ts';
import { drawArmy } from './ArmySprite.ts';

interface BattleEffect {
  x: number;
  y: number;
  startTick: number;
  attackerWon: boolean;
}

export function WorldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentSprites = useRef<Map<string, AgentSpriteData>>(new Map());
  const animFrameRef = useRef<number>(0);
  const prevChunks = useRef<string[]>([]);
  const territoryLookupRef = useRef<TerritoryLookup>(new Map());
  const territoryColorMapRef = useRef<Map<string, string>>(new Map());
  const battleEffectsRef = useRef<BattleEffect[]>([]);

  const { viewport, pan, handlers, getVisibleChunks, centerOn } = useViewport();
  const chunks = useGameStore((s) => s.chunks);
  const agents = useGameStore((s) => s.agents);
  const game = useGameStore((s) => s.game);
  const selectedAgentId = useUIStore((s) => s.selectedAgentId);
  const selectAgent = useUIStore((s) => s.selectAgent);
  const selectVillage = useUIStore((s) => s.selectVillage);
  const setViewportUI = useUIStore((s) => s.setViewport);
  const villages = useGameStore((s) => s.villages);
  const village4xStates = useGameStore((s) => s.village4xStates);

  const lastBattleResult = useGameStore((s) => s.lastBattleResult);

  useAgentFocus(centerOn);

  // Rebuild territory lookup when village4xStates change
  const village4xVersionRef = useRef(0);
  useEffect(() => {
    village4xVersionRef.current++;
    territoryLookupRef.current = buildTerritoryLookup(village4xStates);
    territoryColorMapRef.current = buildColorMap(village4xStates);
  }, [village4xStates]);

  // Add battle effects when new battle results arrive
  useEffect(() => {
    if (!lastBattleResult) return;
    battleEffectsRef.current.push({
      x: lastBattleResult.position.x,
      y: lastBattleResult.position.y,
      startTick: Date.now(),
      attackerWon: lastBattleResult.attackerWon,
    });
  }, [lastBattleResult]);

  // Center on first agent when they arrive
  const hasCentered = useRef(false);
  useEffect(() => {
    if (hasCentered.current || agents.size === 0) return;
    const first = agents.values().next().value;
    if (first) {
      centerOn(first.position.x, first.position.y);
      hasCentered.current = true;
    }
  }, [agents, centerOn]);

  // Subscribe to visible chunks
  const subscribeVisibleChunksRef = useRef(() => {});
  subscribeVisibleChunksRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;

    const visibleChunks = getVisibleChunks(canvas.width, canvas.height);
    if (visibleChunks.length === 0) return;
    const keys = visibleChunks.map(c => `${c.cx},${c.cy}`);
    const prevKeys = prevChunks.current;

    const toSubscribe = visibleChunks.filter(c => !prevKeys.includes(`${c.cx},${c.cy}`));
    const toUnsubscribe = prevKeys
      .filter(k => !keys.includes(k))
      .map(k => { const [cx, cy] = k.split(',').map(Number); return { cx, cy }; });

    if (toSubscribe.length > 0) wsClient.subscribeChunks(toSubscribe);
    if (toUnsubscribe.length > 0) wsClient.unsubscribeChunks(toUnsubscribe);

    prevChunks.current = keys;
  };

  useEffect(() => {
    subscribeVisibleChunksRef.current();
    setViewportUI(viewport);
  }, [viewport, getVisibleChunks, setViewportUI]);

  // Re-subscribe when WS reconnects
  useEffect(() => {
    const unsub = wsClient.onConnect(() => {
      prevChunks.current = [];
      // Delay slightly to ensure canvas is sized
      setTimeout(() => subscribeVisibleChunksRef.current(), 100);
    });
    return unsub;
  }, []);

  // Sync agent sprites with state (create/remove only)
  // Smooth interpolation is handled in the render loop below
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  useEffect(() => {
    for (const [id, agent] of agents) {
      if (!agentSprites.current.has(id)) {
        agentSprites.current.set(id, createAgentSpriteData(agent));
      }
    }
    // Remove dead sprites
    for (const id of agentSprites.current.keys()) {
      if (!agents.has(id)) {
        agentSprites.current.delete(id);
      }
    }
  }, [agents]);

  // Click handler to select agents
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const halfW = canvas.width / 2;
    const halfH = canvas.height / 2;
    const worldX = viewport.x + (mouseX - halfW) / viewport.zoom;
    const worldY = viewport.y + (mouseY - halfH) / viewport.zoom;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    // Find agent at this tile
    for (const [id, agent] of agents) {
      if (agent.position.x === tileX && agent.position.y === tileY) {
        selectAgent(id);
        return;
      }
    }

    // Find village territory at this tile
    for (const [id, state4x] of village4xStates) {
      const territory = state4x.territory;
      if (territory.some((t) => t.x === tileX && t.y === tileY)) {
        selectVillage(id);
        selectAgent(null);
        return;
      }
    }

    selectAgent(null);
  }, [viewport, agents, selectAgent, village4xStates, selectVillage]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const render = () => {
      const { width, height } = canvas;
      const { x: camX, y: camY, zoom } = viewport;

      // Pixel-art crisp scaling
      ctx.imageSmoothingEnabled = false;

      // Clear
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);

      ctx.save();

      // Camera transform
      const halfW = width / 2;
      const halfH = height / 2;

      // Draw tiles
      const startTileX = Math.floor((camX - halfW / zoom) / TILE_SIZE);
      const endTileX = Math.ceil((camX + halfW / zoom) / TILE_SIZE);
      const startTileY = Math.floor((camY - halfH / zoom) / TILE_SIZE);
      const endTileY = Math.ceil((camY + halfH / zoom) / TILE_SIZE);

      for (let ty = startTileY; ty <= endTileY; ty++) {
        for (let tx = startTileX; tx <= endTileX; tx++) {
          const cx = Math.floor(tx / CHUNK_SIZE);
          const cy = Math.floor(ty / CHUNK_SIZE);
          const chunk = chunks.get(`${cx},${cy}`);
          if (!chunk) continue;

          const localX = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const localY = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const tile = chunk.tiles[localY]?.[localX];
          if (!tile) continue;

          const screenX = halfW + (tx * TILE_SIZE - camX) * zoom;
          const screenY = halfH + (ty * TILE_SIZE - camY) * zoom;
          const size = Math.ceil(TILE_SIZE * zoom) + 1;

          // FRLG-style tile pattern
          drawTilePattern(ctx, tile, tx, ty, screenX, screenY, size);

          // Draw building on top if this tile has a structure
          if (tile.structureId) {
            drawBuildingFromId(ctx, tile.structureId, screenX, screenY, size);
          }

          // Grid lines at very high zoom
          if (zoom >= 5) {
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(screenX, screenY, size, size);
          }
        }
      }

      // F14: Territory overlay (between tiles and agents)
      drawTerritoryOverlay(
        ctx, territoryLookupRef.current, territoryColorMapRef.current,
        startTileX, endTileX, startTileY, endTileY,
        camX, camY, halfW, halfH, zoom,
      );

      // Update agent sprite interpolation every frame for smooth movement
      for (const [id, sprite] of agentSprites.current) {
        const agent = agentsRef.current.get(id);
        if (agent) updateAgentSpriteData(sprite, agent, 16);
      }

      // Draw agents
      const camOffsetX = camX - halfW / zoom;
      const camOffsetY = camY - halfH / zoom;

      for (const sprite of agentSprites.current.values()) {
        const screenX = halfW + (sprite.x - camX) * zoom;
        const screenY = halfH + (sprite.y - camY) * zoom;

        // Cull if off screen
        if (screenX < -50 || screenX > width + 50 || screenY < -50 || screenY > height + 50) continue;

        drawAgent(ctx, sprite, camX - halfW / zoom, camY - halfH / zoom, zoom, sprite.id === selectedAgentId);
      }

      // F15: Army rendering
      const currentTick = game?.tick ?? 0;
      for (const vs of village4xStates.values()) {
        const color = territoryColorMapRef.current.get(vs.villageId) ?? '#888';
        for (const army of vs.armies) {
          const armyWorldX = army.position.x * TILE_SIZE + TILE_SIZE / 2;
          const armyWorldY = army.position.y * TILE_SIZE + TILE_SIZE / 2;
          const armyScreenX = halfW + (armyWorldX - camX) * zoom;
          const armyScreenY = halfH + (armyWorldY - camY) * zoom;
          // Cull off-screen
          if (armyScreenX < -80 || armyScreenX > width + 80 || armyScreenY < -80 || armyScreenY > height + 80) continue;
          drawArmy(ctx, army, color, camX, camY, halfW, halfH, zoom, currentTick);
        }
      }

      // F16: Battle effects (3-second radial pulse)
      const now = Date.now();
      battleEffectsRef.current = battleEffectsRef.current.filter((eff) => now - eff.startTick < 3000);
      for (const eff of battleEffectsRef.current) {
        const elapsed = (now - eff.startTick) / 3000; // 0..1
        const alpha = 1 - elapsed;
        const radius = (20 + elapsed * 40) * zoom;
        const effScreenX = halfW + (eff.x * TILE_SIZE + TILE_SIZE / 2 - camX) * zoom;
        const effScreenY = halfH + (eff.y * TILE_SIZE + TILE_SIZE / 2 - camY) * zoom;

        ctx.beginPath();
        ctx.arc(effScreenX, effScreenY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = eff.attackerWon
          ? `rgba(255, 215, 0, ${alpha * 0.7})`
          : `rgba(255, 60, 60, ${alpha * 0.7})`;
        ctx.lineWidth = 3 * zoom;
        ctx.stroke();

        // Inner glow
        ctx.beginPath();
        ctx.arc(effScreenX, effScreenY, radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = eff.attackerWon
          ? `rgba(255, 215, 0, ${alpha * 0.15})`
          : `rgba(255, 60, 60, ${alpha * 0.15})`;
        ctx.fill();
      }

      // Time overlay
      if (game) {
        applyTimeOverlay(ctx, width, height, game.tick);
      }

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [viewport, chunks, selectedAgentId, game, village4xStates]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Re-subscribe chunks after canvas gets a real size
      subscribeVisibleChunksRef.current();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Keyboard controls — use pan() directly (not mouse events)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const PAN_SPEED = 32;
      switch (e.key) {
        case 'ArrowUp':
        case 'w': pan(0, PAN_SPEED); break;
        case 'ArrowDown':
        case 's': pan(0, -PAN_SPEED); break;
        case 'ArrowLeft':
        case 'a': pan(PAN_SPEED, 0); break;
        case 'ArrowRight':
        case 'd': pan(-PAN_SPEED, 0); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pan]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', cursor: 'grab', imageRendering: 'pixelated' }}
      onClick={handleClick}
      onMouseDown={handlers.onMouseDown}
      onMouseMove={handlers.onMouseMove}
      onMouseUp={handlers.onMouseUp}
      onMouseLeave={handlers.onMouseUp}
      onWheel={handlers.onWheel}
    />
  );
}
