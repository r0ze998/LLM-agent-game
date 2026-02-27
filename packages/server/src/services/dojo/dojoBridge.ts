/**
 * dojoBridge.ts — Dojo オンチェーン統合オーケストレーター
 *
 * 全てのオンチェーン操作を try/catch + fallback でラップ。
 * チェーンが落ちている場合は TS エンジンにフォールバックする。
 *
 * レシートベースのイベント解析により、オンチェーンイベントを検出・消費。
 */

import type { DojoConfig } from "./dojoConfig.ts";
import type { TickResult as VillageTickResult } from "../../engine/ruleEngine.ts";
import type { VillageState4X, AutonomousWorldState, Tile, GameEvent } from "@murasato/shared";
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
import { parseReceiptEvents, type DojoGameEvent } from "./dojoEventParser.ts";
import { bridgeDojoEvents, extractVictoryEvents } from "./dojoEventBridge.ts";
import { saveMapper, restoreMapper } from "./dojoVillageMapperPersistence.ts";
import { DojoLatencyTracker } from "./dojoLatencyTracker.ts";
import { ToriiEventClient, type ToriiConfig } from "./toriiClient.ts";
import { DojoSyncChecker, type DriftReport } from "./dojoSyncChecker.ts";

const LOG_PREFIX = "[DojoBridge]";

/** Result of executeVillageTick with on-chain event data */
export interface VillageTickResultWithEvents extends VillageTickResult {
  onChainEvents: GameEvent[];
}

export class DojoBridge {
  private config: DojoConfig;
  private txService: DojoTxService;
  private stateReader: DojoStateReader;
  private villageMapper: VillageIdMapper;
  private _initialized = false;
  private latencyTracker = new DojoLatencyTracker();
  private toriiClient: ToriiEventClient | null = null;
  private syncChecker: DojoSyncChecker | null = null;
  private externalEventHandlers: ((events: GameEvent[]) => void)[] = [];

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

  /** physics init + setup registerAll + mapper復元 */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // VillageIdMapper を永続化ファイルから復元
    const restored = await restoreMapper(this.villageMapper);
    if (restored) {
      console.log(`${LOG_PREFIX} VillageIdMapper restored (${this.villageMapper.size} villages)`);
    }

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

      // Initialize Torii client if configured
      if (process.env.TORII_ENABLED === "true" && this.config.toriiUrl) {
        const toriiConfig: ToriiConfig = {
          httpUrl: this.config.toriiUrl,
          worldAddress: this.config.worldAddress,
        };
        this.toriiClient = new ToriiEventClient(toriiConfig);

        // Wire Torii parsed events → GameEvent handlers
        this.toriiClient.onEvents((dojoEvents) => {
          const gameEvents = bridgeDojoEvents(dojoEvents, "", 0, this.villageMapper);
          for (const handler of this.externalEventHandlers) {
            handler(gameEvents);
          }
        });

        await this.toriiClient.connect();
        console.log(`${LOG_PREFIX} Torii client initialized (worldAddress=${this.config.worldAddress})`);
      }

