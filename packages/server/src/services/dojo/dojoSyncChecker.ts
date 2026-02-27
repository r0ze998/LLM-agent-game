/**
 * dojoSyncChecker.ts — オフチェーン ↔ オンチェーン整合性チェック (F5)
 *
 * 定期的に全村の状態を比較し、ドリフトを検出する。
 * autoRepair モード時はオンチェーンを正としてオフチェーンを上書き。
 */

import type { VillageState4X } from "@murasato/shared";
import type { DojoStateReader, OnChainVillage } from "./dojoStateReader.ts";
import type { VillageIdMapper } from "./dojoSync.ts";

const LOG_PREFIX = "[SyncChecker]";
const REPORT_BUFFER_SIZE = 50;

export interface DriftField {
  field: string;
  offchain: number;
  onchain: number;
  driftPercent: number;
}

export interface DriftReport {
  villageUuid: string;
  villageU32: number;
  tick: number;
  drifts: DriftField[];
  repaired: boolean;
}

export interface SyncCheckerConfig {
  driftThreshold: number;  // e.g. 0.05 = 5%
  autoRepair: boolean;
}

const COMPARE_FIELDS: { field: string; offchain: (vs: VillageState4X) => number; onchain: (oc: OnChainVillage) => number }[] = [
  { field: "food", offchain: vs => vs.resources.food, onchain: oc => oc.food },
  { field: "wood", offchain: vs => vs.resources.wood, onchain: oc => oc.wood },
  { field: "stone", offchain: vs => vs.resources.stone, onchain: oc => oc.stone },
  { field: "iron", offchain: vs => vs.resources.iron, onchain: oc => oc.iron },
  { field: "gold", offchain: vs => vs.resources.gold, onchain: oc => oc.gold },
  { field: "population", offchain: vs => vs.population, onchain: oc => oc.population },
  { field: "score", offchain: vs => vs.score, onchain: oc => oc.score },
  { field: "researchPoints", offchain: vs => vs.researchPoints, onchain: oc => oc.researchPoints },
  { field: "culturePoints", offchain: vs => vs.culturePoints, onchain: oc => oc.culturePoints },
];

export class DojoSyncChecker {
  private config: SyncCheckerConfig;
  private stateReader: DojoStateReader;
  private villageMapper: VillageIdMapper;
  private reports: DriftReport[] = [];
  private reportPointer = 0;

  constructor(
    stateReader: DojoStateReader,
    villageMapper: VillageIdMapper,
    config?: Partial<SyncCheckerConfig>,
  ) {
    this.stateReader = stateReader;
    this.villageMapper = villageMapper;
    this.config = {
      driftThreshold: config?.driftThreshold ?? 0.05,
      autoRepair: config?.autoRepair ?? false,
    };
  }

  /** Run integrity check on all registered villages */
  async runCheck(
    villageStates: Map<string, VillageState4X>,
    tick: number,
  ): Promise<DriftReport[]> {
    const newReports: DriftReport[] = [];
    const entries = this.villageMapper.entries();

    for (const [uuid, u32Id] of entries) {
      const vs = villageStates.get(uuid);
      if (!vs) continue;

      try {
        const onChain = await this.stateReader.readVillage(u32Id);
        if (!onChain) continue;

        const drifts: DriftField[] = [];

        for (const cf of COMPARE_FIELDS) {
          const offVal = cf.offchain(vs);
          const onVal = cf.onchain(onChain);
          const maxVal = Math.max(Math.abs(offVal), Math.abs(onVal), 1);
          const driftPercent = Math.abs(offVal - onVal) / maxVal;

          if (driftPercent > this.config.driftThreshold) {
            drifts.push({
              field: cf.field,
              offchain: offVal,
              onchain: onVal,
              driftPercent,
            });
          }
        }

        if (drifts.length > 0) {
          const repaired = this.config.autoRepair;

          if (repaired) {
            // Apply on-chain values to off-chain state
            vs.resources.food = onChain.food;
            vs.resources.wood = onChain.wood;
            vs.resources.stone = onChain.stone;
            vs.resources.iron = onChain.iron;
            vs.resources.gold = onChain.gold;
            vs.population = onChain.population;
            vs.score = onChain.score;
            vs.researchPoints = onChain.researchPoints;
            vs.culturePoints = onChain.culturePoints;
          }

          const report: DriftReport = {
            villageUuid: uuid,
            villageU32: u32Id,
            tick,
            drifts,
            repaired,
          };

          newReports.push(report);
          this.addReport(report);

          const driftSummary = drifts.map(d =>
            `${d.field}: off=${d.offchain.toFixed(1)} on=${d.onchain.toFixed(1)} (${(d.driftPercent * 100).toFixed(1)}%)`
          ).join(", ");
          console.log(`${LOG_PREFIX} Drift detected for ${uuid}: ${driftSummary}${repaired ? " [REPAIRED]" : ""}`);
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} Check failed for ${uuid}:`, err);
      }
    }

    if (newReports.length === 0) {
      console.log(`${LOG_PREFIX} All ${entries.length} villages in sync at tick ${tick}`);
    }

    return newReports;
  }

  /** Get all recent drift reports */
  getReports(): DriftReport[] {
    return [...this.reports];
  }

  private addReport(report: DriftReport): void {
    if (this.reports.length < REPORT_BUFFER_SIZE) {
      this.reports.push(report);
    } else {
      this.reports[this.reportPointer] = report;
      this.reportPointer = (this.reportPointer + 1) % REPORT_BUFFER_SIZE;
    }
  }
}
