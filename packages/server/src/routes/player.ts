import { Hono } from 'hono';
import type { ApiResponse, PlayerIntention, IntentionType, IntentionStrength } from '@murasato/shared';
import { tickService } from '../services/tickService.ts';

export const playerRouter = new Hono();

// Send intention (天の声)
playerRouter.post('/:gameId/intention', async (c) => {
  const gameId = c.req.param('gameId');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const body = await c.req.json<{
    type: IntentionType;
    targetType: 'agent' | 'village' | 'world';
    targetId?: string;
    message: string;
    strength: IntentionStrength;
    durationTicks?: number;
  }>();

  const intention: PlayerIntention = {
    id: `int_${crypto.randomUUID()}`,
    type: body.type,
    target: { type: body.targetType, id: body.targetId },
    message: body.message,
    strength: body.strength,
    tick: world.tick,
    expiresAtTick: world.tick + (body.durationTicks ?? 48), // default 2 in-game days
  };

  world.intentions.push(intention);

  return c.json<ApiResponse<PlayerIntention>>({ ok: true, data: intention });
});

// Get active intentions
playerRouter.get('/:gameId/intentions', (c) => {
  const gameId = c.req.param('gameId');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const active = world.intentions.filter(i => i.expiresAtTick > world.tick);
  return c.json<ApiResponse<PlayerIntention[]>>({ ok: true, data: active });
});