      // Initialize sync checker if configured
      if (process.env.SYNC_CHECK_ENABLED === "true") {
        this.syncChecker = new DojoSyncChecker(
          this.stateReader,
          this.villageMapper,
          {
            driftThreshold: Number(process.env.SYNC_DRIFT_THRESHOLD ?? "0.05"),
            autoRepair: process.env.SYNC_AUTO_REPAIR === "true",
          },
        );
        console.log(`${LOG_PREFIX} SyncChecker initialized`);
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Initialization failed, will retry on next call:`, err);
    }
  }

  // ── Village Creation ──

  /** 村創設 → オンチェーンにも作成 + 永続化 */
  async createVillage(
    uuid: string,
    ownerAddress?: string,
  ): Promise<void> {
    const u32Id = this.villageMapper.register(uuid);

    // 永続化に保存
    saveMapper(this.villageMapper).catch((err) =>
      console.warn(`${LOG_PREFIX} Failed to persist mapper after createVillage:`, err),
    );

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
  ): Promise<VillageTickResultWithEvents> {
    const u32Id = this.villageMapper.toU32(uuid);
    if (u32Id === undefined) {
      // 未登録村 → TSフォールバック
      const result = processVillageTick(vs, territoryTiles, awState, currentTick);
      return { ...result, onChainEvents: [] };
    }

    try {
      // Step 1: Tick前にキュー状態スナップショット取得
      const [buildQueueBefore, researchQueueBefore, trainQueueBefore] = await Promise.all([
        this.stateReader.readBuildQueue(u32Id),
        this.stateReader.readResearchQueue(u32Id),
        this.stateReader.readTrainQueue(u32Id),
      ]);

      // Step 2: TX送信 → レシート取得 (with latency tracking)
      const txStart = performance.now();
      const txHash = await this.txService.submitVillageTick(u32Id);
      if (this.toriiClient) this.toriiClient.markOwnTx(txHash);
      const receipt = await this.txService.waitForTx(txHash);
      this.latencyTracker.record(performance.now() - txStart);

      // Step 3: レシートからイベント解析
      const receiptEvents = receipt?.events ?? [];
      const dojoEvents = parseReceiptEvents(receiptEvents);
      if (dojoEvents.length > 0) {
        console.log(`${LOG_PREFIX} Parsed ${dojoEvents.length} events from tick receipt for ${uuid}`);
      }

      // Step 4: オンチェーン状態を読み取ってオフチェーンに同期
      const onChain = await this.stateReader.readVillage(u32Id);
      if (onChain) {
        // Step 5: Tick後にキュー状態を取得して差分でqueueCompleted検出
        const [buildQueueAfter, researchQueueAfter, trainQueueAfter] = await Promise.all([
          this.stateReader.readBuildQueue(u32Id),
          this.stateReader.readResearchQueue(u32Id),
          this.stateReader.readTrainQueue(u32Id),
        ]);

        const queueCompleted = this.detectQueueCompletions(
          buildQueueBefore, buildQueueAfter,
          researchQueueBefore, researchQueueAfter,
          trainQueueBefore, trainQueueAfter,
        );

        const result = this.syncVillageFromChain(vs, onChain, queueCompleted);

        // Convert Dojo events to GameEvents
        const gameId = awState ? "" : ""; // gameId will be injected by caller
        const onChainEvents = bridgeDojoEvents(dojoEvents, gameId, currentTick ?? 0, this.villageMapper);

        console.log(
          `${LOG_PREFIX} VillageTick on-chain: ${uuid} (u32=${u32Id}), queueCompleted=${queueCompleted.length}`,
        );
        return { ...result, onChainEvents };
      }

      // 読み取り失敗 → TSフォールバック
      const result = processVillageTick(vs, territoryTiles, awState, currentTick);
      return { ...result, onChainEvents: [] };
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} VillageTick failed, falling back to TS engine:`,
        err,
      );
      const result = processVillageTick(vs, territoryTiles, awState, currentTick);
      return { ...result, onChainEvents: [] };
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
        const cmdStart = performance.now();
        if (this.toriiClient) this.toriiClient.markOwnTx(txHash);
        const receipt = await this.txService.waitForTx(txHash);
        this.latencyTracker.record(performance.now() - cmdStart);

        // Parse events from command receipt
        const receiptEvents = receipt?.events ?? [];
        const dojoEvents = parseReceiptEvents(receiptEvents);
        if (dojoEvents.length > 0) {
          console.log(`${LOG_PREFIX} Parsed ${dojoEvents.length} events from command receipt`);
        }

        console.log(
          `${LOG_PREFIX} Command ${cmd.type} on-chain: ${villageUuid}`,
        );

        // 状態同期
        const vs = worldRef.villageStates.get(villageUuid);
        if (vs) {
          const onChain = await this.stateReader.readVillage(u32Id);
          if (onChain) this.syncVillageFromChain(vs, onChain);
        }

