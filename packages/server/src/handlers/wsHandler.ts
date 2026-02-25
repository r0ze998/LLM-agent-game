import type { ServerWebSocket } from 'bun';
import type { WSClientMessage } from '@murasato/shared';
import { wsManager, type WSData } from '../services/wsManager.ts';
import { tickService } from '../services/tickService.ts';

export function onOpen(ws: ServerWebSocket<WSData>) {
  wsManager.add(ws);
  console.log(`WS connected (total: ${wsManager.count})`);
}

export function onClose(ws: ServerWebSocket<WSData>) {
  wsManager.remove(ws);
  console.log(`WS disconnected (total: ${wsManager.count})`);
}

export async function onMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
  try {
    const msg: WSClientMessage = JSON.parse(typeof raw === 'string' ? raw : raw.toString());

    switch (msg.type) {
      case 'subscribe_chunks': {
        for (const { cx, cy } of msg.chunks) {
          ws.data.subscribedChunks.add(`${cx},${cy}`);
        }
        // Send initial chunk data
        const gameId = ws.data.gameId;
        if (gameId) {
          const world = tickService.getWorld(gameId);
          if (world) {
            const { getChunk } = await import('../world/map.ts');
            for (const { cx, cy } of msg.chunks) {
              const chunk = getChunk(world.map, cx, cy);
              wsManager.send(ws, { type: 'chunk_update', chunk });
            }
          }
        }
        break;
      }

      case 'unsubscribe_chunks': {
        for (const { cx, cy } of msg.chunks) {
          ws.data.subscribedChunks.delete(`${cx},${cy}`);
        }
        break;
      }

      case 'send_intention': {
        const gameId = ws.data.gameId;
        if (gameId) {
          const world = tickService.getWorld(gameId);
          if (world) {
            world.intentions.push({
              id: `int_${crypto.randomUUID()}`,
              tick: world.tick,
              ...msg.intention,
            });
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('WS message error:', err);
    wsManager.send(ws, { type: 'error', message: 'Invalid message format' });
  }
}
