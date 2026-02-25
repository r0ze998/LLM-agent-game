import type { Memory, MemoryTier } from '@murasato/shared';
import { MAX_WORKING_MEMORY, MAX_EPISODIC_MEMORY, REFLECTION_INTERVAL } from '@murasato/shared';

function generateId(): string {
  return `mem_${crypto.randomUUID()}`;
}

// --- Score function ---

function computeScore(memory: Memory, currentTick: number): number {
  const recency = 1 / (1 + (currentTick - memory.tick) * 0.01);
  return recency * memory.importance * Math.log(memory.accessCount + 2);
}

// --- In-memory storage (per game) ---

const store = new Map<string, Memory[]>(); // key: "gameId:agentId"

function storeKey(gameId: string, agentId: string): string {
  return `${gameId}:${agentId}`;
}

/** Clear all memories for a game (used on game reset) */
export function clearGameMemories(gameId: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(`${gameId}:`)) store.delete(key);
  }
}

/** Get raw memory list (for serialization) */
export function getAllMemories(gameId: string): Memory[] {
  const result: Memory[] = [];
  for (const [key, mems] of store) {
    if (key.startsWith(`${gameId}:`)) result.push(...mems);
  }
  return result;
}

/** Restore memories from save data */
export function restoreMemories(gameId: string, memories: Memory[]): void {
  clearGameMemories(gameId);
  for (const mem of memories) {
    const key = storeKey(gameId, mem.agentId);
    const list = store.get(key) ?? [];
    list.push(mem);
    store.set(key, list);
  }
}

// --- Memory Manager ---

export class MemoryManager {
  private key: string;

  constructor(
    private agentId: string,
    private gameId: string,
  ) {
    this.key = storeKey(gameId, agentId);
  }

  private getAll(): Memory[] {
    return store.get(this.key) ?? [];
  }

  private setAll(mems: Memory[]): void {
    store.set(this.key, mems);
  }

  addMemory(content: string, importance: number, tick: number, tier: MemoryTier = 'working', tags: string[] = []): void {
    const mems = this.getAll();
    mems.push({
      id: generateId(),
      agentId: this.agentId,
      tier,
      content,
      importance,
      tick,
      accessCount: 0,
      tags,
    });
    this.setAll(mems);

    if (tier === 'working') {
      this.pruneWorking();
    }
  }

  private pruneWorking(): void {
    const mems = this.getAll();
    const working = mems.filter(m => m.tier === 'working').sort((a, b) => b.tick - a.tick);

    if (working.length > MAX_WORKING_MEMORY) {
      const toPromote = working.slice(MAX_WORKING_MEMORY);
      for (const mem of toPromote) {
        if (mem.importance >= 0.5) {
          mem.tier = 'episodic';
        } else {
          const idx = mems.indexOf(mem);
          if (idx !== -1) mems.splice(idx, 1);
        }
      }
    }

    // Enforce episodic limit
    const episodic = mems.filter(m => m.tier === 'episodic').sort((a, b) => b.tick - a.tick);
    if (episodic.length > MAX_EPISODIC_MEMORY) {
      const toRemove = episodic.slice(MAX_EPISODIC_MEMORY);
      for (const mem of toRemove) {
        const idx = mems.indexOf(mem);
        if (idx !== -1) mems.splice(idx, 1);
      }
    }

    this.setAll(mems);
  }

  getWorkingMemories(): Memory[] {
    return this.getAll()
      .filter(m => m.tier === 'working')
      .sort((a, b) => b.tick - a.tick);
  }

  getTopMemories(currentTick: number, limit: number): Memory[] {
    const mems = this.getAll().filter(m => m.tier === 'working' || m.tier === 'episodic');

    const scored = mems
      .map(m => ({ memory: m, score: computeScore(m, currentTick) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Increment access counts
    for (const { memory } of scored) {
      memory.accessCount++;
    }

    return scored.map(s => s.memory);
  }

  getRecentMemories(limit: number): Memory[] {
    return this.getAll()
      .sort((a, b) => b.tick - a.tick)
      .slice(0, limit);
  }

  getLongtermMemories(): Memory[] {
    return this.getAll()
      .filter(m => m.tier === 'longterm')
      .sort((a, b) => b.importance - a.importance);
  }

  shouldReflect(currentTick: number): boolean {
    const longterm = this.getAll().filter(m => m.tier === 'longterm');
    const lastTick = longterm.length > 0 ? Math.max(...longterm.map(m => m.tick)) : 0;
    return (currentTick - lastTick) >= REFLECTION_INTERVAL;
  }
}