        // Attach combat result from events if attack
        const combatEvents = dojoEvents.filter(e => e.kind === "CombatResolved");
        if (cmd.type === "attack" && combatEvents.length > 0) {
          const ce = combatEvents[0] as import("./dojoEventParser.ts").CombatResolvedEvent;
          const atkUuid = this.villageMapper.toUuid(ce.attackerVillage);
          const defUuid = this.villageMapper.toUuid(ce.defenderVillage);
          return {
            success: true,
            command: cmd,
            message: "Executed on-chain",
            data: {
              combatResult: {
                attackerVillageId: atkUuid ?? villageUuid,
                defenderVillageId: defUuid ?? "",
                attackerWon: ce.attackerWon,
                attackerLosses: [],
                defenderLosses: [],
              },
            },
          };
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
      const receipt = await this.txService.waitForTx(txHash);

      // Parse receipt for VictoryAchieved events
      const receiptEvents = receipt?.events ?? [];
      const dojoEvents = parseReceiptEvents(receiptEvents);
      const victoryEvents = extractVictoryEvents(dojoEvents);

      if (victoryEvents.length > 0) {
        const ve = victoryEvents[0];
        console.log(`${LOG_PREFIX} Victory detected on-chain: type=${ve.victoryType} village=${ve.villageId}`);
        return ve.victoryType;
      }

      return 0; // No victory
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

  // ── Full Sync ──

  /**
   * 起動時・再接続時のフル状態同期。
   * 全登録済み村のオンチェーン状態を読み取ってオフチェーンに反映する。
   */
  async fullSync(
    villageStates: Map<string, VillageState4X>,
  ): Promise<void> {
    const entries = this.villageMapper.entries();
    console.log(`${LOG_PREFIX} Starting fullSync for ${entries.length} villages...`);

    for (const [uuid, u32Id] of entries) {
      const vs = villageStates.get(uuid);
      if (!vs) continue;

      try {
        const onChain = await this.stateReader.readVillage(u32Id);
        if (onChain) {
          this.syncVillageFromChain(vs, onChain);
          console.log(`${LOG_PREFIX} fullSync: ${uuid} (u32=${u32Id}) synced`);
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} fullSync failed for ${uuid}:`, err);
      }
    }

    console.log(`${LOG_PREFIX} fullSync completed.`);
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
      case "trade": {
        const targetUuid = (cmd as any).targetVillageId;
        const targetU32 = this.villageMapper.toU32(targetUuid);
        if (!targetU32) return null;
        const offer = (cmd as any).offer ?? {};
        const request = (cmd as any).request ?? {};
        return this.txService.submitProposeTrade(
          villageU32, targetU32,
          offer.food ?? 0, offer.wood ?? 0, offer.stone ?? 0,
          offer.iron ?? 0, offer.gold ?? 0,
          request.food ?? 0, request.wood ?? 0, request.stone ?? 0,
          request.iron ?? 0, request.gold ?? 0,
        );
      }
      default:
        // move_army, rally_defense etc. — TS only for now
        return null;
    }
  }

  // ── Internal: sync on-chain state back to off-chain ──

  private syncVillageFromChain(
    vs: VillageState4X,
    onChain: OnChainVillage,
    queueCompleted: string[] = [],
  ): VillageTickResult {
    // Compute deltas (before overwriting)
    const prevResearch = vs.researchPoints;
    const prevCulture = vs.culturePoints;

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
      researchGained: onChain.researchPoints - prevResearch,
      cultureGained: onChain.culturePoints - prevCulture,
      queueCompleted,
      starvation: populationDelta < 0 && onChain.food <= 0,
    };
  }

  // ── Internal: detect queue completions by comparing before/after ──

  private detectQueueCompletions(
    buildBefore: Array<{ defId: number; posX: number; posY: number; completionTick: number }>,
    buildAfter: Array<{ defId: number; posX: number; posY: number; completionTick: number }>,
    researchBefore: Array<{ techId: number; completionTick: number }>,
    researchAfter: Array<{ techId: number; completionTick: number }>,
    trainBefore: Array<{ unitDefId: number; count: number; completionTick: number }>,
    trainAfter: Array<{ unitDefId: number; count: number; completionTick: number }>,
  ): string[] {
    const completed: string[] = [];

    // Buildings: items present before but absent after were completed
    const afterBuildSet = new Set(buildAfter.map(b => `${b.defId}_${b.posX}_${b.posY}_${b.completionTick}`));
    for (const b of buildBefore) {
      const key = `${b.defId}_${b.posX}_${b.posY}_${b.completionTick}`;
      if (!afterBuildSet.has(key)) {
        const name = BUILDING_U32_TO_STR[b.defId] ?? `building_${b.defId}`;
        completed.push(`build:${name}`);
      }
    }

    // Research: items present before but absent after
    const afterResearchSet = new Set(researchAfter.map(r => `${r.techId}_${r.completionTick}`));
    for (const r of researchBefore) {
      const key = `${r.techId}_${r.completionTick}`;
      if (!afterResearchSet.has(key)) {
        const name = TECH_U32_TO_STR[r.techId] ?? `tech_${r.techId}`;
        completed.push(`research:${name}`);
      }
    }

    // Training: items present before but absent after
    const afterTrainSet = new Set(trainAfter.map(t => `${t.unitDefId}_${t.count}_${t.completionTick}`));
    for (const t of trainBefore) {
      const key = `${t.unitDefId}_${t.count}_${t.completionTick}`;
      if (!afterTrainSet.has(key)) {
        const name = UNIT_U32_TO_STR[t.unitDefId] ?? `unit_${t.unitDefId}`;
        completed.push(`train:${name}x${t.count}`);
      }
    }

    return completed;
  }

  /** デバッグ: 村マッピング状態 */
  getVillageMapperEntries(): [string, number][] {
    return this.villageMapper.entries();
  }

  /** VillageIdMapper への直接アクセス (イベントブリッジ用) */
  getVillageMapper(): VillageIdMapper {
    return this.villageMapper;
  }

  // ── Trade (F8) ──

  /** 貿易提案: from村 → to村 */
  async proposeTrade(
    fromUuid: string,
    toUuid: string,
    offer: Record<string, number>,
    request: Record<string, number>,
  ): Promise<string | null> {
    const fromU32 = this.villageMapper.toU32(fromUuid);
    const toU32 = this.villageMapper.toU32(toUuid);
    if (fromU32 === undefined || toU32 === undefined) return null;

    try {
      const txHash = await this.txService.submitProposeTrade(
        fromU32, toU32,
        offer.food ?? 0, offer.wood ?? 0, offer.stone ?? 0,
        offer.iron ?? 0, offer.gold ?? 0,
        request.food ?? 0, request.wood ?? 0, request.stone ?? 0,
        request.iron ?? 0, request.gold ?? 0,
      );
      const start = performance.now();
      if (this.toriiClient) this.toriiClient.markOwnTx(txHash);
      await this.txService.waitForTx(txHash);
      this.latencyTracker.record(performance.now() - start);
      console.log(`${LOG_PREFIX} Trade proposed on-chain: ${fromUuid} → ${toUuid}`);
      return txHash;
    } catch (err) {
      console.warn(`${LOG_PREFIX} proposeTrade failed:`, err);
      this.latencyTracker.recordFailure();
      return null;
    }
  }

  /** 交易路tick実行 */
  async executeTradeTick(routeIds: number[]): Promise<void> {
    if (routeIds.length === 0) return;
    try {
      const start = performance.now();
      const txHash = await this.txService.submitExecuteTradeTick(routeIds);
      if (this.toriiClient) this.toriiClient.markOwnTx(txHash);
      await this.txService.waitForTx(txHash);
      this.latencyTracker.record(performance.now() - start);
      console.log(`${LOG_PREFIX} Trade tick executed: ${routeIds.length} routes`);
    } catch (err) {
      console.warn(`${LOG_PREFIX} executeTradeTick failed:`, err);
      this.latencyTracker.recordFailure();
    }
  }

  // ── Batch Tick (F9) ──

  /** 全村tickをバッチ化して1 TXで実行 */
  async executeBatchTick(
    villageIds: number[],
    tradeRouteIds: number[],
  ): Promise<string | null> {
    try {
      // Chunk large village sets (max 20 per multicall)
      const CHUNK_SIZE = 20;
      if (villageIds.length <= CHUNK_SIZE) {
        const start = performance.now();
        const txHash = await this.txService.submitTickBatch(villageIds, tradeRouteIds);
        if (this.toriiClient) this.toriiClient.markOwnTx(txHash);
        await this.txService.waitForTx(txHash);
        this.latencyTracker.record(performance.now() - start);
        return txHash;
      }

      // Chunked execution for large sets
      for (let i = 0; i < villageIds.length; i += CHUNK_SIZE) {
        const chunk = villageIds.slice(i, i + CHUNK_SIZE);
        const routes = i === 0 ? tradeRouteIds : []; // Include trade routes only in first chunk
        const start = performance.now();
        const txHash = await this.txService.submitTickBatch(chunk, routes);
        if (this.toriiClient) this.toriiClient.markOwnTx(txHash);
        await this.txService.waitForTx(txHash);
        this.latencyTracker.record(performance.now() - start);
      }

      return "batch_complete";
    } catch (err) {
      console.warn(`${LOG_PREFIX} executeBatchTick failed:`, err);
      this.latencyTracker.recordFailure();
      return null;
    }
  }

  // ── Latency Metrics (F9) ──

  /** レイテンシメトリクスを取得 */
  getLatencyMetrics() {
    return this.latencyTracker.getMetrics();
  }

  /** 推奨tick間隔を取得 */
  getRecommendedInterval(baseIntervalMs: number): number {
    return this.latencyTracker.getRecommendedInterval(baseIntervalMs);
  }

  // ── Torii (F4) ──

  /** Toriiクライアントで外部イベントを受信 */
  onExternalEvents(handler: (events: GameEvent[]) => void): void {
    this.externalEventHandlers.push(handler);
  }

  // ── Sync Checker (F5) ──

  /** 整合性チェックを実行 */
  async runIntegrityCheck(
    villageStates: Map<string, VillageState4X>,
    tick: number,
  ): Promise<DriftReport[]> {
    if (!this.syncChecker) return [];
    return this.syncChecker.runCheck(villageStates, tick);
  }

  /** ドリフトレポートを取得 */
  getSyncReports(): DriftReport[] {
    return this.syncChecker?.getReports() ?? [];
  }
}
