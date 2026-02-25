import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore.ts';
import { useUIStore } from '../store/uiStore.ts';

export function useAgentFocus(centerOn: (x: number, y: number) => void) {
  const agents = useGameStore((s) => s.agents);
  const followAgentId = useUIStore((s) => s.followAgentId);

  useEffect(() => {
    if (!followAgentId) return;
    const agent = agents.get(followAgentId);
    if (agent) {
      centerOn(agent.position.x, agent.position.y);
    }
  }, [followAgentId, agents, centerOn]);
}
