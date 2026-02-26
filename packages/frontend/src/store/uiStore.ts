import { create } from 'zustand';

interface UIStore {
  selectedAgentId: string | null;
  followAgentId: string | null;
  showIntentionPanel: boolean;
  showAgentInspector: boolean;
  showTimeline: boolean;
  showMinimap: boolean;
  showDashboard: boolean;
  showAgentDeployer: boolean;
  speed: number;
  isPaused: boolean;

  selectAgent: (id: string | null) => void;
  followAgent: (id: string | null) => void;
  toggleIntentionPanel: () => void;
  toggleAgentInspector: () => void;
  toggleTimeline: () => void;
  toggleMinimap: () => void;
  toggleDashboard: () => void;
  toggleAgentDeployer: () => void;
  setSpeed: (speed: number) => void;
  setIsPaused: (paused: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedAgentId: null,
  followAgentId: null,
  showIntentionPanel: false,
  showAgentInspector: false,
  showTimeline: false,
  showMinimap: true,
  showDashboard: false,
  showAgentDeployer: false,
  speed: 1,
  isPaused: true,

  selectAgent: (id) => set({ selectedAgentId: id, showAgentInspector: !!id }),
  followAgent: (id) => set({ followAgentId: id }),
  toggleIntentionPanel: () => set((s) => ({ showIntentionPanel: !s.showIntentionPanel })),
  toggleAgentInspector: () => set((s) => ({ showAgentInspector: !s.showAgentInspector })),
  toggleTimeline: () => set((s) => ({ showTimeline: !s.showTimeline })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleDashboard: () => set((s) => ({ showDashboard: !s.showDashboard })),
  toggleAgentDeployer: () => set((s) => ({ showAgentDeployer: !s.showAgentDeployer })),
  setSpeed: (speed) => set({ speed, isPaused: speed === 0 }),
  setIsPaused: (isPaused) => set({ isPaused }),
}));
