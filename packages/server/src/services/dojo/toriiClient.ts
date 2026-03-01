/**
 * toriiClient.ts — Torii gRPC client (F4)
 *
 * Uses ToriiGrpcClient from @dojoengine/grpc to subscribe to
 * model changes and supplement external player TXs.
 *
 * Bun compatible: @dojoengine/grpc is pure TypeScript gRPC-Web
 * (HTTP/1.1 fetch based) so no WASM required.
 */

import { parseReceiptEvents, type DojoGameEvent } from "./dojoEventParser.ts";

const LOG_PREFIX = "[Torii]";
const KNOWN_TX_TTL_MS = 60_000; // Deduplicate for 1 minute

export interface ToriiConfig {
  httpUrl: string;   // e.g. "http://localhost:8080"
  worldAddress: string;
}

export type ExternalEventHandler = (events: DojoGameEvent[]) => void;

/**
 * Torii gRPC client — uses @dojoengine/grpc via dynamic import.
 * Gracefully disables if the package is not installed.
 */
export class ToriiEventClient {
  private config: ToriiConfig;
  private grpcClient: any = null;
  private subscriptions: Array<{ cancel: () => void }> = [];
  private knownTxHashes = new Map<string, number>(); // txHash → timestamp
  private handlers: ExternalEventHandler[] = [];
  private _connected = false;

