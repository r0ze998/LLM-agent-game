import { create } from 'zustand';

type GameMode = 'player' | 'observer' | null;

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface UIStore {
  gameMode: GameMode;
  selectedAgentId: string | null;
  followAgentId: string | null;
  selectedVillageId: string | null;
  showIntentionPanel: boolean;
  showAgentInspector: boolean;
  showTimeline: boolean;
  showMinimap: boolean;
  showDashboard: boolean;
  showAgentDeployer: boolean;
  showDemoOverlay: boolean;
  showStrategy: boolean;
  showTechTree: boolean;
  showDiplomacy: boolean;
  showSocialGraph: boolean;
  showVictory: boolean;
  showAutonomousWorld: boolean;
  speed: number;
  isPaused: boolean;
  isWalletConnected: boolean;
  viewport: Viewport;

  setGameMode: (mode: GameMode) => void;
  selectAgent: (id: string | null) => void;
  followAgent: (id: string | null) => void;
  selectVillage: (id: string | null) => void;
  toggleIntentionPanel: () => void;
  toggleAgentInspector: () => void;
  toggleTimeline: () => void;
  toggleMinimap: () => void;
  toggleDashboard: () => void;
  toggleAgentDeployer: () => void;
  toggleDemoOverlay: () => void;
  toggleStrategy: () => void;
  toggleTechTree: () => void;
  toggleDiplomacy: () => void;
  toggleSocialGraph: () => void;
  toggleVictory: () => void;
  toggleAutonomousWorld: () => void;
  setSpeed: (speed: number) => void;
  setIsPaused: (paused: boolean) => void;
  setWalletConnected: (connected: boolean) => void;
  setViewport: (vp: Viewport) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  gameMode: null,
  selectedAgentId: null,
  followAgentId: null,
  selectedVillageId: null,
  showIntentionPanel: false,
  showAgentInspector: false,
  showTimeline: false,
  showMinimap: true,
  showDashboard: false,
  showAgentDeployer: false,
  showDemoOverlay: false,
  showStrategy: false,
  showTechTree: false,
  showDiplomacy: false,
  showSocialGraph: false,
  showVictory: false,
  showAutonomousWorld: false,
  speed: 1,
  isPaused: true,
  isWalletConnected: false,
  viewport: { x: 0, y: 0, zoom: 2 },

  setGameMode: (mode) => set({ gameMode: mode }),
  selectAgent: (id) => set({ selectedAgentId: id, showAgentInspector: !!id }),
  followAgent: (id) => set({ followAgentId: id }),
  selectVillage: (id) => set({ selectedVillageId: id, showStrategy: !!id }),
  toggleIntentionPanel: () => set((s) => ({ showIntentionPanel: !s.showIntentionPanel })),
  toggleAgentInspector: () => set((s) => ({ showAgentInspector: !s.showAgentInspector })),
  toggleTimeline: () => set((s) => ({ showTimeline: !s.showTimeline })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleDashboard: () => set((s) => ({ showDashboard: !s.showDashboard })),
  toggleAgentDeployer: () => set((s) => ({ showAgentDeployer: !s.showAgentDeployer })),
  toggleDemoOverlay: () => set((s) => ({ showDemoOverlay: !s.showDemoOverlay })),
  toggleStrategy: () => set((s) => ({ showStrategy: !s.showStrategy })),
  toggleTechTree: () => set((s) => ({ showTechTree: !s.showTechTree })),
  toggleDiplomacy: () => set((s) => ({ showDiplomacy: !s.showDiplomacy })),
  toggleSocialGraph: () => set((s) => ({ showSocialGraph: !s.showSocialGraph })),
  toggleVictory: () => set((s) => ({ showVictory: !s.showVictory })),
  toggleAutonomousWorld: () => set((s) => ({ showAutonomousWorld: !s.showAutonomousWorld })),
  setSpeed: (speed) => set({ speed, isPaused: speed === 0 }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setWalletConnected: (isWalletConnected) => set({ isWalletConnected }),
  setViewport: (viewport) => set({ viewport }),
}));
