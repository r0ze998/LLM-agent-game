import type { WSClientMessage, WSServerMessage } from '@murasato/shared';

type MessageHandler = (msg: WSServerMessage) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private gameId: string | null = null;

  connect(gameId: string) {
    this.gameId = gameId;
    this.disconnect();

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws?gameId=${gameId}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WS connected');
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
  }

  send(msg: WSClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeChunks(chunks: { cx: number; cy: number }[]) {
    this.send({ type: 'subscribe_chunks', chunks });
  }

  unsubscribeChunks(chunks: { cx: number; cy: number }[]) {
    this.send({ type: 'unsubscribe_chunks', chunks });
  }
}

export const wsClient = new WSClient();
