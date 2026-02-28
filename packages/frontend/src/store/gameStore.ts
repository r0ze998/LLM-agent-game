import { create } from 'zustand';
import type { AgentState, Chunk, GameEvent, GameState, Village, DialogueLine, WorldStats, VillageState4XSerialized, CombatResult, VictoryEvent, DiplomaticRelation, Relationship, Covenant, Invention, Institution } from '@murasato/shared';

interface GameStore {
  // State
  game: GameState | null;
  agents: Map<string, AgentState>;
  chunks: Map<string, Chunk>;
  villages: Map<string, Village>;
  village4xStates: Map<string, VillageState4XSerialized>;
  events: GameEvent[];
  dialogueQueue: { agentId: string; targetId: string; lines: DialogueLine[] }[];
  stats: WorldStats | null;
  lastBattleResult: CombatResult | null;
  victoryEvent: VictoryEvent | null;
  diplomaticRelations: DiplomaticRelation[];
  agentRelationships: Map<string, Relationship[]>;
  covenants: Covenant[];
  inventions: Invention[];
  institutions: Institution[];
  // Actions
  setGame: (game: GameState) => void;
  updateTick: (tick: number, dayOfYear: number, year: number) => void;
  setAgents: (agents: AgentState[]) => void;
  updateChunk: (chunk: Chunk) => void;
  setVillages: (villages: Village[]) => void;
  updateVillage: (village: Village) => void;
  updateVillage4X: (state: VillageState4XSerialized) => void;
  setBattleResult: (result: CombatResult) => void;
  setVictoryEvent: (event: VictoryEvent) => void;
  addEvent: (event: GameEvent) => void;
  addDialogue: (dialogue: { agentId: string; targetId: string; lines: DialogueLine[] }) => void;
  shiftDialogue: () => void;
  setStats: (stats: WorldStats) => void;
  setDiplomaticRelations: (relations: DiplomaticRelation[]) => void;
  setAgentRelationships: (data: { agentId: string; relations: Relationship[] }[]) => void;
  setAutonomousWorld: (data: { covenants: Covenant[]; inventions: Invention[]; institutions: Institution[] }) => void;
  reset: () => void;
}

const initialState = {
  game: null as GameState | null,
  agents: new Map<string, AgentState>(),
  chunks: new Map<string, Chunk>(),
  villages: new Map<string, Village>(),
  village4xStates: new Map<string, VillageState4XSerialized>(),
  events: [] as GameEvent[],
  dialogueQueue: [] as { agentId: string; targetId: string; lines: DialogueLine[] }[],
  stats: null as WorldStats | null,
  lastBattleResult: null as CombatResult | null,
  victoryEvent: null as VictoryEvent | null,
  diplomaticRelations: [] as DiplomaticRelation[],
  agentRelationships: new Map<string, Relationship[]>(),
  covenants: [] as Covenant[],
  inventions: [] as Invention[],
  institutions: [] as Institution[],
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

  updateVillage4X: (state4x) =>
    set((s) => {
      const village4xStates = new Map(s.village4xStates);
      village4xStates.set(state4x.villageId, state4x);
      return { village4xStates };
    }),

  setBattleResult: (result) => set({ lastBattleResult: result }),

  setVictoryEvent: (event) => set({ victoryEvent: event }),

  addEvent: (event) =>
    set((state) => ({
      events: [...state.events.slice(-199), event], // keep last 200
    })),

  addDialogue: (dialogue) =>
    set((state) => ({
      dialogueQueue: [...state.dialogueQueue, dialogue],
    })),

  shiftDialogue: () =>
    set((state) => ({
      dialogueQueue: state.dialogueQueue.slice(1),
    })),

  setStats: (stats) => set({ stats }),

  setDiplomaticRelations: (relations) => set({ diplomaticRelations: relations }),

  setAgentRelationships: (data) =>
    set(() => {
      const map = new Map<string, Relationship[]>();
      for (const entry of data) map.set(entry.agentId, entry.relations);
      return { agentRelationships: map };
    }),

  setAutonomousWorld: (data) => set({
    covenants: data.covenants,
    inventions: data.inventions,
    institutions: data.institutions,
  }),

  reset: () => set({
    ...initialState,
    agents: new Map(), chunks: new Map(), villages: new Map(),
    village4xStates: new Map(), events: [], dialogueQueue: [],
    lastBattleResult: null, victoryEvent: null,
    diplomaticRelations: [], agentRelationships: new Map(),
    covenants: [], inventions: [], institutions: [],
  }),
}));
