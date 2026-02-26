/**
 * dojoBridge.ts — Dojo オンチェーン統合オーケストレーター
 *
 * 全てのオンチェーン操作を try/catch + fallback でラップ。
 * チェーンが落ちている場合は TS エンジンにフォールバックする。
 */

import type { DojoConfig } from "./dojoConfig.ts";
import type { TickResult as VillageTickResult } from "../../engine/ruleEngine.ts";
import type { VillageState4X, AutonomousWorldState, Tile } from "@murasato/shared";
import type { PlayerCommand, CommandResult } from "@murasato/shared";
import type { World4XRef } from "../../engine/commandProcessor.ts";
import { DojoTxService, CovenantScope, type CovenantClauseInput, type EffectInput, InstitutionType, InventionType, DiplomacyStatus } from "../dojoTxService.ts";
import { DojoStateReader, type OnChainVillage } from "./dojoStateReader.ts";
import {
  VillageIdMapper,
  BUILDING_STR_TO_U32,
  TECH_STR_TO_U32,
  UNIT_STR_TO_U32,
  BUILDING_U32_TO_STR,
  TECH_U32_TO_STR,
  UNIT_U32_TO_STR,
} from "./dojoSync.ts";
import { processVillageTick } from "../../engine/ruleEngine.ts";
import { processCommand } from "../../engine/commandProcessor.ts";

const LOG_PREFIX = "[DojoBridge]";

export class DojoBridge {
  private config: DojoConfig;
  private txService: DojoTxService;
  private stateReader: DojoStateReader;
  private villageMapper: VillageIdMapper;
  private _initialized = false;

