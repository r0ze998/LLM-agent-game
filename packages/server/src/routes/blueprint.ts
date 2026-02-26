import { Hono } from 'hono';
import type { ApiResponse, AgentBlueprint, AgentState, DeployedBlueprintMeta } from '@murasato/shared';
import { MAX_AGENTS } from '@murasato/shared';
import { tickService } from '../services/tickService.ts';
import { createBlueprintAgent } from '../agent/lifecycle.ts';
import { findSpawnPositions } from '../world/map.ts';

export const blueprintRouter = new Hono();

// POST /:gameId/deploy — Deploy a blueprint agent
blueprintRouter.post('/:gameId/deploy', async (c) => {
  const gameId = c.req.param('gameId');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const body = await c.req.json<AgentBlueprint>();

  // Validate soul
  if (!body.soul || body.soul.trim().length < 10) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'soul は10文字以上必要です' }, 400);
  }

  // Population cap check
  if (world.livingAgents.length >= MAX_AGENTS) {
    return c.json<ApiResponse<never>>({ ok: false, error: `人口上限（${MAX_AGENTS}）に達しています` }, 400);
  }

  // Determine spawn position
  const spawnPos = body.spawnPosition ?? findSpawnPositions(world.map, 1)[0];

  try {
    const { agent, meta } = await createBlueprintAgent(gameId, body, spawnPos, world.tick);
    world.agents.set(agent.identity.id, agent);
    world.blueprints.set(meta.blueprintId, meta);

    return c.json<ApiResponse<{ agent: AgentState; meta: DeployedBlueprintMeta }>>({
      ok: true,
      data: { agent, meta },
    });
  } catch (err) {
    console.error('Blueprint deploy error:', err);
    return c.json<ApiResponse<never>>({ ok: false, error: 'ブループリントのデプロイに失敗しました' }, 500);
  }
});

// GET /:gameId — List deployed blueprints
blueprintRouter.get('/:gameId', (c) => {
  const gameId = c.req.param('gameId');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  return c.json<ApiResponse<DeployedBlueprintMeta[]>>({
    ok: true,
    data: [...world.blueprints.values()],
  });
});

// GET /:gameId/:blueprintId — Get blueprint detail + current agent state
blueprintRouter.get('/:gameId/:blueprintId', (c) => {
  const gameId = c.req.param('gameId');
  const blueprintId = c.req.param('blueprintId');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const meta = world.blueprints.get(blueprintId);
  if (!meta) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Blueprint not found' }, 404);
  }

  const agent = world.agents.get(meta.agentId) ?? null;

  return c.json<ApiResponse<{ meta: DeployedBlueprintMeta; agent: AgentState | null }>>({
    ok: true,
    data: { meta, agent },
  });
});

// DELETE /:gameId/:blueprintId — Recall (remove) a blueprint agent
blueprintRouter.delete('/:gameId/:blueprintId', (c) => {
  const gameId = c.req.param('gameId');
  const blueprintId = c.req.param('blueprintId');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const meta = world.blueprints.get(blueprintId);
  if (!meta) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Blueprint not found' }, 404);
  }

  // Remove agent from world
  const agent = world.agents.get(meta.agentId);
  if (agent) {
    // Remove from village if member
    if (agent.villageId) {
      const village = world.villages.get(agent.villageId);
      if (village) {
        village.population = village.population.filter(id => id !== agent.identity.id);
      }
    }
    // Mark as dead (keeps history) then remove
    agent.identity.status = 'dead';
    world.agents.delete(meta.agentId);
    // Clean up relationships
    world.relationships.delete(meta.agentId);
  }

  // Remove blueprint record
  world.blueprints.delete(blueprintId);

  return c.json<ApiResponse<{ recalled: true; agentName: string }>>({
    ok: true,
    data: { recalled: true, agentName: agent?.identity.name ?? '不明' },
  });
});
