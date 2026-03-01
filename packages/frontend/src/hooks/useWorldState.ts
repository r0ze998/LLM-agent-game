import { useEffect } from 'react';
import { wsClient } from '../services/wsClient.ts';
import { useGameStore } from '../store/gameStore.ts';
import { useNotificationStore } from '../store/notificationStore.ts';
import { api } from '../services/api.ts';
import { TECH_DEFS } from '@murasato/shared';

const EVENT_NOTIFICATION_MAP: Record<string, { color: string; type: string }> = {
  birth: { color: '#4ad97a', type: 'birth' },
  death: { color: '#888', type: 'death' },
  war: { color: '#d94a4a', type: 'war' },
  peace: { color: '#5ac8fa', type: 'peace' },
  founding: { color: '#e67e22', type: 'founding' },
  discovery: { color: '#9b59b6', type: 'discovery' },
  election: { color: '#4a90d9', type: 'election' },
};

export function useWorldState(gameId: string | null) {
  const {
    updateTick, setAgents, updateChunk, addEvent, addDialogue,
    updateVillage, setStats, updateVillage4X, setBattleResult, setVictoryEvent,
    setGame, setDiplomaticRelations, setAgentRelationships, setAutonomousWorld,
  } = useGameStore();
  const addNotification = useNotificationStore((s) => s.addNotification);

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
        case 'event': {
          addEvent(msg.event);
          const notifConfig = EVENT_NOTIFICATION_MAP[msg.event.type];
          if (notifConfig) {
            addNotification({
              type: notifConfig.type,
              title: msg.event.type.charAt(0).toUpperCase() + msg.event.type.slice(1),
              description: msg.event.description,
              color: notifConfig.color,
            });
          }
          break;
        }
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
          addNotification({
            type: 'battle',
            title: 'Battle!',
            description: `${msg.result.attackerWon ? 'Attacker' : 'Defender'} wins (${msg.result.attackPower.toFixed(0)} vs ${msg.result.defensePower.toFixed(0)})`,
            color: '#d94a4a',
          });
          break;
        case 'tech_researched': {
          const techDef = TECH_DEFS[msg.techId];
          addNotification({
            type: 'tech',
            title: 'Tech Researched',
            description: techDef?.name ?? msg.techId,
            color: '#9b59b6',
          });
          break;
        }
        case 'victory':
          setVictoryEvent(msg.event);
          addNotification({
            type: 'victory',
            title: 'Victory!',
            description: `${msg.event.victoryType} victory achieved!`,
            color: '#ffd700',
          });
          break;
        case 'diplomacy_update':
          setDiplomaticRelations(msg.relations);
          break;
        case 'relationships_update':
          setAgentRelationships(msg.relationships);
          break;
        case 'autonomous_world_update':
          setAutonomousWorld({
            covenants: msg.covenants,
            inventions: msg.inventions,
            institutions: msg.institutions,
          });
          break;
      }
    });

    return () => {
      unsub();
      wsClient.disconnect();
    };
  }, [gameId]);
}
