/**
 * 4X Strategy tick — army movement, territory, disasters, diplomacy, AI strategy
 * Extracted from simulation.ts (F1, F2, F4, F5)
 */
import type {
  AgentState, GameEvent, Position,
} from '@murasato/shared';
import {
  TERRITORY_EXPANSION_CULTURE_THRESHOLD, TERRITORY_EXPANSION_CHECK_INTERVAL,
  TERRITORY_CONTEST_TENSION_GAIN, OUTPOST_CLAIM_RADIUS, MAX_TERRITORY_RADIUS,
  ARMY_ATTACK_TRIGGER_RANGE, ARMY_PATH_RECOMPUTE_INTERVAL,
  DISASTER_CHECK_INTERVAL, DISASTER_BASE_PROBABILITY,
  AI_TICK_INTERVAL,
} from '@murasato/shared';
import type {
  Covenant,
  Institution,
  Disaster,
  DisasterType,
} from '@murasato/shared';
import { findPath } from './pathfinding.ts';
import { resolveCombat, conquerVillage } from '../engine/combatEngine.ts';
import { areAtWar } from '../social/diplomacy.ts';
import { processVillageTick } from '../engine/ruleEngine.ts';
import { processCommand, type World4XRef } from '../engine/commandProcessor.ts';
import { checkVictory } from '../engine/victoryChecker.ts';
import { paymentTracker } from '../services/x402/paymentTracker.ts';
import {
  generateAICommands,
  generateCovenantCommand,
  generateInventionCommand,
  generateInstitutionCommand,
  type LeaderContext,
} from '../engine/aiStrategy.ts';
import { decayCovenantRelevance } from '../engine/covenantEngine.ts';
import { InventionRegistry, decayInventionRelevance } from '../engine/inventionRegistry.ts';
import { processInstitutionLifecycle, foundInstitution, joinInstitution } from '../engine/institutionEngine.ts';
import { MemoryManager } from '../agent/memory.ts';
import type { WorldState } from './simulation.ts';
import { createEvent, buildWorld4XRef } from './simulation.ts';

// --- Territory generation (diamond shape) ---

export function generateTerritoryDiamond(center: Position, radius: number): Position[] {
  const territory: Position[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (Math.abs(dx) + Math.abs(dy) <= radius) {
        territory.push({ x: center.x + dx, y: center.y + dy });
      }
    }
  }
  return territory;
}

// === F1: Army Movement ===

export function processArmyMovement(world: WorldState, events: GameEvent[]): void {
  for (const [villageId, vs] of world.villageStates4X) {
    for (const army of vs.armies) {
      if (army.status !== 'moving' || !army.targetPosition) continue;

      // Compute/cache path
      if (!army.cachedPath || army.cachedPath.length === 0 || world.tick % ARMY_PATH_RECOMPUTE_INTERVAL === 0) {
        army.cachedPath = findPath(world.map.tiles, army.position, army.targetPosition, 500) ?? undefined;
      }

      if (!army.cachedPath || army.cachedPath.length <= 1) {
        army.status = 'idle';
        army.cachedPath = undefined;
        continue;
      }

      // Move: advance by minimum unit speed (at least 1 step per tick)
      const minSpeed = Math.max(1, Math.min(...army.units.map(u => {
        const def = (globalThis as any).__UNIT_DEFS__?.[u.defId];
        return def?.speed ?? 1;
      })));
      const stepsThisTick = Math.min(minSpeed, army.cachedPath.length - 1);

      for (let step = 0; step < stepsThisTick; step++) {
        army.cachedPath.shift(); // remove current position
        if (army.cachedPath.length > 0) {
          army.position = { ...army.cachedPath[0] };
        }
      }

      // Check arrival
      const distToTarget = Math.abs(army.position.x - army.targetPosition.x) +
                           Math.abs(army.position.y - army.targetPosition.y);

      if (distToTarget <= ARMY_ATTACK_TRIGGER_RANGE) {
        // Check if arrived at enemy village
        for (const [enemyVid, enemyVs] of world.villageStates4X) {
          if (enemyVid === villageId) continue;
          const enemyDist = Math.abs(army.position.x - enemyVs.centerPosition.x) +
                           Math.abs(army.position.y - enemyVs.centerPosition.y);
          if (enemyDist <= ARMY_ATTACK_TRIGGER_RANGE && areAtWar(world.diplomacy, villageId, enemyVid)) {
            // Auto-trigger combat
            const terrain = (world.map.tiles[army.position.y]?.[army.position.x]?.terrain ?? 'plains') as any;
            const result = resolveCombat(vs, enemyVs, army.units, [...enemyVs.garrison], terrain);
            result.position = army.position;

            if (result.attackerWon && enemyVs.garrison.filter(u => u.count > 0).length === 0) {
              conquerVillage(vs, enemyVs);
            }
            enemyVs.garrison = enemyVs.garrison.filter(u => u.count > 0);

            events.push(createEvent(world.gameId, 'war', world.tick, [],
              `軍隊が${enemyVid}に到着し戦闘が発生`, { combatResult: result }));

            army.status = 'idle';
            army.cachedPath = undefined;
            break;
          }
        }

        if (army.status === 'moving') {
          army.status = 'idle';
          army.cachedPath = undefined;
        }
      }
    }

    // Clean up armies with no units
    vs.armies = vs.armies.filter(a => a.units.some(u => u.count > 0));
  }
}

