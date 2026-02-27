/**
 * Action execution — all 13 agent action cases
 * Extracted from simulation.ts
 */
import type {
  AgentState, GameEvent, Position, ResourceType, StructureType,
} from '@murasato/shared';
import {
  TERRAIN_MOVEMENT_COST, SLEEP_RESTORE, SOCIAL_RESTORE,
} from '@murasato/shared';
import { getNextStep } from './pathfinding.ts';
import { gatherFromTile, addToInventory, eatFood, farmTile, findNearbyResource, mapTo4XResource } from './resources.ts';
import { canBuild, createStructure, getBuildCost } from './building.ts';
import type { AgentAction } from '../agent/decisionEngine.ts';
import { educateChild } from '../agent/lifecycle.ts';
import { MemoryManager } from '../agent/memory.ts';
import { leaveVillage } from '../social/governance.ts';
import type { WorldState } from './simulation.ts';
import { createEvent } from './simulation.ts';

// --- Economy bridge: agent surplus → village 4X resources ---

const AGENT_TAX_RATE = 0.5; // 50% of gathered resources go to village

function contributeToVillage(
  world: WorldState,
  agent: AgentState,
  resource: ResourceType,
  amount: number,
): void {
  if (!agent.villageId || amount <= 0) return;
  const vs = world.villageStates4X.get(agent.villageId);
  if (!vs) return;
  const res4x = mapTo4XResource(resource);
  if (!res4x) return;

  const contribution = Math.floor(amount * AGENT_TAX_RATE);
  if (contribution <= 0) return;

  const cap = vs.resourceStorage[res4x];
  vs.resources[res4x] = Math.min(vs.resources[res4x] + contribution, cap);
}

// --- Action result ---

export interface ActionResult {
  event?: GameEvent;
  changedChunk?: string;
}

// --- Action execution ---

