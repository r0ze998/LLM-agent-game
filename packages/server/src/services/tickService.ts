import type { GameConfig } from '@murasato/shared';
import { TICKS_PER_DAY, TICKS_PER_YEAR, DEFAULT_TICK_INTERVAL_MS } from '@murasato/shared';
import { tick, createWorldState, type WorldState } from '../world/simulation.ts';
import { generateMap, findSpawnPositions, getChunk } from '../world/map.ts';
import { createGenesisAgent } from '../agent/lifecycle.ts';
import { wsManager } from './wsManager.ts';
import { computeWorldStats } from './statsService.ts';
import { eventStore } from './eventStore.ts';
import type { DojoBridge } from './dojo/dojoBridge.ts';

class TickService {
  private worlds = new Map<string, WorldState>();
  private timers = new Map<string, ReturnType<typeof setInterval | typeof setTimeout>>();
  private speeds = new Map<string, number>(); // multiplier
  private ticking = new Set<string>(); // prevent overlapping ticks
  private _dojoBridge?: DojoBridge;
  private tickCounts = new Map<string, number>(); // for periodic logging

  /** Set the DojoBridge (called from index.ts at startup) */
  setDojoBridge(bridge: DojoBridge): void {
    this._dojoBridge = bridge;
  }

  getWorld(gameId: string): WorldState | undefined {
    return this.worlds.get(gameId);
  }

  /** Return all worlds (used for fullSync, etc.) */
  getAllWorlds(): Map<string, WorldState> {
    return this.worlds;
  }

  createGame(gameId: string, config: GameConfig, dojoBridge?: DojoBridge): WorldState {
    const bridge = dojoBridge ?? this._dojoBridge;
    const map = generateMap(config.seed, config.mapSize);
    const world = createWorldState(gameId, map, bridge);

    // Spawn initial agents
    const spawnPositions = findSpawnPositions(map, config.initialAgents);
    for (let i = 0; i < config.initialAgents; i++) {
      const pos = spawnPositions[i] ?? { x: Math.floor(config.mapSize / 2), y: Math.floor(config.mapSize / 2) };
      const agent = createGenesisAgent(i, pos.x, pos.y);
      world.agents.set(agent.identity.id, agent);
    }

    this.worlds.set(gameId, world);
    return world;
  }