// === F2: Territory Expansion ===

export function processTerritoryExpansion(world: WorldState, events: GameEvent[]): void {
  if (world.tick % TERRITORY_EXPANSION_CHECK_INTERVAL !== 0) return;

  for (const [villageId, vs] of world.villageStates4X) {
    if (vs.culturePoints < TERRITORY_EXPANSION_CULTURE_THRESHOLD) continue;

    // Find best adjacent tile not in territory
    const territorySet = new Set(vs.territory.map(p => `${p.x},${p.y}`));
    let bestTile: Position | null = null;
    let bestYield = -1;

    for (const pos of vs.territory) {
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = pos.x + dx;
        const ny = pos.y + dy;
        if (nx < 0 || nx >= world.map.size || ny < 0 || ny >= world.map.size) continue;
        if (territorySet.has(`${nx},${ny}`)) continue;

        const tile = world.map.tiles[ny][nx];
        if (tile.terrain === 'water') continue;

        // Check within MAX_TERRITORY_RADIUS
        const distToCenter = Math.abs(nx - vs.centerPosition.x) + Math.abs(ny - vs.centerPosition.y);
        if (distToCenter > MAX_TERRITORY_RADIUS) continue;

        // Compute yield score
        const tileYield = Object.values(tile.resources).reduce((sum, v) => sum + (v ?? 0), 0) + tile.fertility * 5;
        if (tileYield > bestYield) {
          bestYield = tileYield;
          bestTile = { x: nx, y: ny };
        }
      }
    }

    if (bestTile) {
      vs.territory.push(bestTile);
      vs.culturePoints -= TERRITORY_EXPANSION_CULTURE_THRESHOLD;

      // Check contested territory
      for (const [otherVid, otherVs] of world.villageStates4X) {
        if (otherVid === villageId) continue;
        if (otherVs.territory.some(p => p.x === bestTile!.x && p.y === bestTile!.y)) {
          world.diplomacy.adjustTension(villageId, otherVid, TERRITORY_CONTEST_TENSION_GAIN);
        }
      }

      events.push(createEvent(world.gameId, 'discovery', world.tick, [],
        `村${villageId}が領土を拡張 (${bestTile.x},${bestTile.y})`,
        { villageId, position: bestTile }));
    }

    // Outpost claim: check newly completed outposts
    for (const building of vs.buildings) {
      if (building.defId !== 'outpost') continue;
      // Only claim once (check if area already claimed)
      const pos = building.position;
      const alreadyClaimed = vs.territory.some(p =>
        Math.abs(p.x - pos.x) <= 1 && Math.abs(p.y - pos.y) <= 1);
      if (alreadyClaimed) continue;

      // Claim diamond area around outpost
      for (let dx = -OUTPOST_CLAIM_RADIUS; dx <= OUTPOST_CLAIM_RADIUS; dx++) {
        for (let dy = -OUTPOST_CLAIM_RADIUS; dy <= OUTPOST_CLAIM_RADIUS; dy++) {
          if (Math.abs(dx) + Math.abs(dy) > OUTPOST_CLAIM_RADIUS) continue;
          const nx = pos.x + dx;
          const ny = pos.y + dy;
          if (nx < 0 || nx >= world.map.size || ny < 0 || ny >= world.map.size) continue;
          if (world.map.tiles[ny][nx].terrain === 'water') continue;
          if (!territorySet.has(`${nx},${ny}`)) {
            vs.territory.push({ x: nx, y: ny });
            territorySet.add(`${nx},${ny}`);
          }
        }
      }
    }
  }
}

