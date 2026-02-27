import { Hono } from 'hono';
import type { GameConfig, ApiResponse, GameState, WorldStats, SaveData, GameEventType } from '@murasato/shared';
import { INITIAL_AGENTS, MAP_SIZE, MAX_AGENTS, DEFAULT_TICK_INTERVAL_MS, TICKS_PER_YEAR } from '@murasato/shared';
import { tickService } from '../services/tickService.ts';
import { eventStore } from '../services/eventStore.ts';
import { saveToFile, loadFromFile, listSaves } from '../services/saveService.ts';
import { computeWorldStats } from '../services/statsService.ts';
import { generateChronicle, generateBiography } from '../player/chronicle.ts';

export const gameRouter = new Hono();

// List active games (must be before /:id routes)
gameRouter.get('/list/active', (c) => {
  const games = tickService.listGames();
  return c.json<ApiResponse<typeof games>>({ ok: true, data: games });
});

// Create a new game
gameRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const gameId = `game_${crypto.randomUUID()}`;

  const config: GameConfig = {
    seed: body.seed ?? Math.floor(Math.random() * 1000000),
    mapSize: body.mapSize ?? MAP_SIZE,
    initialAgents: body.initialAgents ?? INITIAL_AGENTS,
    maxAgents: body.maxAgents ?? MAX_AGENTS,
    tickIntervalMs: body.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS,
  };

  const world = tickService.createGame(gameId, config);

  const state: GameState = {
    id: gameId,
    status: 'created',
    tick: world.tick,
    config,
    dayOfYear: 0,
    year: 1,
  };

  return c.json<ApiResponse<GameState>>({ ok: true, data: state });
});

// Get game state
gameRouter.get('/:id', (c) => {
  const gameId = c.req.param('id');
  const world = tickService.getWorld(gameId);
  if (!world) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);
  }

  const state: GameState = {
    id: gameId,
    status: tickService.isRunning(gameId) ? 'running' : 'paused',
    tick: world.tick,
    config: { seed: world.map.seed, mapSize: world.map.size, initialAgents: 0, maxAgents: MAX_AGENTS, tickIntervalMs: DEFAULT_TICK_INTERVAL_MS },
    dayOfYear: world.tick % (TICKS_PER_YEAR),
    year: Math.floor(world.tick / TICKS_PER_YEAR) + 1,
  };

  return c.json<ApiResponse<GameState>>({ ok: true, data: state });
});

// Start simulation
gameRouter.post('/:id/start', (c) => {
  const gameId = c.req.param('id');
  const speed = Number(c.req.query('speed') ?? '1');
  const ok = tickService.start(gameId, speed);
  if (!ok) {
    return c.json<ApiResponse<never>>({ ok: false, error: 'Cannot start game' }, 400);
  }
  return c.json<ApiResponse<{ status: string }>>({ ok: true, data: { status: 'running' } });
});

// Pause simulation
gameRouter.post('/:id/pause', (c) => {
  const gameId = c.req.param('id');
  tickService.pause(gameId);
  return c.json<ApiResponse<{ status: string }>>({ ok: true, data: { status: 'paused' } });
});

// Set speed
gameRouter.post('/:id/speed', async (c) => {
  const gameId = c.req.param('id');
  const { speed } = await c.req.json<{ speed: number }>();
  tickService.setSpeed(gameId, speed);
  return c.json<ApiResponse<{ speed: number }>>({ ok: true, data: { speed } });
});

// Save game
gameRouter.post('/:id/save', async (c) => {
  const gameId = c.req.param('id');
  const world = tickService.getWorld(gameId);
  if (!world) return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);

  const gameState: GameState = {
    id: gameId,
    status: tickService.isRunning(gameId) ? 'running' : 'paused',
    tick: world.tick,
    config: { seed: world.map.seed, mapSize: world.map.size, initialAgents: 0, maxAgents: MAX_AGENTS, tickIntervalMs: DEFAULT_TICK_INTERVAL_MS },
    dayOfYear: world.tick % TICKS_PER_YEAR,
    year: Math.floor(world.tick / TICKS_PER_YEAR) + 1,
  };

  const filename = await saveToFile(gameId, world, gameState);
  return c.json<ApiResponse<{ filename: string }>>({ ok: true, data: { filename } });
});

