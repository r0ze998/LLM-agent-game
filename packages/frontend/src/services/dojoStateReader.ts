/**
 * dojoStateReader.ts — オンチェーン状態リーダー (フロントエンド版)
 *
 * サーバーの dojoStateReader.ts からポート。
 * RpcProvider.callContract() で Dojo World からモデルデータを読み取る。
 *
 * Dojo v1.5 では entity() に Layout パラメータが必要。
 * Layout はモデルコントラクトの layout() 関数を呼んで動的に取得する。
 */

import { RpcProvider } from 'starknet';
import { MODEL_SELECTORS } from './dojoConfig.ts';

// ── Types ──

export interface OnChainVillage {
  villageId: number;
  population: number;
  housing: number;
  food: number;
  wood: number;
  stone: number;
  iron: number;
  gold: number;
  researchPoints: number;
  culturePoints: number;
  score: number;
}

export interface BuildingInstance {
  villageId: number;
  buildingId: number;
  defId: number;
  hp: number;
  posX: number;
  posY: number;
}

export interface ArmyUnit {
  villageId: number;
  unitDefId: number;
  count: number;
  veterancy: number;
}

// ── Reader ──

export class DojoStateReader {
  private provider: RpcProvider;
  private worldAddress: string;
  /** Cache: model selector → layout calldata (from model contract's layout()) */
  private layoutCache: Map<string, string[]> = new Map();
  /** Cache: model selector → model contract address */
  private modelAddrCache: Map<string, string> = new Map();

  constructor(provider: RpcProvider, worldAddress: string) {
    this.provider = provider;
    this.worldAddress = worldAddress;
  }

  async readVillage(villageId: number): Promise<OnChainVillage | null> {
    try {
      const result = await this.getEntity('Village', [villageId]);
      // Village fields (19): owner(0), food(1)..gold(5), storage(6..10),
      // population(11), housing(12), research(13), culture(14), total_culture(15),
      // score(16), founded_at(17), last_tick(18)
      if (!result || result.length < 17) return null;

      return {
        villageId,
        population: Number(result[11]),
        housing: Number(result[12]),
        food: this.fromFixed1000(result[1]),
        wood: this.fromFixed1000(result[2]),
        stone: this.fromFixed1000(result[3]),
        iron: this.fromFixed1000(result[4]),
        gold: this.fromFixed1000(result[5]),
        researchPoints: this.fromFixed1000(result[13]),
        culturePoints: this.fromFixed1000(result[14]),
        score: Number(result[16]),
      };
    } catch {
      return null;
    }
  }

  async readBuildings(villageId: number): Promise<BuildingInstance[]> {
    const buildings: BuildingInstance[] = [];
    try {
      const counterResult = await this.getEntity('BuildingCounter', [villageId]);
      const count = counterResult ? Number(counterResult[0]) : 0;

      for (let i = 1; i <= count; i++) {
        const result = await this.getEntity('Building', [villageId, i]);
        if (result && result.length >= 4) {
          buildings.push({
            villageId,
            buildingId: i,
            defId: Number(result[0]),
            hp: Number(result[1]),
            posX: Number(result[2]),
            posY: Number(result[3]),
          });
        }
      }
    } catch {
      // ignore
    }
    return buildings;
  }

  async readGarrison(villageId: number): Promise<ArmyUnit[]> {
    const units: ArmyUnit[] = [];
    for (let unitDefId = 1; unitDefId <= 10; unitDefId++) {
      try {
        const result = await this.getEntity('GarrisonUnit', [villageId, unitDefId]);
        if (result && result.length >= 2) {
          const count = Number(result[0]);
          if (count > 0) {
            units.push({
              villageId,
              unitDefId,
              count,
              veterancy: this.fromFixed1000(result[1]),
            });
          }
        }
      } catch {
        // ignore
      }
    }
    return units;
  }

  async readResearchedTechs(villageId: number): Promise<Set<number>> {
    const techs = new Set<number>();
    for (let techId = 1; techId <= 30; techId++) {
      try {
        const result = await this.getEntity('ResearchedTech', [villageId, techId]);
        if (result && result.length >= 1 && Number(result[0]) === 1) {
          techs.add(techId);
        }
      } catch {
        // ignore
      }
    }
    return techs;
  }

  async readGameConfig(): Promise<{ currentTick: number; initialized: boolean }> {
    try {
      const result = await this.getEntity('GameConfig', [0]);
      // GameConfig fields (4): current_tick(0), tick_interval(1), max_villages(2), initialized(3)
      if (result && result.length >= 4) {
        return {
          currentTick: Number(result[0]),
          initialized: Number(result[3]) === 1,
        };
      }
    } catch {
      // ignore
    }
    return { currentTick: 0, initialized: false };
  }

