import { useEffect } from 'react';
import { wsClient } from '../services/wsClient.ts';
import { useGameStore } from '../store/gameStore.ts';

export function useWorldState(gameId: string | null) {
  const { updateTick, setAgents, updateChunk, addEvent, setDialogue, updateVillage, setStats } = useGameStore();

  useEffect(() => {
    if (!gameId) return;

    wsClient.connect(gameId);

    const unsub = wsClient.subscribe((msg) => {
      switch (msg.type) {
        case 'tick':
          updateTick(msg.tick, msg.dayOfYear, msg.year);
          break;
        case 'agents_update':
          setAgents(msg.agents);
          break;
        case 'chunk_update':
          updateChunk(msg.chunk);
          break;
        case 'event':
          addEvent(msg.event);
          break;
        case 'dialogue':
          setDialogue({ agentId: msg.agentId, targetId: msg.targetId, lines: msg.lines });
          break;
        case 'village_update':
          updateVillage(msg.village);
          break;
        case 'stats_update':
          setStats(msg.stats);
          break;
      }
    });

    return () => {
      unsub();
      wsClient.disconnect();
    };
  }, [gameId]);
}
