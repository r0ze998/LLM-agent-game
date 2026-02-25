import { Hono } from 'hono';
import type { ApiResponse, AgentState } from '@murasato/shared';
import { tickService } from '../services/tickService.ts';

export const agentRouter = new Hono();

// Get all agents
agentRouter.get('/:gameId', (c) => {
  const gameId = c.req.param('gameId');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const includeDeadParam = c.req.query('includeDead');
  const includeDead = includeDeadParam === 'true';
  const agents = [...world.agents.values()].filter(a => includeDead || a.identity.status !== 'dead');

  return c.json<ApiResponse<AgentState[]>>({ ok: true, data: agents });
});

// Get single agent
agentRouter.get('/:gameId/:agentId', (c) => {
  const gameId = c.req.param('gameId');
  const agentId = c.req.param('agentId');

  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const agent = world.agents.get(agentId);
  if (!agent) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Agent not found' }, 404);
  }

  return c.json<ApiResponse<AgentState>>({ ok: true, data: agent });
});

// Get agent relationships
agentRouter.get('/:gameId/:agentId/relationships', (c) => {
  const gameId = c.req.param('gameId');
  const agentId = c.req.param('agentId');

  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const rels = world.relationships.get(agentId) ?? [];
  return c.json<ApiResponse<typeof rels>>({ ok: true, data: rels });
});
