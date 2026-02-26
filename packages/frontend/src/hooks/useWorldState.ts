import { useEffect } from 'react';
import { wsClient } from '../services/wsClient.ts';
import { useGameStore } from '../store/gameStore.ts';
import { api } from '../services/api.ts';

export function useWorldState(gameId: string | null) {
  const {
    updateTick, setAgents, updateChunk, addEvent, addDialogue,
    updateVillage, setStats, updateVillage4X, setBattleResult, setVictoryEvent,
    setGame,
  } = useGameStore();

  useEffect(() => {
    if (!gameId) return;

    // Fetch initial state via REST so we don't depend on tick timing
    (async () => {
      try {
        const [gameState, agents, stats] = await Promise.all([
          api.getGame(gameId),
          api.getAgents(gameId),
          api.getGameStats(gameId).catch(() => null),
        ]);
        setGame(gameState);
        setAgents(agents);
        if (stats) setStats(stats);
      } catch (err) {
        console.error('Failed to fetch initial state:', err);
      }
    })();

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
          addDialogue({ agentId: msg.agentId, targetId: msg.targetId, lines: msg.lines });
          break;
        case 'village_update':
          updateVillage(msg.village);
          break;
        case 'stats_update':
          setStats(msg.stats);
          break;
        case 'village_4x_update':
          updateVillage4X(msg.state);
          break;
        case 'battle_result':
          setBattleResult(msg.result);
          break;
        case 'victory':
          setVictoryEvent(msg.event);
          break;
      }
    });

    return () => {
      unsub();
      wsClient.disconnect();
    };
  }, [gameId]);
}
