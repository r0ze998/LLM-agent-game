import { Hono } from 'hono';
import type { ApiResponse, Chunk, Village } from '@murasato/shared';
import { tickService } from '../services/tickService.ts';
import { getChunk, getChunkCount } from '../world/map.ts';

export const worldRouter = new Hono();

// Get chunk data
worldRouter.get('/:gameId/chunk/:cx/:cy', (c) => {
  const gameId = c.req.param('gameId');
  const cx = Number(c.req.param('cx'));
  const cy = Number(c.req.param('cy'));

  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const chunk = getChunk(world.map, cx, cy);
  return c.json<ApiResponse<Chunk>>({ ok: true, data: chunk });
});

// Get map metadata
worldRouter.get('/:gameId/meta', (c) => {
  const gameId = c.req.param('gameId');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  return c.json<ApiResponse<{ size: number; chunkCount: number; seed: number }>>({
    ok: true,
    data: {
      size: world.map.size,
      chunkCount: getChunkCount(world.map.size),
      seed: world.map.seed,
    },
  });
});

// Get all villages
worldRouter.get('/:gameId/villages', (c) => {
  const gameId = c.req.param('gameId');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const villages = [...world.villages.values()];
  return c.json<ApiResponse<Village[]>>({ ok: true, data: villages });
});
