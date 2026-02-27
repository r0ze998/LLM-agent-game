import { useGameStore } from './store/gameStore.ts';
import { TitleScreen } from './TitleScreen.tsx';
import { GameView } from './GameView.tsx';

export default function App() {
  const game = useGameStore((s) => s.game);
  if (!game) return <TitleScreen />;
  return <GameView />;
}
