/**
 * dojoTxService.ts — Off-chain LLM Bridge
 *
 * Translates LLM agent decisions into Starknet Dojo transactions.
 * Uses starknet.js Account to submit calldata to on-chain systems.
 */

import { Account, RpcProvider, CallData, type Call, shortString } from "starknet";
import type { ManifestContracts } from "./dojo/manifestParser.ts";

// ── Types matching on-chain enums ──

export enum ClauseType {
  TaxRate = 0,
  TradeTariff = 1,
  Conscription = 2,
  ResourceSharing = 3,
  BuildingBan = 4,
  BuildingSubsidy = 5,
  ResearchFocus = 6,
  MilitaryPact = 7,
  NonAggression = 8,
  Tribute = 9,
  ImmigrationPolicy = 10,
  Rationing = 11,
  Festival = 12,
}

export enum CovenantScope {
  Village = 0,
  Bilateral = 1,
  Global = 2,
}

export enum EffectType {
  ResourceProduction = 0,
  ResourceStorage = 1,
  Housing = 2,
  ResearchPoints = 3,
  CulturePoints = 4,
  TileYieldMod = 5,
  AttackBonus = 6,
  DefenseBonus = 7,
  UnitTrainingSpeed = 8,
  BuildSpeed = 9,
  PopulationGrowth = 10,
  FoodConsumptionMod = 11,
  TradeIncome = 12,
  VisionRange = 13,
  Fortification = 14,
  HealPerTick = 15,
  UnlockUnit = 16,
  UnlockBuilding = 17,
}

export enum InstitutionType {
  Guild = 0,
  Religion = 1,
  Alliance = 2,
  Academy = 3,
  Custom = 4,
}

export enum InventionType {
  Building = 0,
  Tech = 1,
  Unit = 2,
}

export enum DiplomacyStatus {
  Neutral = 0,
  Friendly = 1,
  Allied = 2,
  Hostile = 3,
  War = 4,
}

export interface CovenantClauseInput {
  clauseType: ClauseType;
  paramA: number; // Will be scaled ×1000
  paramB: number; // Will be scaled ×1000
}

export interface EffectInput {
  effectType: EffectType;
  value: number; // Will be scaled ×1000
}

// ── Fixed-point helper ──

function toFixed1000(val: number): string {
  return Math.round(val * 1000).toString();
}

function toFixed1000Signed(val: number): string {
  const scaled = Math.round(val * 1000);
  // Cairo i128 encoding: positive as-is, negative as felt252
  return scaled.toString();
}

// ── Service ──

export class DojoTxService {
  private account: Account;
  private provider: RpcProvider;
  private worldAddress: string;
  private namespace: string;
  private manifestContracts: ManifestContracts | null = null;

  constructor(
    rpcUrl: string,
    accountAddress: string,
    privateKey: string,
    worldAddress: string,
    namespace = "aw",
    manifestContracts?: ManifestContracts,
  ) {
    this.provider = new RpcProvider({ nodeUrl: rpcUrl });
    this.account = new Account(this.provider, accountAddress, privateKey);
    this.worldAddress = worldAddress;
    this.namespace = namespace;
    this.manifestContracts = manifestContracts ?? null;
  }

  /** マニフェストベースのコントラクトアドレスを設定 */
  setManifestContracts(contracts: ManifestContracts): void {
    this.manifestContracts = contracts;
  }

  // ── Village ──

  async createVillage(ownerAddress: string): Promise<string> {
    return this.execute("village_tick", "create_village", [ownerAddress]);
  }

  async submitVillageTick(villageId: number): Promise<string> {
    return this.execute("village_tick", "tick", [villageId.toString()]);
  }

  // ── Commands ──

  async submitBuild(
    villageId: number,
    buildingDefId: number,
    posX: number,
    posY: number,
  ): Promise<string> {
    return this.execute("commands", "build", [
      villageId.toString(),
      buildingDefId.toString(),
      posX.toString(),
      posY.toString(),
    ]);
  }

  async submitResearch(villageId: number, techId: number): Promise<string> {
    return this.execute("commands", "research", [
      villageId.toString(),
      techId.toString(),
    ]);
  }

  async submitTrain(
    villageId: number,
    unitDefId: number,
    count: number,
  ): Promise<string> {
    return this.execute("commands", "train", [
      villageId.toString(),
      unitDefId.toString(),
      count.toString(),
    ]);
  }

  async submitDemolish(
    villageId: number,
    buildingId: number,
  ): Promise<string> {
    return this.execute("commands", "demolish", [
      villageId.toString(),
      buildingId.toString(),
    ]);
  }

  async submitDiplomacy(
    villageId: number,
    targetId: number,
    status: DiplomacyStatus,
  ): Promise<string> {
    return this.execute("commands", "set_diplomacy", [
      villageId.toString(),
      targetId.toString(),
      status.toString(),
    ]);
  }