export function executeAction(world: WorldState, agent: AgentState, action: AgentAction): ActionResult {
  const chunkKey = (p: Position) => `${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`;

  switch (action.type) {
    case 'move': {
      const newX = agent.position.x + action.dx;
      const newY = agent.position.y + action.dy;
      if (newX >= 0 && newX < world.map.size && newY >= 0 && newY < world.map.size) {
        const tile = world.map.tiles[newY][newX];
        const cost = TERRAIN_MOVEMENT_COST[tile.terrain] ?? Infinity;
        if (cost < Infinity) {
          agent.position = { x: newX, y: newY };
          return { changedChunk: chunkKey(agent.position) };
        }
      }
      return {};
    }

    case 'gather': {
      const tile = world.map.tiles[agent.position.y][agent.position.x];
      const resource = action.resource as ResourceType;
      const available = tile.resources[resource] ?? 0;

      if (available <= 0) {
        // Current tile has no resource — move toward a nearby tile that does
        const targetPos = findNearbyResource(world.map, agent.position, resource, 8);
        if (targetPos) {
          const nextPos = getNextStep(world.map.tiles, agent.position, targetPos);
          agent.position = nextPos;
          agent.currentAction = `${resource}を求めて移動中`;
          return { changedChunk: chunkKey(agent.position) };
        }
        // Nothing nearby — fall back to random exploration
        agent.currentAction = `${resource}が見つからず探索中`;
        return executeAction(world, agent, { type: 'explore' });
      }

      const skillLevel = agent.identity.skills.farming ?? 1;
      const amount = gatherFromTile(tile, resource, skillLevel);
      if (amount > 0) {
        addToInventory(agent, resource, amount);
        contributeToVillage(world, agent, resource, amount);
        agent.currentAction = `${resource}を${amount}個採集`;
      }
      return { changedChunk: chunkKey(agent.position) };
    }

    case 'eat': {
      eatFood(agent);
      agent.currentAction = '食事中';
      return {};
    }

    case 'sleep': {
      agent.needs.energy = Math.min(100, agent.needs.energy + SLEEP_RESTORE);
      agent.currentAction = '睡眠中';
      return {};
    }

    case 'farm': {
      const tile = world.map.tiles[agent.position.y][agent.position.x];
      const amount = farmTile(tile, agent.identity.skills.farming ?? 1);
      if (amount > 0) {
        addToInventory(agent, 'food', amount);
        contributeToVillage(world, agent, 'food', amount);
        agent.currentAction = `農作業中（食料+${amount}）`;
      }
      return { changedChunk: chunkKey(agent.position) };
    }

    case 'build': {
      const type = action.structure as StructureType;
      const check = canBuild(world.map, agent.position, type, agent.inventory);
      if (check.ok) {
        // Deduct costs
        const costs = getBuildCost(type);
        for (const [resource, amount] of Object.entries(costs)) {
          agent.inventory[resource as ResourceType] = (agent.inventory[resource as ResourceType] ?? 0) - (amount ?? 0);
        }

        const structure = createStructure(type, agent.position, agent.villageId ?? '', agent.identity.id, world.tick);
        world.structures.set(structure.id, structure);
        world.map.tiles[agent.position.y][agent.position.x].structureId = structure.id;
        agent.currentAction = `${type}を建設中`;

        return {
          event: createEvent(world.gameId, 'construction', world.tick,
            [agent.identity.id],
            `${agent.identity.name}が${type}を建設した（座標 ${agent.position.x},${agent.position.y}）`,
            { structureId: structure.id, type, position: { x: agent.position.x, y: agent.position.y } },
          ),
          changedChunk: chunkKey(agent.position),
        };
      }
      // Build failed — gather the first missing resource
      const costs = getBuildCost(type);
      for (const [resource, needed] of Object.entries(costs)) {
        if ((agent.inventory[resource as ResourceType] ?? 0) < (needed ?? 0)) {
          agent.currentAction = `${type}建設のため${resource}を収集中`;
          return executeAction(world, agent, { type: 'gather', resource });
        }
      }
      // Location issue — explore to find a buildable spot
      return executeAction(world, agent, { type: 'explore' });
    }

    case 'socialize': {
      // If target is specified and not adjacent, pathfind toward them
      if (action.targetId) {
        const target = world.agents.get(action.targetId);
        if (target && target.identity.status !== 'dead') {
          const dist = Math.abs(target.position.x - agent.position.x) + Math.abs(target.position.y - agent.position.y);
          if (dist > 2) {
            // Walk toward the target
            const nextPos = getNextStep(world.map.tiles, agent.position, target.position);
            agent.position = nextPos;
            agent.currentAction = `${target.identity.name}の元へ向かっている`;
            return { changedChunk: chunkKey(agent.position) };
          }
        }
      }
      agent.needs.social = Math.min(100, agent.needs.social + SOCIAL_RESTORE);
      agent.currentAction = '交流中';
      return {};
    }

    case 'craft': {
      // Craft an item — consumes resources, produces a tool or goods
      const hasWood = (agent.inventory.wood ?? 0) >= 2;
      const hasStone = (agent.inventory.stone ?? 0) >= 1;
      if (hasWood && hasStone) {
        agent.inventory.wood = (agent.inventory.wood ?? 0) - 2;
        agent.inventory.stone = (agent.inventory.stone ?? 0) - 1;
        agent.currentAction = '道具を製作中';
        return {
          event: createEvent(world.gameId, 'discovery', world.tick,
            [agent.identity.id],
            `${agent.identity.name}が道具を製作した`,
            { item: action.item }),
        };
      }
      agent.currentAction = '素材不足で製作断念';
      return {};
    }

    case 'teach': {
      // Teach a nearby agent — transfers some skill points
      const student = action.targetId ? world.agents.get(action.targetId) : null;
      if (student && student.identity.status !== 'dead') {
        const dist = Math.abs(student.position.x - agent.position.x) + Math.abs(student.position.y - agent.position.y);
        if (dist <= 2) {
          educateChild(student, agent);
          agent.needs.social = Math.min(100, agent.needs.social + SOCIAL_RESTORE * 0.5);
          agent.currentAction = `${student.identity.name}に教えている`;
          return {};
        }
      }
      agent.currentAction = '教える相手が近くにいない';
      return {};
    }

    case 'heal': {
      // Heal a nearby agent — restore some hunger/energy
      const target = action.targetId ? world.agents.get(action.targetId) : null;
      if (target && target.identity.status !== 'dead') {
        const dist = Math.abs(target.position.x - agent.position.x) + Math.abs(target.position.y - agent.position.y);
        if (dist <= 2) {
          const hasHerbs = (agent.inventory.herbs ?? 0) >= 1;
          if (hasHerbs) {
            agent.inventory.herbs = (agent.inventory.herbs ?? 0) - 1;
            target.needs.hunger = Math.min(100, target.needs.hunger + 20);
            target.needs.energy = Math.min(100, target.needs.energy + 15);
            agent.currentAction = `${target.identity.name}を治療中`;
            return {
              event: createEvent(world.gameId, 'discovery', world.tick,
                [agent.identity.id, target.identity.id],
                `${agent.identity.name}が${target.identity.name}を治療した`,
              ),
            };
          }
        }
      }
      agent.currentAction = '治療できず';
      return {};
    }

    case 'migrate': {
      // F7: Multi-tick pathfinding toward target village
      const targetVillage = world.villages.get(action.targetVillageId);
      if (!targetVillage || targetVillage.territory.length === 0) {
        agent.currentAction = '移住先が見つからず';
        return {};
      }
      const targetPos = targetVillage.territory[0];
      const dist = Math.abs(agent.position.x - targetPos.x) + Math.abs(agent.position.y - targetPos.y);

      if (dist <= 3) {
        // Arrived: leave old village, join new one
        if (agent.villageId) {
          const oldVillage = world.villages.get(agent.villageId);
          if (oldVillage) leaveVillage(agent, oldVillage);
        }
        agent.villageId = targetVillage.id;
        if (!targetVillage.population.includes(agent.identity.id)) {
          targetVillage.population.push(agent.identity.id);
        }
        agent.currentAction = `${targetVillage.name}に移住完了`;

        // Write migration memory
        const memMgr = new MemoryManager(agent.identity.id, world.gameId);
        memMgr.addMemory(`${targetVillage.name}に移住した`, 0.8, world.tick, 'episodic', ['migration']);

        return {
          event: createEvent(world.gameId, 'discovery', world.tick,
            [agent.identity.id],
            `${agent.identity.name}が${targetVillage.name}に移住した`,
            { type: 'migration', targetVillageId: targetVillage.id }),
        };
      }

      // Walk toward target
      const nextPos = getNextStep(world.map.tiles, agent.position, targetPos);
      agent.position = nextPos;
      agent.currentAction = `${targetVillage.name}へ移住中`;
      return { changedChunk: chunkKey(agent.position) };
    }

    case 'explore': {
      // Random walk
      const dx = Math.round(Math.random() * 2 - 1);
      const dy = Math.round(Math.random() * 2 - 1);
      const newX = Math.max(0, Math.min(world.map.size - 1, agent.position.x + dx));
      const newY = Math.max(0, Math.min(world.map.size - 1, agent.position.y + dy));
      const tile = world.map.tiles[newY][newX];
      if ((TERRAIN_MOVEMENT_COST[tile.terrain] ?? Infinity) < Infinity) {
        agent.position = { x: newX, y: newY };
      }
      agent.currentAction = '探索中';
      return { changedChunk: chunkKey(agent.position) };
    }

    case 'rest':
    default: {
      agent.needs.energy = Math.min(100, agent.needs.energy + 5);
      agent.currentAction = '休憩中';
      return {};
    }
  }
}
