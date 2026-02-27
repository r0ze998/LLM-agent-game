import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { gameRouter } from './routes/game.ts';
import { worldRouter } from './routes/world.ts';
import { agentRouter } from './routes/agent.ts';
import { playerRouter } from './routes/player.ts';
import { blueprintRouter } from './routes/blueprint.ts';
import { strategyRouter } from './routes/strategy.ts';
import { onOpen, onClose, onMessage } from './handlers/wsHandler.ts';
import { wsManager, type WSData } from './services/wsManager.ts';
import { costTracker } from './agent/llmClient.ts';
import { tickService } from './services/tickService.ts';
import { saveToFile } from './services/saveService.ts';
import { INITIAL_AGENTS, MAP_SIZE, MAX_AGENTS, DEFAULT_TICK_INTERVAL_MS, TICKS_PER_YEAR } from '@murasato/shared';
import { loadDojoConfig } from './services/dojo/dojoConfig.ts';
import { DojoBridge } from './services/dojo/dojoBridge.ts';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

// --- Hono app ---

const app = new Hono();

app.use('*', cors({
  origin: CORS_ORIGIN,
  credentials: true,
}));
app.use('*', logger());

// Health check
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    connections: wsManager.count,
    llmCost: costTracker.estimatedCostUSD.toFixed(4),
    llmRequests: costTracker.requests,
  }),
);

// API routes
const v1 = new Hono();
v1.route('/game', gameRouter);
v1.route('/world', worldRouter);
v1.route('/agent', agentRouter);
v1.route('/player', playerRouter);
v1.route('/blueprint', blueprintRouter);
v1.route('/strategy', strategyRouter);
app.route('/api/v1', v1);

// --- Bun.serve with WebSocket ---

const server = Bun.serve<WSData>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      const gameId = url.searchParams.get('gameId');
      const upgraded = server.upgrade(req, {
        data: {
          gameId,
          subscribedChunks: new Set<string>(),
        },
      });
      if (upgraded) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    return app.fetch(req);
  },

  websocket: {
    open: (ws) => onOpen(ws),
    message: (ws, msg) => { onMessage(ws, msg).catch(console.error); },
    close: (ws) => onClose(ws),
  },
});

console.log(`🏘️  村里 server running on http://localhost:${server.port}`);

// --- Dojo on-chain bridge initialization ---

const dojoConfig = loadDojoConfig();
if (dojoConfig.enabled) {
  const dojoBridge = new DojoBridge(dojoConfig);
  tickService.setDojoBridge(dojoBridge);
  dojoBridge.initialize().then(async () => {
    console.log('⛓️  Dojo bridge initialized and ready');

    // fullSync: 既存村のオンチェーン状態を同期
    const mapperEntries = dojoBridge.getVillageMapperEntries();
    if (mapperEntries.length > 0) {
      console.log(`⛓️  Found ${mapperEntries.length} persisted village mappings, running fullSync...`);
      // Collect all active village states from running games
      for (const [gameId, world] of tickService.getAllWorlds()) {
        await dojoBridge.fullSync(world.villageStates4X);
      }
      console.log('⛓️  fullSync completed');
    }
  }).catch((err) => {
    console.warn('⛓️  Dojo bridge initialization failed (will retry on use):', err);
  });
} else {
  console.log('⛓️  Dojo bridge disabled (set DOJO_ENABLED=true to enable)');
}

// --- Headless auto-start ---

if (process.env.HEADLESS === 'true') {
  const speed = Number(process.env.HEADLESS_SPEED ?? '4');
  const seed = process.env.HEADLESS_SEED
    ? Number(process.env.HEADLESS_SEED)
    : Math.floor(Math.random() * 1_000_000);
  const autosaveInterval = Number(process.env.HEADLESS_AUTOSAVE_INTERVAL ?? '500');

  const gameId = `headless_${crypto.randomUUID()}`;
  const config = {
    seed,
    mapSize: MAP_SIZE,
    initialAgents: INITIAL_AGENTS,
    maxAgents: MAX_AGENTS,
    tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
  };

  const world = tickService.createGame(gameId, config);
  tickService.start(gameId, speed);

  console.log(`🤖 Headless mode active`);
  console.log(`   Game ID : ${gameId}`);
  console.log(`   Seed    : ${seed}`);
  console.log(`   Speed   : ${speed}x`);
  console.log(`   API     : http://localhost:${server.port}/api/v1/game/${gameId}`);
  console.log(`   WS      : ws://localhost:${server.port}/ws?gameId=${gameId}`);
  console.log(`   Autosave: every ${autosaveInterval} ticks`);

  // Periodic autosave
  let lastSaveTick = 0;
  setInterval(async () => {
    const w = tickService.getWorld(gameId);
    if (!w || w.tick - lastSaveTick < autosaveInterval) return;
    lastSaveTick = w.tick;
    try {
      const gameState = {
        id: gameId,
        status: 'running' as const,
        tick: w.tick,
        config,
        dayOfYear: w.tick % TICKS_PER_YEAR,
        year: Math.floor(w.tick / TICKS_PER_YEAR) + 1,
      };
      const filename = await saveToFile(gameId, w, gameState);
      console.log(`💾 Autosaved: ${filename} (tick ${w.tick})`);
    } catch (err) {
      console.error('Autosave failed:', err);
    }
  }, 30_000);
}