  async advanceTick(): Promise<string> {
    return this.execute("commands", "advance_tick", []);
  }

  // ── Combat ──

  async submitAttack(
    attackerVillage: number,
    defenderVillage: number,
  ): Promise<string> {
    return this.execute("combat", "attack", [
      attackerVillage.toString(),
      defenderVillage.toString(),
    ]);
  }

  // ── Layer 1: Covenants ──

  async submitCovenantProposal(
    villageId: number,
    scope: CovenantScope,
    targetVillageId: number,
    name: string,
    clauses: CovenantClauseInput[],
  ): Promise<string> {
    const nameHash = shortString.encodeShortString(name.slice(0, 31));
    const clauseTypes = clauses.map((c) => c.clauseType.toString());
    const paramAs = clauses.map((c) => toFixed1000Signed(c.paramA));
    const paramBs = clauses.map((c) => toFixed1000Signed(c.paramB));

    return this.execute("covenant_sys", "propose", [
      villageId.toString(),
      scope.toString(),
      targetVillageId.toString(),
      nameHash,
      clauseTypes,
      paramAs,
      paramBs,
    ]);
  }

  async submitCovenantRepeal(covenantId: number): Promise<string> {
    return this.execute("covenant_sys", "repeal", [covenantId.toString()]);
  }

  // ── Layer 2: Inventions ──

  async submitInvention(
    villageId: number,
    inventionType: InventionType,
    name: string,
    totalCost: number,
    effects: EffectInput[],
  ): Promise<string> {
    const nameHash = shortString.encodeShortString(name.slice(0, 31));
    const effectTypes = effects.map((e) => e.effectType.toString());
    const effectValues = effects.map((e) => toFixed1000Signed(e.value));

    return this.execute("invention_sys", "register", [
      villageId.toString(),
      inventionType.toString(),
      nameHash,
      toFixed1000(totalCost),
      effectTypes,
      effectValues,
    ]);
  }

  async submitKnowledgeSpread(
    inventionId: number,
    targetVillageId: number,
  ): Promise<string> {
    return this.execute("invention_sys", "spread_knowledge", [
      inventionId.toString(),
      targetVillageId.toString(),
    ]);
  }

  // ── Layer 3: Institutions ──

  async submitInstitutionFound(
    villageId: number,
    instType: InstitutionType,
    name: string,
    effects: EffectInput[],
  ): Promise<string> {
    const nameHash = shortString.encodeShortString(name.slice(0, 31));
    const effectTypes = effects.map((e) => e.effectType.toString());
    const effectValues = effects.map((e) => toFixed1000Signed(e.value));

    return this.execute("institution_sys", "found", [
      villageId.toString(),
      instType.toString(),
      nameHash,
      effectTypes,
      effectValues,
    ]);
  }

  async submitInstitutionJoin(
    villageId: number,
    institutionId: number,
  ): Promise<string> {
    return this.execute("institution_sys", "join", [
      villageId.toString(),
      institutionId.toString(),
    ]);
  }

  async submitInstitutionLeave(
    villageId: number,
    institutionId: number,
  ): Promise<string> {
    return this.execute("institution_sys", "leave", [
      villageId.toString(),
      institutionId.toString(),
    ]);
  }

  // ── Trade (F8) ──

  async submitProposeTrade(
    fromVillage: number,
    toVillage: number,
    offerFood: number,
    offerWood: number,
    offerStone: number,
    offerIron: number,
    offerGold: number,
    requestFood: number,
    requestWood: number,
    requestStone: number,
    requestIron: number,
    requestGold: number,
  ): Promise<string> {
    return this.execute("trade_sys", "propose_trade", [
      fromVillage.toString(),
      toVillage.toString(),
      toFixed1000(offerFood), toFixed1000(offerWood), toFixed1000(offerStone),
      toFixed1000(offerIron), toFixed1000(offerGold),
      toFixed1000(requestFood), toFixed1000(requestWood), toFixed1000(requestStone),
      toFixed1000(requestIron), toFixed1000(requestGold),
    ]);
  }

  async submitAcceptTrade(tradeId: number): Promise<string> {
    return this.execute("trade_sys", "accept_trade", [tradeId.toString()]);
  }

  async submitCancelTrade(tradeId: number): Promise<string> {
    return this.execute("trade_sys", "cancel_trade", [tradeId.toString()]);
  }

  async submitCreateTradeRoute(
    fromVillage: number,
    toVillage: number,
    sendFood: number, sendWood: number, sendStone: number, sendIron: number, sendGold: number,
    recvFood: number, recvWood: number, recvStone: number, recvIron: number, recvGold: number,
  ): Promise<string> {
    return this.execute("trade_sys", "create_trade_route", [
      fromVillage.toString(),
      toVillage.toString(),
      toFixed1000(sendFood), toFixed1000(sendWood), toFixed1000(sendStone),
      toFixed1000(sendIron), toFixed1000(sendGold),
      toFixed1000(recvFood), toFixed1000(recvWood), toFixed1000(recvStone),
      toFixed1000(recvIron), toFixed1000(recvGold),
    ]);
  }

