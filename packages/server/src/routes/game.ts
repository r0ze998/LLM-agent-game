import { Hono } from 'hono';
import type { GameConfig, ApiResponse, GameState, WorldStats, SaveData } from '@murasato/shared';
import { INITIAL_AGENTS, MAP_SIZE, MAX_AGENTS, DEFAULT_TICK_INTERVAL_MS, TICKS_PER_YEAR } from '@murasato/shared';
import { tickService } from '../services/tickService.ts';
import { saveToFile, loadFromFile, listSaves } from '../services/saveService.ts';
import { computeWorldStats } from '../services/statsService.ts';
import { generateChronicle } from '../player/chronicle.ts';

export const gameRouter = new Hono();

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
  // Collect events from the game store (in-memory for now)
  const chronicle = await generateChronicle([], villages, world.tick);
  return c.json<ApiResponse<{ chronicle: string }>>({ ok: true, data: { chronicle } });
});