  async readBuildQueue(villageId: number): Promise<Array<{ defId: number; posX: number; posY: number; completionTick: number }>> {
    const items: Array<{ defId: number; posX: number; posY: number; completionTick: number }> = [];
    try {
      const counterResult = await this.getEntity('BuildQueueCounter', [villageId]);
      const count = counterResult ? Number(counterResult[0]) : 0;

      for (let i = 1; i <= count; i++) {
        const result = await this.getEntity('BuildQueue', [villageId, i]);
        if (result && result.length >= 4) {
          items.push({
            defId: Number(result[0]),
            posX: Number(result[1]),
            posY: Number(result[2]),
            completionTick: Number(result[3]),
          });
        }
      }
    } catch {
      // ignore
    }
    return items;
  }

  async readResearchQueue(villageId: number): Promise<Array<{ techId: number; completionTick: number }>> {
    const items: Array<{ techId: number; completionTick: number }> = [];
    try {
      const result = await this.getEntity('ResearchQueue', [villageId]);
      if (result && result.length >= 2) {
        const techId = Number(result[0]);
        const completionTick = Number(result[1]);
        if (techId > 0) {
          items.push({ techId, completionTick });
        }
      }
    } catch {
      // ignore
    }
    return items;
  }

  async readTrainQueue(villageId: number): Promise<Array<{ unitDefId: number; count: number; completionTick: number }>> {
    const items: Array<{ unitDefId: number; count: number; completionTick: number }> = [];
    try {
      const counterResult = await this.getEntity('TrainQueueCounter', [villageId]);
      const count = counterResult ? Number(counterResult[0]) : 0;

      for (let i = 1; i <= count; i++) {
        const result = await this.getEntity('TrainQueue', [villageId, i]);
        if (result && result.length >= 3) {
          items.push({
            unitDefId: Number(result[0]),
            count: Number(result[1]),
            completionTick: Number(result[2]),
          });
        }
      }
    } catch {
      // ignore
    }
    return items;
  }

  // ── Internal ──

  /** Fetch the Layout calldata from model contract's layout() function */
  private async fetchModelLayout(modelSelector: string): Promise<string[]> {
    const cached = this.layoutCache.get(modelSelector);
    if (cached) return cached;

    // Step 1: Get model contract address from world.resource(selector)
    let modelAddr = this.modelAddrCache.get(modelSelector);
    if (!modelAddr) {
      const resourceRaw = await this.provider.callContract({
        contractAddress: this.worldAddress,
        entrypoint: 'resource',
        calldata: [modelSelector],
      });
      const resourceResult: string[] = Array.isArray(resourceRaw)
        ? resourceRaw
        : (resourceRaw as any).result ?? [];
      modelAddr = resourceResult[1];
      this.modelAddrCache.set(modelSelector, modelAddr);
    }

    // Step 2: Call layout() on the model contract
    const layoutRaw = await this.provider.callContract({
      contractAddress: modelAddr,
      entrypoint: 'layout',
      calldata: [],
    });
    const layout: string[] = Array.isArray(layoutRaw)
      ? layoutRaw
      : (layoutRaw as any).result ?? [];

    this.layoutCache.set(modelSelector, layout);
    return layout;
  }

  private async getEntity(
    modelName: string,
    keys: number[],
  ): Promise<string[] | null> {
    try {
      const modelSelector = MODEL_SELECTORS[modelName as keyof typeof MODEL_SELECTORS];
      if (!modelSelector) return null;

      const keysAsHex = keys.map((k) => `0x${k.toString(16)}`);
      const layout = await this.fetchModelLayout(modelSelector);

      // Dojo v1.5 entity(model_selector, ModelIndex::Keys, Layout)
      // ModelIndex::Keys = enum variant 0 + Span<felt252>
      // Layout = raw output from model.layout() (already serialized)
      const calldata = [
        modelSelector,
        '0', keysAsHex.length.toString(), ...keysAsHex,  // ModelIndex::Keys(keys)
        ...layout,                                        // Layout (from model contract)
      ];

      const raw = await this.provider.callContract({
        contractAddress: this.worldAddress,
        entrypoint: 'entity',
        calldata,
      });

      const result: string[] = Array.isArray(raw) ? raw : (raw as any).result ?? [];

      // Dojo returns [length, ...values]
      if (result.length < 2) return null;
      const len = Number(result[0]);
      return result.slice(1, 1 + len);
    } catch {
      return null;
    }
  }

  private fromFixed1000(hex: string | bigint): number {
    return Number(BigInt(hex)) / 1000;
  }
}
