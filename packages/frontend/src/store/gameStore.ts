import { create } from 'zustand';
import type { AgentState, Chunk, GameEvent, GameState, Village, DialogueLine, WorldStats } from '@murasato/shared';

interface GameStore {
  // State
  game: GameState | null;
  agents: Map<string, AgentState>;
  chunks: Map<string, Chunk>;
  villages: Map<string, Village>;
  events: GameEvent[];
  currentDialogue: { agentId: string; targetId: string; lines: DialogueLine[] } | null;
  stats: WorldStats | null;

  // Actions
  setGame: (game: GameState) => void;
  updateTick: (tick: number, dayOfYear: number, year: number) => void;
  setAgents: (agents: AgentState[]) => void;
  updateChunk: (chunk: Chunk) => void;
  setVillages: (villages: Village[]) => void;
  updateVillage: (village: Village) => void;
  addEvent: (event: GameEvent) => void;
  setDialogue: (dialogue: { agentId: string; targetId: string; lines: DialogueLine[] } | null) => void;
  setStats: (stats: WorldStats) => void;
  reset: () => void;
}

const initialState = {
  game: null as GameState | null,
  agents: new Map<string, AgentState>(),
  chunks: new Map<string, Chunk>(),
  villages: new Map<string, Village>(),
  events: [] as GameEvent[],
  currentDialogue: null as { agentId: string; targetId: string; lines: DialogueLine[] } | null,
  stats: null as WorldStats | null,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setGame: (game) => set({ game }),

  updateTick: (tick, dayOfYear, year) =>
    set((state) => ({
      game: state.game ? { ...state.game, tick, dayOfYear, year, status: 'running' } : null,
    })),

  setAgents: (agents) => {
    const map = new Map<string, AgentState>();
    for (const a of agents) map.set(a.identity.id, a);
    set({ agents: map });
  },

  updateChunk: (chunk) =>
    set((state) => {
      const chunks = new Map(state.chunks);
      chunks.set(`${chunk.cx},${chunk.cy}`, chunk);
      return { chunks };
    }),

  setVillages: (villages) => {
    const map = new Map<string, Village>();
    for (const v of villages) map.set(v.id, v);
    set({ villages: map });
  },

  updateVillage: (village) =>
    set((state) => {
      const villages = new Map(state.villages);
      villages.set(village.id, village);
      return { villages };
    }),

  addEvent: (event) =>
    set((state) => ({
      events: [...state.events.slice(-199), event], // keep last 200
    })),

  setDialogue: (dialogue) => set({ currentDialogue: dialogue }),

  setStats: (stats) => set({ stats }),

  reset: () => set({ ...initialState, agents: new Map(), chunks: new Map(), villages: new Map(), events: [] }),
}));