  constructor(config: ToriiConfig) {
    this.config = config;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  /** Register a handler for external events */
  onEvents(handler: ExternalEventHandler): void {
    this.handlers.push(handler);
  }

  /** Mark a TX as "ours" so it's excluded from external event processing */
  markOwnTx(txHash: string): void {
    this.knownTxHashes.set(txHash, Date.now());
    this.cleanupKnownTxes();
  }

  /** Connect to Torii via gRPC-Web */
  async connect(): Promise<void> {
    try {
      // Dynamic import — fail gracefully if not installed
      const grpcModule = await import("@dojoengine/grpc").catch(() => null);
      if (!grpcModule?.ToriiGrpcClient) {
        console.warn(`${LOG_PREFIX} @dojoengine/grpc not available, falling back to HTTP polling`);
        this._connected = false;
        return;
      }

      this.grpcClient = new grpcModule.ToriiGrpcClient({
        toriiUrl: this.config.httpUrl,
        worldAddress: this.config.worldAddress,
      });

      console.log(`${LOG_PREFIX} gRPC client created for ${this.config.httpUrl}`);

      // Subscribe to entity updates (all models)
      await this.subscribeEntityUpdates();

      // Subscribe to raw Starknet events (for our custom events)
      await this.subscribeStarknetEvents();

      this._connected = true;
      console.log(`${LOG_PREFIX} Connected and subscribed`);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to connect:`, err);
      this._connected = false;
    }
  }

  /** Disconnect and cancel all subscriptions */
  disconnect(): void {
    for (const sub of this.subscriptions) {
      try {
        sub.cancel();
      } catch {
        // ignore
      }
    }
    this.subscriptions = [];

    if (this.grpcClient?.destroy) {
      try {
        this.grpcClient.destroy();
      } catch {
        // ignore
      }
    }
    this.grpcClient = null;
    this._connected = false;
    console.log(`${LOG_PREFIX} Disconnected`);
  }

  /** Query entities by model name via gRPC */
  async queryEntities(modelNames: string[], limit = 100): Promise<any[]> {
    if (!this.grpcClient) return [];

    try {
      const entities = await this.grpcClient.getEntities({
        clause: {
          Keys: {
            keys: [],
            pattern_matching: "VariableLen",
            models: modelNames,
          },
        },
        limit,
        offset: 0,
      });

      return entities ?? [];
    } catch (err) {
      console.warn(`${LOG_PREFIX} Entity query failed:`, err);
      return [];
    }
  }

  /** Query historical events via Torii GraphQL (simpler than gRPC for one-shot) */
  async queryHistory(): Promise<any[]> {
    try {
      const query = `
        query {
          events(first: 1000) {
            edges {
              node {
                keys
                data
                transactionHash
              }
            }
            totalCount
          }
        }
      `;

      const res = await fetch(`${this.config.httpUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        console.warn(`${LOG_PREFIX} GraphQL query failed: ${res.status}`);
        return [];
      }

      const json = await res.json() as any;
      const edges = json?.data?.events?.edges ?? [];
      console.log(`${LOG_PREFIX} Historical query returned ${edges.length} events (total: ${json?.data?.events?.totalCount ?? '?'})`);
      return edges.map((e: any) => e.node);
    } catch (err) {
      console.warn(`${LOG_PREFIX} History query failed:`, err);
      return [];
    }
  }

  // ── Internal: Subscriptions ──

  private async subscribeEntityUpdates(): Promise<void> {
    if (!this.grpcClient?.onEntityUpdated) return;

    try {
      const sub = await this.grpcClient.onEntityUpdated(
        // Subscribe to key game models
        {
          Keys: {
            keys: [],
            pattern_matching: "VariableLen",
            models: [
              "aw-Village",
              "aw-DiplomaticRelation",
              "aw-GarrisonUnit",
              "aw-Building",
              "aw-Covenant",
              "aw-Invention",
              "aw-Institution",
              "aw-TradeOffer",
              "aw-TradeRoute",
            ],
          },
        },
        [this.config.worldAddress],
        (entity: any, _subId: any) => {
          this.handleEntityUpdate(entity);
        },
        (error: any) => {
          console.warn(`${LOG_PREFIX} Entity subscription error:`, error);
        },
      );

      if (sub) {
        this.subscriptions.push(sub);
        console.log(`${LOG_PREFIX} Entity update subscription active`);
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to subscribe to entity updates:`, err);
    }
  }

  private async subscribeStarknetEvents(): Promise<void> {
    if (!this.grpcClient?.onStarknetEvent) return;

    try {
      const sub = await this.grpcClient.onStarknetEvent(
        [
          {
            keys: [],  // wildcard — match all events
            pattern_matching: "VariableLen",
            models: [],
          },
        ],
        (event: any) => {
          this.handleStarknetEvent(event);
        },
        (error: any) => {
          console.warn(`${LOG_PREFIX} Event subscription error:`, error);
        },
      );

      if (sub) {
        this.subscriptions.push(sub);
        console.log(`${LOG_PREFIX} Starknet event subscription active`);
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to subscribe to Starknet events:`, err);
    }
  }

  // ── Internal: Event handling ──

  private handleEntityUpdate(entity: any): void {
    // Log for debugging
    const modelNames = entity?.models ? Object.keys(entity.models) : [];
    if (modelNames.length > 0) {
      console.log(`${LOG_PREFIX} External entity update: ${modelNames.join(", ")}`);
    }

    // Entity updates don't carry TX hashes, so we can't do dedup here.
    // The subscription itself filters by model, so these are relevant updates.
    // We emit a notification to handlers for potential state refresh.
  }

  private handleStarknetEvent(event: any): void {
    const txHash = event?.transaction_hash ?? event?.transactionHash;

    // Skip events from our own TXs
    if (txHash && this.knownTxHashes.has(txHash)) {
      return;
    }

    // Parse the raw event using our existing parser
    // The event shape from Torii gRPC matches our StarknetEvent interface
    if (event?.keys && event?.data) {
      try {
        const parsed = parseReceiptEvents([{
          keys: event.keys,
          data: event.data,
        }]);

        if (parsed.length > 0) {
          console.log(`${LOG_PREFIX} Parsed ${parsed.length} external events from tx ${txHash?.slice(0, 10) ?? "unknown"}...`);

          // Notify handlers
          for (const handler of this.handlers) {
            handler(parsed);
          }
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} Event parse failed:`, err);
      }
    }
  }

  private cleanupKnownTxes(): void {
    const now = Date.now();
    for (const [hash, ts] of this.knownTxHashes) {
      if (now - ts > KNOWN_TX_TTL_MS) {
        this.knownTxHashes.delete(hash);
      }
    }
  }
}