  start(gameId: string, speedMultiplier: number = 1): boolean {
    const world = this.worlds.get(gameId);
    if (!world) return false;
    if (this.timers.has(gameId)) return false; // Already running

    this.speeds.set(gameId, speedMultiplier);
    this.tickCounts.set(gameId, 0);
    const baseInterval = DEFAULT_TICK_INTERVAL_MS / speedMultiplier;
    const adaptiveEnabled = process.env.ADAPTIVE_TICK_ENABLED === 'true';

    const runTick = async () => {
      // Prevent overlapping ticks when LLM calls are slow
      if (this.ticking.has(gameId)) {
        if (adaptiveEnabled) {
          const timer = setTimeout(runTick, baseInterval);
          this.timers.set(gameId, timer);
        }
        return;
      }
      this.ticking.add(gameId);
      try {
        const result = await tick(world);
        const tickNum = (this.tickCounts.get(gameId) ?? 0) + 1;
        this.tickCounts.set(gameId, tickNum);

        // Accumulate events in store
        eventStore.push(gameId, result.events);

        // Broadcast tick
        const dayOfYear = result.tick % TICKS_PER_YEAR;
        const year = Math.floor(result.tick / TICKS_PER_YEAR) + 1;
        wsManager.broadcastToGame(gameId, {
          type: 'tick',
          tick: result.tick,
          dayOfYear: dayOfYear % (TICKS_PER_DAY * 30), // day within month
          year,
        });

        // Broadcast agent updates
        const agents = [...world.agents.values()].filter(a => a.identity.status !== 'dead');
        wsManager.broadcastToGame(gameId, {
          type: 'agents_update',
          agents,
        });

        // Broadcast events
        for (const event of result.events) {
          wsManager.broadcastToGame(gameId, { type: 'event', event });

          // Dialogue events get their own message
          if (event.type === 'conversation' && event.data.dialogue) {
            wsManager.broadcastToGame(gameId, {
              type: 'dialogue',
              agentId: event.actorIds[0],
              targetId: event.actorIds[1],
              lines: event.data.dialogue as any,
            });
          }
        }

        // Broadcast chunk updates
        for (const chunkKey of result.changedChunks) {
          const [cx, cy] = chunkKey.split(',').map(Number);
          const chunk = getChunk(world.map, cx, cy);
          wsManager.broadcastChunkUpdate(gameId, chunkKey, { type: 'chunk_update', chunk });
        }

        // Broadcast village updates (founding, governance changes, etc.)
        for (const village of world.villages.values()) {
          wsManager.broadcastToGame(gameId, { type: 'village_update', village });
        }

        // Broadcast 4X village state updates (serialize Set → Array)
        for (const vs of world.villageStates4X.values()) {
          const serialized = { ...vs, researchedTechs: [...vs.researchedTechs] };
          wsManager.broadcastToGame(gameId, { type: 'village_4x_update', state: serialized } as any);
        }

        // Broadcast 4X-specific events
        for (const event of result.events) {
          if (event.data?.victory) {
            wsManager.broadcastToGame(gameId, { type: 'victory', event: event.data.victory } as any);
          }
          if (event.data?.combatResult) {
            wsManager.broadcastToGame(gameId, { type: 'battle_result', result: event.data.combatResult } as any);
          }
        }

        // Broadcast stats + diplomacy + relationships every 10 ticks
        if (result.tick % 10 === 0) {
          const stats = computeWorldStats(world);
          wsManager.broadcastToGame(gameId, { type: 'stats_update', stats });

          // Diplomacy relations
          const allRelations = world.diplomacy.getAllRelations();
          wsManager.broadcastToGame(gameId, {
            type: 'diplomacy_update',
            relations: allRelations,
          } as any);

          // Agent relationships
          const relationshipsData: { agentId: string; relations: any[] }[] = [];
          for (const [agentId, relations] of world.relationships) {
            relationshipsData.push({ agentId, relations });
          }
          wsManager.broadcastToGame(gameId, {
            type: 'relationships_update',
            relationships: relationshipsData,
          } as any);

          // F19: Autonomous world data (covenants, inventions, institutions)
          const aw = world.autonomousWorld;
          const covenants = [...aw.covenants.values()].filter((c) => c.relevance > 0.1);
          const inventions = [...aw.inventions.values()].filter((i) => i.relevance > 0.1);
          const institutions = [...aw.institutions.values()].filter((i) => i.relevance > 0.1);
          wsManager.broadcastToGame(gameId, {
            type: 'autonomous_world_update',
            covenants,
            inventions,
            institutions,
          } as any);
        }

        // F9: Log latency metrics every 100 ticks
        if (adaptiveEnabled && this._dojoBridge && tickNum % 100 === 0) {
          const metrics = this._dojoBridge.getLatencyMetrics();
          console.log(`[Latency] tick=${tickNum} avg=${metrics.avg.toFixed(0)}ms p95=${metrics.p95.toFixed(0)}ms p99=${metrics.p99.toFixed(0)}ms max=${metrics.max.toFixed(0)}ms success=${(metrics.successRate * 100).toFixed(1)}%`);
        }

        // F5: Run sync check (interval managed by bridge)
        if (this._dojoBridge) {
          this._dojoBridge.maybeRunSyncCheck(world.villageStates4X, result.tick).catch(
            (err) => console.warn('[SyncChecker] background error:', err),
          );
        }
      } catch (err) {
        console.error(`Tick error for game ${gameId}:`, err);
      } finally {
        this.ticking.delete(gameId);
      }

      // F9: Adaptive tick — use recommended interval
      if (adaptiveEnabled && this._dojoBridge) {
        const recommended = this._dojoBridge.getRecommendedInterval(baseInterval);
        const timer = setTimeout(runTick, recommended);
        this.timers.set(gameId, timer);
      }
    };

    if (adaptiveEnabled) {
      // Recursive setTimeout for adaptive intervals
      const timer = setTimeout(runTick, baseInterval);
      this.timers.set(gameId, timer);
    } else {
      // Standard setInterval
      const timer = setInterval(runTick, baseInterval);
      this.timers.set(gameId, timer);
    }

    // F4: Set up Torii external event handler
    if (this._dojoBridge) {
      this._dojoBridge.onExternalEvents((events) => {
        eventStore.push(gameId, events);
        for (const event of events) {
          wsManager.broadcastToGame(gameId, { type: 'event', event });
        }
      });
    }

    return true;
  }

  pause(gameId: string): boolean {
    const timer = this.timers.get(gameId);
    if (!timer) return false;
    clearInterval(timer);
    clearTimeout(timer);
    this.timers.delete(gameId);
    return true;
  }

  setSpeed(gameId: string, multiplier: number): boolean {
    if (!this.worlds.has(gameId)) return false;
    // Always stop the current timer first
    if (this.timers.has(gameId)) this.pause(gameId);
    this.speeds.set(gameId, multiplier);
    // Restart with new speed if > 0
    if (multiplier > 0) this.start(gameId, multiplier);
    return true;
  }

  getSpeed(gameId: string): number {
    return this.speeds.get(gameId) ?? 1;
  }

  isRunning(gameId: string): boolean {
    return this.timers.has(gameId);
  }

  destroy(gameId: string): void {
    this.pause(gameId);
    this.worlds.delete(gameId);
    this.speeds.delete(gameId);
    eventStore.clear(gameId);
  }

  listGames(): { gameId: string; tick: number; running: boolean; events: number }[] {
    return [...this.worlds.entries()].map(([gameId, world]) => ({
      gameId,
      tick: world.tick,
      running: this.timers.has(gameId),
      events: eventStore.count(gameId),
    }));
  }
}

export const tickService = new TickService();
