import type { ServerWebSocket } from 'bun';
import type { WSServerMessage } from '@murasato/shared';

export interface WSData {
  gameId: string | null;
  subscribedChunks: Set<string>; // "cx,cy"
}

class WSManager {
  private connections = new Set<ServerWebSocket<WSData>>();

  add(ws: ServerWebSocket<WSData>) {
    this.connections.add(ws);
  }

  remove(ws: ServerWebSocket<WSData>) {
    this.connections.delete(ws);
  }

  get count(): number {
    return this.connections.size;
  }

  // Send to all connections subscribed to a game
  broadcastToGame(gameId: string, message: WSServerMessage) {
    const data = JSON.stringify(message);
    for (const ws of this.connections) {
      if (ws.data.gameId === gameId) {
        ws.send(data);
      }
    }
  }

  // Send to connections subscribed to specific chunks
  broadcastChunkUpdate(gameId: string, chunkKey: string, message: WSServerMessage) {
    const data = JSON.stringify(message);
    for (const ws of this.connections) {
      if (ws.data.gameId === gameId && ws.data.subscribedChunks.has(chunkKey)) {
        ws.send(data);
      }
    }
  }

  // Send to a specific connection
  send(ws: ServerWebSocket<WSData>, message: WSServerMessage) {
    ws.send(JSON.stringify(message));
  }
}

export const wsManager = new WSManager();