  constructor(config: DojoConfig) {
    this.config = config;
    this.txService = new DojoTxService(
      config.rpcUrl,
      config.accountAddress,
      config.privateKey,
      config.worldAddress,
      "aw",
      config.contracts,
    );
    this.stateReader = new DojoStateReader(
      config.rpcUrl,
      config.worldAddress,
    );
    this.villageMapper = new VillageIdMapper();
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ── Initialization ──

  /** physics init + setup registerAll */
  async initialize(): Promise<void> {
    if (this._initialized) return;
    try {
      console.log(`${LOG_PREFIX} Initializing physics...`);
      const tx1 = await this.txService.initializePhysics();
      await this.txService.waitForTx(tx1);
      console.log(`${LOG_PREFIX} Physics initialized.`);

      console.log(`${LOG_PREFIX} Registering all definitions...`);
      const tx2 = await this.txService.submitSetupRegisterAll();
      await this.txService.waitForTx(tx2);
      console.log(`${LOG_PREFIX} All definitions registered.`);

      this._initialized = true;
    } catch (err) {
      console.error(`${LOG_PREFIX} Initialization failed, will retry on next call:`, err);
    }
  }

  // ── Village Creation ──

  /** 村創設 → オンチェーンにも作成 */
  async createVillage(
    uuid: string,
    ownerAddress?: string,
  ): Promise<void> {
    const u32Id = this.villageMapper.register(uuid);
    try {
      const addr = ownerAddress ?? this.config.accountAddress;
      const txHash = await this.txService.createVillage(addr);
      await this.txService.waitForTx(txHash);
      console.log(
        `${LOG_PREFIX} Village created on-chain: UUID=${uuid} → u32=${u32Id}`,
      );
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} createVillage failed (offline?), UUID=${uuid}:`,
        err,
      );
    }
  }

  // ── Village Tick ──

  /** オンチェーン tick → sync。失敗時は TS エンジンにフォールバック */
  async executeVillageTick(
    uuid: string,
    vs: VillageState4X,
    territoryTiles: Tile[],
    awState?: AutonomousWorldState,
    currentTick?: number,
  ): Promise<VillageTickResult> {
    const u32Id = this.villageMapper.toU32(uuid);
    if (u32Id === undefined) {
      // 未登録村 → TSフォールバック
      return processVillageTick(vs, territoryTiles, awState, currentTick);
    }

    try {
      const txHash = await this.txService.submitVillageTick(u32Id);
      await this.txService.waitForTx(txHash);

      // オンチェーン状態を読み取ってオフチェーンに同期
      const onChain = await this.stateReader.readVillage(u32Id);
      if (onChain) {
        const result = this.syncVillageFromChain(vs, onChain);
        console.log(
          `${LOG_PREFIX} VillageTick on-chain: ${uuid} (u32=${u32Id})`,
        );
        return result;
      }

      // 読み取り失敗 → TSフォールバック
      return processVillageTick(vs, territoryTiles, awState, currentTick);
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} VillageTick failed, falling back to TS engine:`,
        err,
      );
      return processVillageTick(vs, territoryTiles, awState, currentTick);
    }
  }

  // ── Command Execution ──

  /** オンチェーンコマンド → sync。失敗時は TS エンジンにフォールバック */
  async executeCommand(
    cmd: PlayerCommand,
    villageUuid: string,
    worldRef: World4XRef,
  ): Promise<CommandResult> {
    const u32Id = this.villageMapper.toU32(villageUuid);
    if (u32Id === undefined) {
      return processCommand(cmd, villageUuid, worldRef);
    }

    try {
      const txHash = await this.submitCommandOnChain(cmd, u32Id);
      if (txHash) {
        await this.txService.waitForTx(txHash);
        console.log(
          `${LOG_PREFIX} Command ${cmd.type} on-chain: ${villageUuid}`,
        );

        // 状態同期
        const vs = worldRef.villageStates.get(villageUuid);
        if (vs) {
          const onChain = await this.stateReader.readVillage(u32Id);
          if (onChain) this.syncVillageFromChain(vs, onChain);
        }

        return { success: true, command: cmd, message: "Executed on-chain" };
      }
      // コマンドタイプ未対応 → TSフォールバック
      return processCommand(cmd, villageUuid, worldRef);
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} Command ${cmd.type} failed, falling back:`,
        err,
      );
      return processCommand(cmd, villageUuid, worldRef);
    }
  }

  // ── Layer 1: Covenant ──

  async proposeCovenant(
    villageUuid: string,
    scope: number,
    targetVillageUuid: string | null,
    name: string,
    clauses: CovenantClauseInput[],
  ): Promise<string | null> {
    const u32Id = this.villageMapper.toU32(villageUuid);
    const targetU32 = targetVillageUuid
      ? (this.villageMapper.toU32(targetVillageUuid) ?? 0)
      : 0;
    if (u32Id === undefined) return null;

    try {
      const txHash = await this.txService.submitCovenantProposal(
        u32Id,
        scope as CovenantScope,
        targetU32,
        name,
        clauses,
      );
      await this.txService.waitForTx(txHash);
      console.log(`${LOG_PREFIX} Covenant proposed on-chain: ${name}`);
      return txHash;
    } catch (err) {
      console.warn(`${LOG_PREFIX} proposeCovenant failed:`, err);
      return null;
    }
  }

  // ── Layer 2: Invention ──

  async registerInvention(
    villageUuid: string,
    inventionType: number,
    name: string,
    totalCost: number,
    effects: EffectInput[],
  ): Promise<string | null> {
    const u32Id = this.villageMapper.toU32(villageUuid);
    if (u32Id === undefined) return null;

    try {
      const txHash = await this.txService.submitInvention(
        u32Id,
        inventionType as InventionType,
        name,
        totalCost,
        effects,
      );
      await this.txService.waitForTx(txHash);
      console.log(`${LOG_PREFIX} Invention registered on-chain: ${name}`);
      return txHash;
    } catch (err) {
      console.warn(`${LOG_PREFIX} registerInvention failed:`, err);
      return null;
    }
  }

  // ── Layer 3: Institution ──

  async foundInstitution(
    villageUuid: string,
    instType: number,
    name: string,
    effects: EffectInput[],
  ): Promise<string | null> {
    const u32Id = this.villageMapper.toU32(villageUuid);
    if (u32Id === undefined) return null;

    try {
      const txHash = await this.txService.submitInstitutionFound(
        u32Id,
        instType as InstitutionType,
        name,
        effects,
      );
      await this.txService.waitForTx(txHash);
      console.log(`${LOG_PREFIX} Institution founded on-chain: ${name}`);
      return txHash;
    } catch (err) {
      console.warn(`${LOG_PREFIX} foundInstitution failed:`, err);
      return null;
    }
  }

  // ── Lifecycle / Decay ──

  async decayCovenants(): Promise<void> {
    try {
      const txHash = await this.txService.submitCovenantDecay();
      await this.txService.waitForTx(txHash);
    } catch (err) {
      console.warn(`${LOG_PREFIX} decayCovenants failed:`, err);
    }
  }

  async decayInventions(): Promise<void> {
    try {
      const txHash = await this.txService.submitInventionDecay();
      await this.txService.waitForTx(txHash);
    } catch (err) {
      console.warn(`${LOG_PREFIX} decayInventions failed:`, err);
    }
  }

  async processInstitutionLifecycle(): Promise<void> {
    try {
      const txHash = await this.txService.submitInstitutionLifecycle();
      await this.txService.waitForTx(txHash);
    } catch (err) {
      console.warn(`${LOG_PREFIX} processInstitutionLifecycle failed:`, err);
    }
  }

  // ── Victory ──

  async checkVictory(villageUuid: string): Promise<number> {
    try {
      const txHash = await this.txService.submitVictoryCheck();
      await this.txService.waitForTx(txHash);
      return 0; // Victory type from on-chain event (0 = none)
    } catch (err) {
      console.warn(`${LOG_PREFIX} checkVictory failed:`, err);
      return 0;
    }
  }

  // ── Advance Global Tick ──

  async advanceTick(): Promise<void> {
    try {
      const txHash = await this.txService.advanceTick();
      await this.txService.waitForTx(txHash);
    } catch (err) {
      console.warn(`${LOG_PREFIX} advanceTick failed:`, err);
    }
  }

  // ── Internal: submit command to chain ──

  private async submitCommandOnChain(
    cmd: PlayerCommand,
    villageU32: number,
  ): Promise<string | null> {
    switch (cmd.type) {
      case "build": {
        const defId = BUILDING_STR_TO_U32[
          (cmd as any).buildingDefId
        ];
        if (!defId) return null;
        const pos = (cmd as any).position ?? { x: 0, y: 0 };
        return this.txService.submitBuild(villageU32, defId, pos.x, pos.y);
      }
      case "research": {
        const techId = TECH_STR_TO_U32[(cmd as any).techDefId];
        if (!techId) return null;
        return this.txService.submitResearch(villageU32, techId);
      }
      case "train": {
        const unitId = UNIT_STR_TO_U32[(cmd as any).unitDefId];
        if (!unitId) return null;
        const count = (cmd as any).count ?? 1;
        return this.txService.submitTrain(villageU32, unitId, count);
      }
      case "demolish": {
        const buildingId = (cmd as any).buildingId;
        if (buildingId === undefined) return null;
        // buildingId is a string in off-chain, need to map to u32 index
        return this.txService.submitDemolish(villageU32, Number(buildingId) || 1);
      }
      case "attack": {
        const targetUuid = (cmd as any).targetVillageId;
        const targetU32 = this.villageMapper.toU32(targetUuid);
        if (!targetU32) return null;
        return this.txService.submitAttack(villageU32, targetU32);
      }
      case "diplomacy": {
        const targetUuid = (cmd as any).targetVillageId;
        const targetU32 = this.villageMapper.toU32(targetUuid);
        if (!targetU32) return null;
        const statusMap: Record<string, DiplomacyStatus> = {
          declare_war: DiplomacyStatus.War,
          propose_alliance: DiplomacyStatus.Allied,
          propose_peace: DiplomacyStatus.Neutral,
          break_alliance: DiplomacyStatus.Neutral,
        };
        const action = (cmd as any).action ?? "propose_peace";
        const status = statusMap[action] ?? DiplomacyStatus.Neutral;
        return this.txService.submitDiplomacy(villageU32, targetU32, status);
      }
      default:
        // trade, move_army, rally_defense etc. — TS only for now
        return null;
    }
  }

  // ── Internal: sync on-chain state back to off-chain ──

  private syncVillageFromChain(
    vs: VillageState4X,
    onChain: OnChainVillage,
  ): VillageTickResult {
    // Compute deltas
    const resourceDelta = {
      food: onChain.food - vs.resources.food,
      wood: onChain.wood - vs.resources.wood,
      stone: onChain.stone - vs.resources.stone,
      iron: onChain.iron - vs.resources.iron,
      gold: onChain.gold - vs.resources.gold,
    };
    const populationDelta = onChain.population - vs.population;

    // Apply on-chain values
    vs.resources.food = onChain.food;
    vs.resources.wood = onChain.wood;
    vs.resources.stone = onChain.stone;
    vs.resources.iron = onChain.iron;
    vs.resources.gold = onChain.gold;
    vs.population = onChain.population;
    vs.housingCapacity = onChain.housing;
    vs.researchPoints = onChain.researchPoints;
    vs.culturePoints = onChain.culturePoints;
    vs.score = onChain.score;

    return {
      resourceDelta,
      populationDelta,
      researchGained: onChain.researchPoints - vs.researchPoints,
      cultureGained: onChain.culturePoints - vs.culturePoints,
      queueCompleted: [], // TODO: detect from on-chain events
      starvation: populationDelta < 0 && onChain.food <= 0,
    };
  }

  /** デバッグ: 村マッピング状態 */
  getVillageMapperEntries(): [string, number][] {
    return this.villageMapper.entries();
  }
}
