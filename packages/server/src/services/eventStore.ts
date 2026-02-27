import type { GameEvent, GameEventType } from '@murasato/shared';

const IMPORTANT_TYPES: GameEventType[] = [
  'birth', 'death', 'founding', 'election', 'war', 'peace', 'alliance',
];

const MAX_EVENTS_PER_GAME = 50_000;

class EventStore {
  private store = new Map<string, GameEvent[]>();

  push(gameId: string, events: GameEvent[]): void {
    if (events.length === 0) return;
    const list = this.store.get(gameId) ?? [];
    list.push(...events);

    // Evict routine events when over limit
    if (list.length > MAX_EVENTS_PER_GAME) {
      this.evict(list);
    }

    this.store.set(gameId, list);
  }

  /** Push events with an origin tag (_origin: 'onchain' | 'offchain') */
  pushWithOrigin(gameId: string, events: GameEvent[], origin: 'onchain' | 'offchain'): void {
    const tagged = events.map(e => ({
      ...e,
      data: { ...e.data, _origin: origin },
    }));
    this.push(gameId, tagged);
  }

  getAll(gameId: string): GameEvent[] {
    return this.store.get(gameId) ?? [];
  }

  getByType(gameId: string, types: GameEventType[]): GameEvent[] {
    return this.getAll(gameId).filter(e => types.includes(e.type));
  }

  getByTickRange(gameId: string, from: number, to: number): GameEvent[] {
    return this.getAll(gameId).filter(e => e.tick >= from && e.tick <= to);
  }

  getByAgent(gameId: string, agentId: string): GameEvent[] {
    return this.getAll(gameId).filter(e => e.actorIds.includes(agentId));
  }

  count(gameId: string): number {
    return (this.store.get(gameId) ?? []).length;
  }

  clear(gameId: string): void {
    this.store.delete(gameId);
  }

  /** Restore events from a save file */
  restore(gameId: string, events: GameEvent[]): void {
    this.store.set(gameId, events);
  }

  private evict(list: GameEvent[]): void {
    // Keep all important events; remove oldest routine events until under limit
    const target = Math.floor(MAX_EVENTS_PER_GAME * 0.8);
    let i = 0;
    while (list.length > target && i < list.length) {
      if (!IMPORTANT_TYPES.includes(list[i].type)) {
        list.splice(i, 1);
      } else {
        i++;
      }
    }
  }
}

export const eventStore = new EventStore();