// === F4: Natural Disasters ===

export function processDisasters(world: WorldState, events: GameEvent[]): void {
  // Tick down active disasters
  for (let i = world.activeDisasters.length - 1; i >= 0; i--) {
    const disaster = world.activeDisasters[i];
    disaster.remainingTicks--;

    if (disaster.remainingTicks <= 0) {
      world.activeDisasters.splice(i, 1);
      events.push(createEvent(world.gameId, 'disaster', world.tick, [],
        `災害「${disaster.type}」が終息した`, { disasterType: disaster.type }));
      continue;
    }

    // Apply per-tick effects to affected villages
    for (const vid of disaster.affectedVillageIds) {
      const vs = world.villageStates4X.get(vid);
      if (!vs) continue;

      switch (disaster.type) {
        case 'drought': {
          // Reduce fertility of tiles in radius
          for (const pos of vs.territory) {
            const dist = Math.abs(pos.x - disaster.centerPosition.x) + Math.abs(pos.y - disaster.centerPosition.y);
            if (dist <= disaster.radius) {
              const tile = world.map.tiles[pos.y]?.[pos.x];
              if (tile) tile.fertility = Math.max(0, tile.fertility - 0.005 * disaster.severity);
            }
          }
          break;
        }
        case 'plague': {
          // Population loss per tick
          const loss = Math.max(0, Math.floor(vs.population * 0.01 * disaster.severity));
          if (loss > 0) vs.population = Math.max(1, vs.population - loss);
          break;
        }
        case 'locust': {
          // Food destruction per tick
          const foodLoss = Math.floor(5 * disaster.severity);
          vs.resources.food = Math.max(0, vs.resources.food - foodLoss);
          break;
        }
        // flood and earthquake are one-shot (handled at creation)
      }
    }
  }

  // Check for new disasters
  if (world.tick % DISASTER_CHECK_INTERVAL !== 0) return;
  if (Math.random() > DISASTER_BASE_PROBABILITY) return;

  // Pick a random village as center
  const villageIds = [...world.villageStates4X.keys()];
  if (villageIds.length === 0) return;
  const targetVid = villageIds[Math.floor(Math.random() * villageIds.length)];
  const targetVs = world.villageStates4X.get(targetVid);
  if (!targetVs) return;

  const types: DisasterType[] = ['drought', 'flood', 'plague', 'locust', 'earthquake'];
  const type = types[Math.floor(Math.random() * types.length)];
  const severity = 0.5 + Math.random() * 0.5;
  const radius = 5 + Math.floor(Math.random() * 5);

  // Find affected villages
  const affectedVillageIds: string[] = [];
  for (const [vid, vs] of world.villageStates4X) {
    const dist = Math.abs(vs.centerPosition.x - targetVs.centerPosition.x) +
                 Math.abs(vs.centerPosition.y - targetVs.centerPosition.y);
    if (dist <= radius) affectedVillageIds.push(vid);
  }

  const disaster: Disaster = {
    id: `dis_${crypto.randomUUID()}`,
    type,
    centerPosition: { ...targetVs.centerPosition },
    radius,
    remainingTicks: type === 'flood' || type === 'earthquake' ? 1 : 50 + Math.floor(Math.random() * 50),
    severity,
    affectedVillageIds,
  };

  // One-shot effects for flood/earthquake
  if (type === 'flood') {
    for (const vid of affectedVillageIds) {
      const vs = world.villageStates4X.get(vid);
      if (!vs) continue;
      // Destroy buildings near water/swamp tiles
      vs.buildings = vs.buildings.filter(b => {
        const tile = world.map.tiles[b.position.y]?.[b.position.x];
        if (tile && (tile.terrain === 'swamp') && Math.random() < severity * 0.3) {
          return false; // destroyed
        }
        return true;
      });
    }
  } else if (type === 'earthquake') {
    for (const vid of affectedVillageIds) {
      const vs = world.villageStates4X.get(vid);
      if (!vs) continue;
      // Damage buildings near mountain tiles
      for (const b of vs.buildings) {
        const tile = world.map.tiles[b.position.y]?.[b.position.x];
        if (tile && tile.terrain === 'mountain' && Math.random() < severity * 0.4) {
          b.health = Math.max(0, b.health - Math.floor(40 * severity));
        }
      }
      vs.buildings = vs.buildings.filter(b => b.health > 0);
    }
  }

  world.activeDisasters.push(disaster);
  events.push(createEvent(world.gameId, 'disaster', world.tick, [],
    `災害「${type}」が発生！（${targetVs.centerPosition.x},${targetVs.centerPosition.y}付近）`,
    { disasterType: type, severity, affectedVillages: affectedVillageIds }));
}

