import type { WSClientMessage, WSServerMessage, PlayerCommand } from '@murasato/shared';

type MessageHandler = (msg: WSServerMessage) => void;
type ConnectionHandler = () => void;

class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private gameId: string | null = null;
  private pendingMessages: WSClientMessage[] = [];

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(gameId: string) {
    this.gameId = gameId;
    this.disconnect();

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws?gameId=${gameId}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WS connected');
      // Flush any pending messages
      for (const msg of this.pendingMessages) {
        this.ws!.send(JSON.stringify(msg));
      }
      this.pendingMessages = [];
      // Notify connection handlers
      for (const handler of this.connectionHandlers) {
        handler();
      }
    };

    this.ws.onmessage = (e) => {
      try {
        const msg: WSServerMessage = JSON.parse(e.data);
        for (const handler of this.handlers) {
          handler(msg);
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('WS disconnected');
      // Auto-reconnect after 2s
      this.reconnectTimer = setTimeout(() => {
        if (this.gameId) this.connect(this.gameId);
      }, 2000);
    };

    this.ws.onerror = (err) => {
      console.error('WS error:', err);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingMessages = [];
  }

  send(msg: WSClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      // Queue for when connection opens
      this.pendingMessages.push(msg);
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  subscribeChunks(chunks: { cx: number; cy: number }[]) {
    this.send({ type: 'subscribe_chunks', chunks });
  }

  unsubscribeChunks(chunks: { cx: number; cy: number }[]) {
    this.send({ type: 'unsubscribe_chunks', chunks });
  }

  sendCommand(playerId: string, command: PlayerCommand, signerAddress?: string) {
    if (!this.gameId) return;
    this.send({ type: 'player_command', gameId: this.gameId, playerId, command, signerAddress });
  }
}

export const wsClient = new WSClient();
