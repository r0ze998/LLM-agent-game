import type { ServerWebSocket } from 'bun';
import type { WSClientMessage } from '@murasato/shared';
import { wsManager, type WSData } from '../services/wsManager.ts';
import { tickService } from '../services/tickService.ts';
import { processCommand } from '../engine/commandProcessor.ts';
import { buildWorld4XRef } from '../world/simulation.ts';
import { playerManager } from '../services/playerManager.ts';

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

      case 'player_command': {
        const world = tickService.getWorld(msg.gameId);
        if (world) {
          // F7: Multiplayer ownership check
          const multiplayerEnabled = process.env.MULTIPLAYER_ENABLED === 'true';
          if (multiplayerEnabled && msg.signerAddress) {
            const villageId = (msg.command as any).villageId;
            if (villageId) {
              const vs = world.villageStates4X.get(villageId);
              if (vs?.ownerAddress && vs.ownerAddress.toLowerCase() !== msg.signerAddress.toLowerCase()) {
                wsManager.send(ws, { type: 'error', message: 'Not village owner' });
                break;
              }
            }
          }

          const worldRef = buildWorld4XRef(world);
          const result = processCommand(msg.command, msg.playerId, worldRef);
          wsManager.send(ws, { type: 'command_result', result } as any);

          // Broadcast combat results
          if (result.data?.combatResult) {
            wsManager.broadcastToGame(msg.gameId, { type: 'battle_result', result: result.data.combatResult } as any);
          }

          // Broadcast updated village state
          const vs = world.villageStates4X.get((msg.command as any).villageId);
          if (vs) {
            wsManager.broadcastToGame(msg.gameId, { type: 'village_4x_update', state: vs } as any);
          }
        } else {
          wsManager.send(ws, { type: 'error', message: `Game ${msg.gameId} not found` });
        }
        break;
      }
    }
  } catch (err) {
    console.error('WS message error:', err);
    wsManager.send(ws, { type: 'error', message: 'Invalid message format' });
  }
}