// === F5: Derive diplomatic status for a village ===

export function deriveVillageDiplomaticStatus(world: WorldState, villageId: string): string | undefined {
  const allRelations = world.diplomacy.getAllRelations();
  for (const rel of allRelations) {
    if ((rel.villageId1 === villageId || rel.villageId2 === villageId) && rel.status === 'war') {
      return 'war';
    }
  }
  return undefined;
}

// --- Village leader context ---

export function buildLeaderContext(world: WorldState, villageId: string): LeaderContext | null {
  const village = world.villages.get(villageId);
  if (!village) return null;

  const leaderId = village.governance.leaderId;
  if (!leaderId) return null;

  const leader = world.agents.get(leaderId);
  if (!leader || leader.identity.status === 'dead') return null;

  // 記憶を取得
  const memoryMgr = new MemoryManager(leaderId, world.gameId);
  const memories = memoryMgr.getTopMemories(world.tick, 10);

  // 人間関係を取得
  const relationships = world.relationships.get(leaderId) ?? [];

  // 全エージェント名のマップ
  const agentNames = new Map<string, string>();
  for (const [id, a] of world.agents) {
    agentNames.set(id, a.identity.name);
  }

  // ブループリント情報（魂テキスト、行動規則）
  let soulText: string | undefined;
  let behaviorRules: string[] | undefined;
  if (leader.identity.blueprintId) {
    const bp = world.blueprints.get(leader.identity.blueprintId);
    if (bp) {
      soulText = bp.soul;
      behaviorRules = bp.rules;
    }
  }

  return {
    leader,
    villageName: village.name,
    memories,
    relationships,
    agentNames,
    soulText,
    behaviorRules,
  };
}

// --- 4X Strategy Tick ---