// Load game
gameRouter.post('/load', async (c) => {
  const { filename } = await c.req.json<{ filename: string }>();
  const world = await loadFromFile(filename);
  const gameId = world.gameId;
  // Register the loaded world with tickService
  (tickService as any).worlds?.set(gameId, world);
  return c.json<ApiResponse<{ gameId: string; tick: number }>>({ ok: true, data: { gameId, tick: world.tick } });
});

// List saves
gameRouter.get('/saves/list', async (c) => {
  const gameId = c.req.query('gameId');
  const saves = await listSaves(gameId ?? undefined);
  return c.json<ApiResponse<string[]>>({ ok: true, data: saves });
});

// Get world stats
gameRouter.get('/:id/stats', (c) => {
  const gameId = c.req.param('id');
  const world = tickService.getWorld(gameId);
  if (!world) return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);

  const stats = computeWorldStats(world);
  return c.json<ApiResponse<WorldStats>>({ ok: true, data: stats });
});

// Generate chronicle
gameRouter.get('/:id/chronicle', async (c) => {
  const gameId = c.req.param('id');
  const world = tickService.getWorld(gameId);
  if (!world) return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);

  const villages = [...world.villages.values()];
  const events = eventStore.getAll(gameId);
  const chronicle = await generateChronicle(events, villages, world.tick);
  return c.json<ApiResponse<{ chronicle: string }>>({ ok: true, data: { chronicle } });
});

// --- Event history APIs ---

// Get events (paginated, filterable)
gameRouter.get('/:id/events', (c) => {
  const gameId = c.req.param('id');
  const world = tickService.getWorld(gameId);
  if (!world) return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);

  const typeParam = c.req.query('type');
  const agentId = c.req.query('agentId');
  const fromTick = Number(c.req.query('from') ?? '0');
  const toTick = Number(c.req.query('to') ?? String(Number.MAX_SAFE_INTEGER));
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 500);
  const offset = Number(c.req.query('offset') ?? '0');

  let events = eventStore.getAll(gameId);

  if (typeParam) {
    const types = typeParam.split(',') as GameEventType[];
    events = events.filter(e => types.includes(e.type));
  }
  if (agentId) {
    events = events.filter(e => e.actorIds.includes(agentId));
  }
  events = events.filter(e => e.tick >= fromTick && e.tick <= toTick);

  const total = events.length;
  const page = events.slice(offset, offset + limit);

  return c.json<ApiResponse<{ events: typeof page; total: number; offset: number; limit: number }>>({
    ok: true,
    data: { events: page, total, offset, limit },
  });
});

// Event summary (counts by type)
gameRouter.get('/:id/events/summary', (c) => {
  const gameId = c.req.param('id');
  const world = tickService.getWorld(gameId);
  if (!world) return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);

  const events = eventStore.getAll(gameId);
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }

  return c.json<ApiResponse<{ total: number; byType: typeof counts }>>({
    ok: true,
    data: { total: events.length, byType: counts },
  });
});

// Sync status (F5 debug API)
gameRouter.get('/:id/sync-status', (c) => {
  const gameId = c.req.param('id');
  const world = tickService.getWorld(gameId);
  if (!world) return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);

  const bridge = (world as any).dojoBridge;
  if (!bridge || typeof bridge.getSyncReports !== 'function') {
    return c.json<ApiResponse<{ reports: never[]; latency: null }>>({
      ok: true,
      data: { reports: [], latency: null },
    });
  }

  const reports = bridge.getSyncReports();
  const latency = typeof bridge.getLatencyMetrics === 'function' ? bridge.getLatencyMetrics() : null;

  return c.json<ApiResponse<{ reports: typeof reports; latency: typeof latency }>>({
    ok: true,
    data: { reports, latency },
  });
});

// Agent biography
gameRouter.get('/:id/agent/:agentId/biography', async (c) => {
  const gameId = c.req.param('id');
  const agentId = c.req.param('agentId');
  const world = tickService.getWorld(gameId);
  if (!world) return c.json<ApiResponse<never>>({ ok: false, error: 'Game not found' }, 404);

  const agent = world.agents.get(agentId);
  if (!agent) return c.json<ApiResponse<never>>({ ok: false, error: 'Agent not found' }, 404);

  const events = eventStore.getByAgent(gameId, agentId);
  const biography = await generateBiography(agent, events);

  return c.json<ApiResponse<{ biography: string }>>({ ok: true, data: { biography } });
});
