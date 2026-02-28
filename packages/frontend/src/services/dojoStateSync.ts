/**
 * dojoStateSync.ts — 定期的にオンチェーンstateを読み取りストアに反映
 */

import { DojoStateReader } from './dojoStateReader.ts';
import { VillageIdMapper, BUILDING_U32_TO_STR, TECH_U32_TO_STR, UNIT_U32_TO_STR } from './dojoSync.ts';
import { useGameStore } from '../store/gameStore.ts';
import type { VillageState4XSerialized } from '@murasato/shared';

const LOG_PREFIX = '[DojoSync]';

export class DojoStateSync {
  private reader: DojoStateReader;
  private villageMapper: VillageIdMapper;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(reader: DojoStateReader, villageMapper: VillageIdMapper) {
    this.reader = reader;
    this.villageMapper = villageMapper;
  }

  /** 単一村をオンチェーンから読み取りストアに反映 */
  async syncVillage(villageUuid: string): Promise<void> {
    const u32Id = this.villageMapper.toU32(villageUuid);
    if (u32Id === undefined) return;

    try {
      const [onChain, buildings, garrison, techs] = await Promise.all([
        this.reader.readVillage(u32Id),
        this.reader.readBuildings(u32Id),
        this.reader.readGarrison(u32Id),
        this.reader.readResearchedTechs(u32Id),
      ]);

      if (!onChain) return;

      // Get existing state to preserve fields not on-chain
      const store = useGameStore.getState();
      const existing = store.village4xStates.get(villageUuid);

      const state: VillageState4XSerialized = {
        villageId: villageUuid,
        ownerId: existing?.ownerId ?? null,
        centerPosition: existing?.centerPosition ?? { x: 0, y: 0 },
        resources: {
          food: onChain.food,
          wood: onChain.wood,
          stone: onChain.stone,
          iron: onChain.iron,
          gold: onChain.gold,
        },
        resourceStorage: existing?.resourceStorage ?? {
          food: 1000,
          wood: 1000,
          stone: 1000,
          iron: 1000,
          gold: 1000,
        },
        population: onChain.population,
        housingCapacity: onChain.housing,
        researchPoints: onChain.researchPoints,
        culturePoints: onChain.culturePoints,
        totalCulturePoints: existing?.totalCulturePoints ?? onChain.culturePoints,
        researchedTechs: [...techs].map((id) => TECH_U32_TO_STR[id] ?? `tech_${id}`),
        buildings: buildings.map((b) => ({
          id: `b_${b.buildingId}`,
          defId: BUILDING_U32_TO_STR[b.defId] ?? `building_${b.defId}`,
          position: { x: b.posX, y: b.posY },
          level: 1,
          health: b.hp,
          maxHealth: b.hp,
          builtAtTick: 0,
        })),
        armies: existing?.armies ?? [],
        garrison: garrison.map((u) => ({
          defId: UNIT_U32_TO_STR[u.unitDefId] ?? `unit_${u.unitDefId}`,
          count: u.count,
          veterancy: u.veterancy,
        })),
        buildQueue: existing?.buildQueue ?? [],
        researchQueue: existing?.researchQueue ?? [],
        trainQueue: existing?.trainQueue ?? [],
        tradeRoutes: existing?.tradeRoutes ?? [],
        territory: existing?.territory ?? [],
        foundedAtTick: existing?.foundedAtTick ?? 0,
        score: onChain.score,
        totalGoldEarned: existing?.totalGoldEarned ?? 0,
      };

      store.updateVillage4X(state);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Sync failed (${villageUuid}):`, err);
    }
  }

  /** 全登録村を同期 */
  async syncAllVillages(): Promise<void> {
    const entries = this.villageMapper.entries();
    for (const [uuid] of entries) {
      await this.syncVillage(uuid);
    }
  }

  /** ポーリング開始 */
  startPolling(intervalMs = 3000): void {
    if (this.intervalId !== null) return;
    console.log(`${LOG_PREFIX} Polling started (${intervalMs}ms)`);
    this.intervalId = setInterval(() => {
      this.syncAllVillages().catch((err) =>
        console.warn(`${LOG_PREFIX} Poll error:`, err),
      );
    }, intervalMs);
  }

  /** ポーリング停止 */
  stopPolling(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`${LOG_PREFIX} Polling stopped`);
    }
  }
}