export async function run4XTick(world: WorldState): Promise<GameEvent[]> {
  const events: GameEvent[] = [];

  // F1: Process army movement first
  processArmyMovement(world, events);

  // F2: Territory expansion
  processTerritoryExpansion(world, events);

  // F4: Natural disasters
  processDisasters(world, events);

  // Process each village's 4X state
  for (const [villageId, vs] of world.villageStates4X) {
    // Sync population from social layer
    const village = world.villages.get(villageId);
    if (village) {
      const livingPop = village.population.filter(id => {
        const a = world.agents.get(id);
        return a && a.identity.status !== 'dead';
      }).length;
      vs.population = Math.max(vs.population, livingPop);
    }

    // Gather territory tiles
    const territoryTiles = vs.territory
      .map(pos => world.map.tiles[pos.y]?.[pos.x])
      .filter((t): t is NonNullable<typeof t> => !!t);

    // F5: Derive diplomatic status for this village
    const dipStatus = deriveVillageDiplomaticStatus(world, villageId);

    // Run economic tick (with Autonomous World state for Layer 1-3 effects)
    // Dojo: オンチェーン実行 → フォールバック
    const tickResultRaw = world.dojoBridge?.isEnabled()
      ? await world.dojoBridge.executeVillageTick(
          villageId, vs, territoryTiles, world.autonomousWorld, world.tick,
        )
      : processVillageTick(vs, territoryTiles, world.autonomousWorld, world.tick, dipStatus);

    const tickResult = tickResultRaw;

    // Merge on-chain events into the event stream
    if ('onChainEvents' in tickResult) {
      const onChainEvts = (tickResult as any).onChainEvents as import('@murasato/shared').GameEvent[];
      for (const evt of onChainEvts) {
        // Inject correct gameId (the bridge doesn't know it)
        evt.gameId = world.gameId;
        events.push(evt);
      }
    }

    // Emit events for completed items
    for (const completedId of tickResult.queueCompleted) {
      events.push(createEvent(world.gameId, 'construction', world.tick,
        [], `村${villageId}でキューアイテム完了: ${completedId}`, { villageId, itemId: completedId }));
    }

    if (tickResult.starvation) {
      events.push(createEvent(world.gameId, 'death', world.tick,
        [], `村${villageId}で飢餓が発生`, { villageId, populationLost: -tickResult.populationDelta }));
    }
  }

  // AI villages generate commands (LLM-driven via village leader)
  if (world.tick % AI_TICK_INTERVAL === 0) {
    const worldRef = buildWorld4XRef(world);

    // Build village name map for neighbor display
    const allVillageNames = new Map<string, string>();
    for (const [vid, v] of world.villages) {
      allVillageNames.set(vid, v.name);
    }

    for (const [villageId, vs] of world.villageStates4X) {
      if (vs.ownerId !== null) continue; // プレイヤー所有村はスキップ

      // 村長コンテキストを構築
      const leaderCtx = buildLeaderContext(world, villageId);

      const commands = await generateAICommands(
        vs, world.villageStates4X, world.diplomacy.getAllRelations(),
        leaderCtx ?? undefined, allVillageNames,
      );

      for (const cmd of commands) {
        // Dojo: オンチェーンコマンド実行 → フォールバック
        const result = world.dojoBridge?.isEnabled()
          ? await world.dojoBridge.executeCommand(cmd, villageId, worldRef)
          : processCommand(cmd, villageId, worldRef);
        if (!result.success) continue;

        // 戦闘結果をイベント化
        if (cmd.type === 'attack' && result.data?.combatResult) {
          events.push(createEvent(world.gameId, 'war', world.tick,
            [], `AI村${villageId}が戦闘を実行`, { combatResult: result.data.combatResult }));
        }
      }

      // 村長の戦略的思考をイベントとして記録
      if (leaderCtx) {
        const leader = leaderCtx.leader;
        events.push(createEvent(world.gameId, 'diplomacy', world.tick,
          [leader.identity.id],
          `${leader.identity.name}（${leaderCtx.villageName}村長）が戦略会議を行った`,
          { villageId, commandCount: commands.length },
        ));

        // === Autonomous World: Layer 1-3 コマンド生成 ===
        // 毎回ではなく確率的に発動（LLMコスト制御）

        // Layer 1: Covenant 提案 (20% chance per AI tick)
        if (Math.random() < 0.2) {
          const covenantCmd = await generateCovenantCommand(
            vs, leaderCtx, world.autonomousWorld, world.villageStates4X,
            world.diplomacy.getAllRelations(), allVillageNames, world.tick,
          );
          if (covenantCmd && covenantCmd.type === 'propose_covenant') {
            const covenant: Covenant = {
              id: `cov_${crypto.randomUUID()}`,
              villageId: covenantCmd.villageId,
              scope: covenantCmd.scope,
              targetVillageId: covenantCmd.targetVillageId,
              name: covenantCmd.name,
              description: covenantCmd.description,
              clauses: covenantCmd.clauses,
              proposedByAgentId: leader.identity.id,
              ratifiedByAgentIds: [leader.identity.id],
              enactedAtTick: world.tick,
              expiresAtTick: null,
              repealedAtTick: null,
              relevance: 1.0,
            };
            world.autonomousWorld.covenants.set(covenant.id, covenant);
            events.push(createEvent(world.gameId, 'election', world.tick,
              [leader.identity.id],
              `${leaderCtx.villageName}で「${covenant.name}」が制定された`,
              { type: 'covenant_enacted', covenantId: covenant.id, covenantName: covenant.name },
            ));

            // Dojo: オンチェーンにも提案
            if (world.dojoBridge?.isEnabled()) {
              const scopeMap: Record<string, number> = { village: 0, bilateral: 1, global: 2 };
              world.dojoBridge.proposeCovenant(
                villageId, scopeMap[covenantCmd.scope] ?? 0,
                covenantCmd.targetVillageId ?? null,
                covenant.name, covenantCmd.clauses as any,
              ).catch((err) => console.warn('[DojoBridge] proposeCovenant bg error:', err));
            }
          }
        }

        // Layer 2: 発明 (10% chance per AI tick)
        if (Math.random() < 0.1) {
          const invention = await generateInventionCommand(
            vs, leaderCtx, world.autonomousWorld, world.tick,
          );
          if (invention) {
            events.push(createEvent(world.gameId, 'discovery', world.tick,
              [leader.identity.id],
              `${leaderCtx.villageName}で「${invention.name}」が発明された (${invention.type})`,
              { type: 'invention_registered', inventionId: invention.id, inventionName: invention.name },
            ));

            // Dojo: オンチェーンにも登録
            if (world.dojoBridge?.isEnabled()) {
              const invTypeMap: Record<string, number> = { building: 0, tech: 1, unit: 2 };
              const def = invention.definition as Record<string, any>;
              const totalCost = def.researchCost ?? def.cost ?? 0;
              const effects = (def.effects ?? []).map((e: any) => ({
                effectType: e.type ?? 0,
                value: e.value ?? 0,
              }));
              world.dojoBridge.registerInvention(
                villageId,
                invTypeMap[invention.type] ?? 0,
                invention.name,
                totalCost,
                effects,
              ).catch((err) => console.warn('[DojoBridge] registerInvention bg error:', err));
            }
          }
        }

        // Layer 3: 制度創設・加入 (10% chance per AI tick)
        if (Math.random() < 0.1) {
          const instCmd = await generateInstitutionCommand(
            vs, leaderCtx, world.autonomousWorld, world.villageStates4X,
            world.diplomacy.getAllRelations(), allVillageNames, world.tick,
          );
          if (instCmd) {
            if (instCmd.type === 'found_institution') {
              const inst: Institution = {
                id: `inst_${crypto.randomUUID()}`,
                name: instCmd.name,
                type: instCmd.institutionType,
                founderAgentId: leader.identity.id,
                description: instCmd.description,
                charter: instCmd.charter,
                memberVillageIds: [villageId],
                memberEffects: instCmd.memberEffects,
                joinRequirements: instCmd.joinRequirements,
                foundedAtTick: world.tick,
                treasury: {},
                relevance: 1.0,
              };
              const result = foundInstitution(inst, world.autonomousWorld);
              if (result.success) {
                events.push(createEvent(world.gameId, 'discovery', world.tick,
                  [leader.identity.id],
                  `${leaderCtx.villageName}が「${inst.name}」を創設した`,
                  { type: 'institution_founded', institutionId: inst.id, institutionName: inst.name },
                ));

                // Dojo: オンチェーンにも創設
                if (world.dojoBridge?.isEnabled()) {
                  const instTypeMap: Record<string, number> = {
                    guild: 0, religion: 1, alliance: 2, academy: 3, custom: 4,
                  };
                  const effectTypeMap: Record<string, number> = {
                    resource_production: 0, resource_storage: 1, housing: 2,
                    research_points: 3, culture_points: 4, tile_yield_mod: 5,
                    attack_bonus: 6, defense_bonus: 7, unit_training_speed: 8,
                    build_speed: 9, population_growth: 10, food_consumption_mod: 11,
                    trade_income: 12, vision_range: 13, fortification: 14,
                    heal_per_tick: 15, unlock_unit: 16, unlock_building: 17,
                  };
                  world.dojoBridge.foundInstitution(
                    villageId,
                    instTypeMap[inst.type] ?? 4,
                    inst.name,
                    inst.memberEffects.map((e) => ({
                      effectType: effectTypeMap[e.type] ?? 0,
                      value: e.value ?? 0,
                    })),
                  ).catch((err) => console.warn('[DojoBridge] foundInstitution bg error:', err));
                }
              }
            } else if (instCmd.type === 'join_institution') {
              const result = joinInstitution(villageId, instCmd.institutionId, vs, world.autonomousWorld);
              if (result.success) {
                const inst = world.autonomousWorld.institutions.get(instCmd.institutionId);
                events.push(createEvent(world.gameId, 'diplomacy', world.tick,
                  [leader.identity.id],
                  `${leaderCtx.villageName}が「${inst?.name ?? instCmd.institutionId}」に加入した`,
                  { type: 'institution_joined', institutionId: instCmd.institutionId },
                ));
              }
            }
          }
        }
      }
    }
  }

  // === Trade tick (F8) ===
  // Execute on-chain trade routes via DojoBridge
  if (world.dojoBridge?.isEnabled()) {
    // Collect all active trade route IDs from village states
    const activeRouteIds: number[] = [];
    for (const vs of world.villageStates4X.values()) {
      for (const route of vs.tradeRoutes) {
        // Route IDs are stored as strings, try to parse as number for on-chain
        const routeNum = parseInt(route.id, 10);
        if (!isNaN(routeNum)) {
          activeRouteIds.push(routeNum);
        }
      }
    }
    if (activeRouteIds.length > 0) {
      world.dojoBridge.executeTradeTick(activeRouteIds).catch(
        (err) => console.warn('[DojoBridge] executeTradeTick bg error:', err),
      );
    }
  }

  // === Autonomous World: ライフサイクル処理 ===

  // Layer 1: Covenant relevance 減衰
  decayCovenantRelevance(world.autonomousWorld);

  // Layer 2: 発明 relevance 減衰 + 知識伝播
  decayInventionRelevance(world.autonomousWorld);
  const inventionRegistry = new InventionRegistry(world.autonomousWorld);
  inventionRegistry.spreadKnowledge(world.villageStates4X, world.tick);

  // Layer 3: 制度ライフサイクル（メンバー不在で衰退・解散）
  const dissolved = processInstitutionLifecycle(world.autonomousWorld);

  // Dojo: オンチェーンでもdecay/lifecycle実行
  if (world.dojoBridge?.isEnabled()) {
    Promise.all([
      world.dojoBridge.decayCovenants(),
      world.dojoBridge.decayInventions(),
      world.dojoBridge.processInstitutionLifecycle(),
    ]).catch((err) => console.warn('[DojoBridge] lifecycle bg error:', err));
  }
  for (const name of dissolved) {
    events.push(createEvent(world.gameId, 'discovery', world.tick,
      [], `組織「${name}」が解散した`,
      { type: 'institution_dissolved', institutionName: name },
    ));
  }

  // Victory check
  const villageRevenueUSD = paymentTracker.getRevenueByEntity();
  const victoryResult = checkVictory({
    villageStates: world.villageStates4X,
    diplomacy: world.diplomacy.getAllRelations(),
    tick: world.tick,
    villageRevenueUSD,
  });

  if (victoryResult) {
    events.push(createEvent(world.gameId, 'discovery', world.tick,
      [], `勝利条件達成! ${victoryResult.victoryType} by ${victoryResult.winnerId}`,
      { victory: victoryResult }));

    // Dojo: オンチェーンでも勝利チェック
    if (world.dojoBridge?.isEnabled()) {
      world.dojoBridge.checkVictory(victoryResult.villageId).catch(
        (err) => console.warn('[DojoBridge] checkVictory bg error:', err),
      );
    }
  }

  return events;
}
