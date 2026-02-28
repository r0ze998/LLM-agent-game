import { useWorldState } from './hooks/useWorldState.ts';
import { useGameStore } from './store/gameStore.ts';
import { WorldCanvas } from './components/world/WorldCanvas.tsx';
import { TopBar } from './components/layout/TopBar.tsx';
import { DialogueBox } from './components/ui/DialogueBox.tsx';
import { IntentionPanel } from './components/ui/IntentionPanel.tsx';
import { AgentInspector } from './components/ui/AgentInspector.tsx';
import { SpeedControl } from './components/ui/SpeedControl.tsx';
import { VillagePanel } from './components/ui/VillagePanel.tsx';
import { TimelinePanel } from './components/ui/TimelinePanel.tsx';
import { Minimap } from './components/ui/Minimap.tsx';
import { DashboardPanel } from './components/ui/DashboardPanel.tsx';
import { AgentDeployer } from './components/ui/AgentDeployer.tsx';
import { DemoOverlay } from './components/ui/DemoOverlay.tsx';
import { StrategyPanel } from './components/ui/StrategyPanel.tsx';
import { TechTreeViewer } from './components/ui/TechTreeViewer.tsx';
import { DiplomacyOverlay } from './components/ui/DiplomacyOverlay.tsx';
import { SocialNetworkGraph } from './components/ui/SocialNetworkGraph.tsx';
import { NotificationToasts } from './components/ui/NotificationToasts.tsx';
import { BattleReportPopup } from './components/ui/BattleReportPopup.tsx';
import { VictoryPanel } from './components/ui/VictoryPanel.tsx';
import { VictoryAnnouncement } from './components/ui/VictoryAnnouncement.tsx';
import { AutonomousWorldPanel } from './components/ui/AutonomousWorldPanel.tsx';
import { PaymentDashboard } from './components/ui/PaymentDashboard.tsx';

export function GameView() {
  const gameId = useGameStore((s) => s.game?.id ?? null);
  useWorldState(gameId);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <WorldCanvas />
      <TopBar />
      <Minimap />
      <AgentInspector />
      <VillagePanel />
      <TimelinePanel />
      <IntentionPanel />
      <DialogueBox />
      <DashboardPanel />
      <AgentDeployer />
      <SpeedControl />
      <DemoOverlay />
      <StrategyPanel />
      <TechTreeViewer />
      <DiplomacyOverlay />
      <SocialNetworkGraph />
      <NotificationToasts />
      <BattleReportPopup />
      <VictoryPanel />
      <VictoryAnnouncement />
      <AutonomousWorldPanel />
      <PaymentDashboard />
    </div>
  );
}
