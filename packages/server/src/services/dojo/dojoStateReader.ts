/**
 * dojoStateReader.ts — On-chain state reader
 *
 * Reads model data from the Dojo World via RpcProvider.callContract()
 * and converts x1000 fixed-point values to float.
 */

import { RpcProvider, hash } from "starknet";

// ── On-chain village data ──

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
  veterancy: number; // ×1000 → float
}

// ── Reader ──

export class DojoStateReader {
  private provider: RpcProvider;
  private worldAddress: string;
  private namespace: string;

  constructor(rpcUrl: string, worldAddress: string, namespace = "aw") {
    this.provider = new RpcProvider({ nodeUrl: rpcUrl });
    this.worldAddress = worldAddress;
    this.namespace = namespace;
  }

  /** Read village data */
  async readVillage(villageId: number): Promise<OnChainVillage | null> {
    try {
      const result = await this.getEntity("Village", [villageId]);
      if (!result || result.length < 10) return null;

      return {
        villageId,
        population: Number(result[0]),
        housing: Number(result[1]),
        food: this.fromFixed1000(result[2]),
        wood: this.fromFixed1000(result[3]),
        stone: this.fromFixed1000(result[4]),
        iron: this.fromFixed1000(result[5]),
        gold: this.fromFixed1000(result[6]),
        researchPoints: this.fromFixed1000(result[7]),
        culturePoints: this.fromFixed1000(result[8]),
        score: Number(result[9]),
      };
    } catch {
      return null;
    }
  }

  /** Get village building list (read BuildingCounter -> Building sequentially) */
  async readBuildings(villageId: number): Promise<BuildingInstance[]> {
    const buildings: BuildingInstance[] = [];
    try {
      const counterResult = await this.getEntity("BuildingCounter", [villageId]);
      const count = counterResult ? Number(counterResult[0]) : 0;

      for (let i = 1; i <= count; i++) {
        const result = await this.getEntity("Building", [villageId, i]);
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

  /** Get garrison units */
  async readGarrison(villageId: number): Promise<ArmyUnit[]> {
    const units: ArmyUnit[] = [];
    // 10 unit definitions (ID 1-10)
    for (let unitDefId = 1; unitDefId <= 10; unitDefId++) {
      try {
        const result = await this.getEntity("GarrisonUnit", [villageId, unitDefId]);
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

  /** Get researched technologies */
  async readResearchedTechs(villageId: number): Promise<Set<number>> {
    const techs = new Set<number>();
    // 30 techs (ID 1-30)
    for (let techId = 1; techId <= 30; techId++) {
      try {
        const result = await this.getEntity("ResearchedTech", [villageId, techId]);
        if (result && result.length >= 1 && Number(result[0]) === 1) {
          techs.add(techId);
        }
      } catch {
        // ignore
      }
    }
    return techs;
  }

  /** Read game configuration */
  async readGameConfig(): Promise<{ currentTick: number; initialized: boolean }> {
    try {
      const result = await this.getEntity("GameConfig", [0]);
      if (result && result.length >= 2) {
        return {
          currentTick: Number(result[0]),
          initialized: Number(result[1]) === 1,
        };
      }
    } catch {
      // ignore
    }
    return { currentTick: 0, initialized: false };
  }

  // ── Queue reading ──

  /** Read build queue entries for a village */
  async readBuildQueue(villageId: number): Promise<Array<{ defId: number; posX: number; posY: number; completionTick: number }>> {
    const items: Array<{ defId: number; posX: number; posY: number; completionTick: number }> = [];
    try {
      const counterResult = await this.getEntity("BuildQueueCounter", [villageId]);
      const count = counterResult ? Number(counterResult[0]) : 0;

      for (let i = 1; i <= count; i++) {
        const result = await this.getEntity("BuildQueue", [villageId, i]);
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

  /** Read research queue for a village */
  async readResearchQueue(villageId: number): Promise<Array<{ techId: number; completionTick: number }>> {
    const items: Array<{ techId: number; completionTick: number }> = [];
    try {
      const result = await this.getEntity("ResearchQueue", [villageId]);
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

  /** Read train queue entries for a village */
  async readTrainQueue(villageId: number): Promise<Array<{ unitDefId: number; count: number; completionTick: number }>> {
    const items: Array<{ unitDefId: number; count: number; completionTick: number }> = [];
    try {
      const counterResult = await this.getEntity("TrainQueueCounter", [villageId]);
      const count = counterResult ? Number(counterResult[0]) : 0;

      for (let i = 1; i <= count; i++) {
        const result = await this.getEntity("TrainQueue", [villageId, i]);
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

  private async getEntity(
    modelName: string,
    keys: number[],
  ): Promise<string[] | null> {
    try {
      const modelSelector = this.computeModelSelector(modelName);
      const keysAsHex = keys.map((k) => `0x${k.toString(16)}`);

      const raw = await this.provider.callContract({
        contractAddress: this.worldAddress,
        entrypoint: "entity",
        calldata: [
          modelSelector,
          keysAsHex.length.toString(),
          ...keysAsHex,
        ],
      });

      // starknet.js v6 returns string[] directly (or { result: string[] })
      const result: string[] = Array.isArray(raw) ? raw : (raw as any).result ?? [];

      // Dojo returns [length, ...values]
      if (result.length < 2) return null;
      const len = Number(result[0]);
      return result.slice(1, 1 + len);
    } catch {
      return null;
    }
  }

  /** Dojo model selector: sn_keccak("namespace-ModelName") */
  private computeModelSelector(modelName: string): string {
    // Dojo uses sn_keccak for model selectors in the format: namespace-ModelName
    const tag = `${this.namespace}-${modelName}`;
    return hash.getSelectorFromName(tag);
  }

  private fromFixed1000(hex: string | bigint): number {
    return Number(BigInt(hex)) / 1000;
  }
}
