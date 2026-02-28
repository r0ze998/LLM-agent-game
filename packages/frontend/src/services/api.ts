import type { ApiResponse, GameState, AgentState, AgentBlueprint, DeployedBlueprintMeta, Chunk, Village, PlayerIntention, IntentionType, IntentionStrength, PlayerCommand, CommandResult, VillageState4XSerialized, WorldStats } from '@murasato/shared';

const BASE_URL = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json: ApiResponse<T> = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'API error');
  return json.data!;
}

export const api = {
  // Game
  listActiveGames: () =>
    request<{ gameId: string; tick: number; running: boolean; events: number }[]>('/game/list/active'),

  createGame: (config?: Partial<{ seed: number; mapSize: number; initialAgents: number }>) =>
    request<GameState>('/game', { method: 'POST', body: JSON.stringify(config ?? {}) }),

  getGame: (gameId: string) =>
    request<GameState>(`/game/${gameId}`),

  startGame: (gameId: string, speed?: number) =>
    request<{ status: string }>(`/game/${gameId}/start${speed ? `?speed=${speed}` : ''}`, { method: 'POST' }),

  pauseGame: (gameId: string) =>
    request<{ status: string }>(`/game/${gameId}/pause`, { method: 'POST' }),

  setSpeed: (gameId: string, speed: number) =>
    request<{ speed: number }>(`/game/${gameId}/speed`, { method: 'POST', body: JSON.stringify({ speed }) }),

  // World
  getChunk: (gameId: string, cx: number, cy: number) =>
    request<Chunk>(`/world/${gameId}/chunk/${cx}/${cy}`),

  getMapMeta: (gameId: string) =>
    request<{ size: number; chunkCount: number; seed: number }>(`/world/${gameId}/meta`),

  getVillages: (gameId: string) =>
    request<Village[]>(`/world/${gameId}/villages`),

  // Agents
  getAgents: (gameId: string) =>
    request<AgentState[]>(`/agent/${gameId}`),

  getAgent: (gameId: string, agentId: string) =>
    request<AgentState>(`/agent/${gameId}/${agentId}`),

  // Player
  sendIntention: (gameId: string, data: {
    type: IntentionType;
    targetType: 'agent' | 'village' | 'world';
    targetId?: string;
    message: string;
    strength: IntentionStrength;
  }) =>
    request<PlayerIntention>(`/player/${gameId}/intention`, { method: 'POST', body: JSON.stringify(data) }),

  getIntentions: (gameId: string) =>
    request<PlayerIntention[]>(`/player/${gameId}/intentions`),

  // Blueprint
  deployBlueprint: (gameId: string, blueprint: AgentBlueprint) =>
    request<{ agent: AgentState; meta: DeployedBlueprintMeta }>(`/blueprint/${gameId}/deploy`, {
      method: 'POST',
      body: JSON.stringify(blueprint),
    }),

  getBlueprints: (gameId: string) =>
    request<DeployedBlueprintMeta[]>(`/blueprint/${gameId}`),

  recallBlueprint: (gameId: string, blueprintId: string) =>
    request<{ recalled: true; agentName: string }>(`/blueprint/${gameId}/${blueprintId}`, { method: 'DELETE' }),

  // Strategy (4X)
  sendCommand: (gameId: string, playerId: string, command: PlayerCommand) =>
    request<CommandResult>('/strategy/command', {
      method: 'POST',
      body: JSON.stringify({ gameId, playerId, command }),
    }),

  getVillage4XStates: (gameId: string) =>
    request<VillageState4XSerialized[]>(`/strategy/villages/${gameId}`),

  getVillage4XState: (gameId: string, villageId: string) =>
    request<VillageState4XSerialized>(`/strategy/villages/${gameId}/${villageId}`),

  // Stats
  getGameStats: (gameId: string) =>
    request<WorldStats>(`/game/${gameId}/stats`),
};
