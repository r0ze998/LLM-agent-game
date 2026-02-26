import type { SaveData, GameState, AgentState, Village, Structure, Relationship, GameEvent, PlayerIntention, DiplomaticRelation, TradeAgreement } from '@murasato/shared';
import type { WorldState } from '../world/simulation.ts';
import { generateMap, findSpawnPositions } from '../world/map.ts';
import { createWorldState } from '../world/simulation.ts';
import { DiplomacyManager } from '../social/diplomacy.ts';

const SAVE_VERSION = 1;

// --- Serialize world state to SaveData ---

export function serializeWorld(world: WorldState, gameState: GameState): SaveData {
  const agents: AgentState[] = [...world.agents.values()];
  const villages: Village[] = [...world.villages.values()];
  const structures: Structure[] = [...world.structures.values()];

  const relationships: { agentId: string; relations: Relationship[] }[] = [];
  for (const [agentId, rels] of world.relationships) {
    relationships.push({ agentId, relations: rels });
  }

  return {
    version: SAVE_VERSION,
    gameState,
    agents,
    villages,
    structures,
    relationships,
    events: [], // Events are stored separately (too large for inline save)
    intentions: world.intentions,
    diplomacy: world.diplomacy.getAllRelations(),
    trades: world.diplomacy.getTrades(),
    mapSeed: world.map.seed,
    tick: world.tick,
    blueprints: [...world.blueprints.values()],
  };
}

// --- Deserialize SaveData to world state ---

export function deserializeWorld(save: SaveData): WorldState {
  const map = generateMap(save.mapSeed, save.gameState.config.mapSize);
  const world = createWorldState(save.gameState.id, map);

  world.tick = save.tick;

  // Restore agents
  for (const agent of save.agents) {
    world.agents.set(agent.identity.id, agent);
  }

  // Restore villages
  for (const village of save.villages) {
    world.villages.set(village.id, village);
  }

  // Restore structures (and re-link to map tiles)
  for (const structure of save.structures) {
    world.structures.set(structure.id, structure);
    const tile = world.map.tiles[structure.position.y]?.[structure.position.x];
    if (tile) tile.structureId = structure.id;
  }

  // Restore relationships
  for (const { agentId, relations } of save.relationships) {
    world.relationships.set(agentId, relations);
  }

  // Restore intentions
  world.intentions = save.intentions;

  // Restore blueprints
  if (save.blueprints) {
    for (const bp of save.blueprints) {
      world.blueprints.set(bp.blueprintId, bp);
    }
  }

  // Restore diplomacy
  for (const rel of save.diplomacy) {
    world.diplomacy.setStatus(rel.villageId1, rel.villageId2, rel.status);
    const dRel = world.diplomacy.getRelation(rel.villageId1, rel.villageId2);
    dRel.tension = rel.tension;
    dRel.tradeActive = rel.tradeActive;
    dRel.lastInteractionTick = rel.lastInteractionTick;
  }
  for (const trade of save.trades) {
    world.diplomacy.addTrade(trade);
  }

  return world;
}

// --- File-based save/load ---

const SAVE_DIR = './saves';

async function ensureSaveDir(): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  if (!existsSync(SAVE_DIR)) {
    await mkdir(SAVE_DIR, { recursive: true });
  }
}

export async function saveToFile(gameId: string, world: WorldState, gameState: GameState): Promise<string> {
  await ensureSaveDir();
  const data = serializeWorld(world, gameState);
  const filename = `${SAVE_DIR}/${gameId}_tick${world.tick}.json`;
  await Bun.write(filename, JSON.stringify(data));
  return filename;
}

export async function loadFromFile(filename: string): Promise<WorldState> {
  const raw = await Bun.file(filename).text();
  const save: SaveData = JSON.parse(raw);

  if (save.version !== SAVE_VERSION) {
    throw new Error(`Save version mismatch: expected ${SAVE_VERSION}, got ${save.version}`);
  }

  return deserializeWorld(save);
}

export async function listSaves(gameId?: string): Promise<string[]> {
  await ensureSaveDir();
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(SAVE_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  if (gameId) {
    return jsonFiles.filter(f => f.startsWith(gameId));
  }
  return jsonFiles;
}
