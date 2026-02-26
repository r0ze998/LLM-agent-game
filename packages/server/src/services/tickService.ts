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
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private speeds = new Map<string, number>(); // multiplier
  private ticking = new Set<string>(); // prevent overlapping ticks
  private _dojoBridge?: DojoBridge;

  /** DojoBridge をセット（index.ts から起動時に呼ばれる） */
  setDojoBridge(bridge: DojoBridge): void {
    this._dojoBridge = bridge;
  }

  getWorld(gameId: string): WorldState | undefined {
    return this.worlds.get(gameId);
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
    const interval = DEFAULT_TICK_INTERVAL_MS / speedMultiplier;

    const timer = setInterval(async () => {
      // Prevent overlapping ticks when LLM calls are slow
      if (this.ticking.has(gameId)) return;
      this.ticking.add(gameId);
      try {
        const result = await tick(world);

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

        // Broadcast stats every 10 ticks
        if (result.tick % 10 === 0) {
          const stats = computeWorldStats(world);
          wsManager.broadcastToGame(gameId, { type: 'stats_update', stats });
        }
      } catch (err) {
        console.error(`Tick error for game ${gameId}:`, err);
      } finally {
        this.ticking.delete(gameId);
      }
    }, interval);

    this.timers.set(gameId, timer);
    return true;
  }

  pause(gameId: string): boolean {
    const timer = this.timers.get(gameId);
    if (!timer) return false;
    clearInterval(timer);
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
