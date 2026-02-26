import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { gameRouter } from './routes/game.ts';
import { worldRouter } from './routes/world.ts';
import { agentRouter } from './routes/agent.ts';
import { playerRouter } from './routes/player.ts';
import { blueprintRouter } from './routes/blueprint.ts';
import { onOpen, onClose, onMessage } from './handlers/wsHandler.ts';
import { wsManager, type WSData } from './services/wsManager.ts';
import { costTracker } from './agent/llmClient.ts';

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