  async submitExecuteTradeTick(routeIds: number[]): Promise<string> {
    return this.execute("trade_sys", "execute_trade_tick", [
      routeIds.map(id => id.toString()),
    ]);
  }

  // ── Batch Operations (F9) ──

  /** Batch multiple village ticks into a single multicall */
  async submitBatchVillageTicks(villageIds: number[]): Promise<string> {
    const calls: Call[] = villageIds.map(id => ({
      contractAddress: this.getSystemAddress("village_tick"),
      entrypoint: "tick",
      calldata: [id.toString()],
    }));
    const { transaction_hash } = await this.account.execute(calls);
    console.log(`[DojoTx] Batch village_tick (${villageIds.length} villages) → tx: ${transaction_hash}`);
    return transaction_hash;
  }

  /** Full tick batch: advance_tick + village_ticks + trade_tick in a single TX */
  async submitTickBatch(
    villageIds: number[],
    tradeRouteIds: number[],
  ): Promise<string> {
    const calls: Call[] = [];

    // advance_tick
    calls.push({
      contractAddress: this.getSystemAddress("commands"),
      entrypoint: "advance_tick",
      calldata: [],
    });

    // village ticks
    for (const id of villageIds) {
      calls.push({
        contractAddress: this.getSystemAddress("village_tick"),
        entrypoint: "tick",
        calldata: [id.toString()],
      });
    }

    // trade tick (if any routes)
    if (tradeRouteIds.length > 0) {
      calls.push({
        contractAddress: this.getSystemAddress("trade_sys"),
        entrypoint: "execute_trade_tick",
        calldata: this.flattenCalldata([tradeRouteIds.map(id => id.toString())]),
      });
    }

    const { transaction_hash } = await this.account.execute(calls);
    console.log(`[DojoTx] TickBatch (${villageIds.length} villages, ${tradeRouteIds.length} routes) → tx: ${transaction_hash}`);
    return transaction_hash;
  }

  // ── Physics initialization ──

  async initializePhysics(): Promise<string> {
    return this.execute("physics", "initialize_physics", []);
  }

  // ── Setup ──

  async submitSetupRegisterAll(): Promise<string> {
    return this.execute("setup", "register_all", []);
  }

  // ── Lifecycle / Decay ──

  async submitCovenantDecay(): Promise<string> {
    return this.execute("covenant_sys", "decay_covenants", []);
  }

  async submitInventionDecay(): Promise<string> {
    return this.execute("invention_sys", "decay_invention", []);
  }

  async submitInstitutionLifecycle(): Promise<string> {
    return this.execute("institution_sys", "process_lifecycle", []);
  }

  // ── Victory ──

  async submitVictoryCheck(): Promise<string> {
    return this.execute("victory", "check_victory", []);
  }

  // ── Tx confirmation ──

  /** Wait for tx confirmation and return the receipt (with events). */
  async waitForTx(txHash: string): Promise<any> {
    const receipt = await this.provider.waitForTransaction(txHash);
    return receipt;
  }

  // ── Internal ──

  private async execute(
    system: string,
    fn_name: string,
    calldata: (string | string[])[],
  ): Promise<string> {
    const contractAddress = this.getSystemAddress(system);
    const flatCalldata = this.flattenCalldata(calldata);

    const call: Call = {
      contractAddress,
      entrypoint: fn_name,
      calldata: flatCalldata,
    };

    const { transaction_hash } = await this.account.execute(call);
    console.log(
      `[DojoTx] ${system}.${fn_name} → tx: ${transaction_hash}`,
    );
    return transaction_hash;
  }

  /**
   * Get system contract address.
   * Priority: manifest → environment variable fallback.
   */
  private getSystemAddress(system: string): string {
    // 1. マニフェストから取得
    if (this.manifestContracts) {
      const addr = this.manifestContracts[system as keyof ManifestContracts];
      if (addr) return addr;
    }

    // 2. 環境変数フォールバック
    const envKey = `DOJO_SYSTEM_${system.toUpperCase()}`;
    const addr = process.env[envKey];
    if (!addr) {
      throw new Error(
        `System address not found for ${system}. Set ${envKey} or provide manifest.`,
      );
    }
    return addr;
  }

  private flattenCalldata(data: (string | string[])[]): string[] {
    const result: string[] = [];
    for (const item of data) {
      if (Array.isArray(item)) {
        result.push(item.length.toString()); // array length prefix
        result.push(...item);
      } else {
        result.push(item);
      }
    }
    return result;
  }
}
