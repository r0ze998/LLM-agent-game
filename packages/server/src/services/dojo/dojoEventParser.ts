/**
 * dojoEventParser.ts — Starknet レシートイベントを型付きユニオンにパース
 *
 * Starknet トランザクションレシートの events 配列を読み取り、
 * Cairo 側で emit された 10 種のイベントを判別・デコードする。
 */

import { hash } from "starknet";

// ── Event union types ──

export interface VillageTickedEvent {
  kind: "VillageTicked";
  villageId: number;
  tick: number;
  foodDelta: number; // i128 → float (÷1000)
  populationDelta: number;
}

export interface CombatResolvedEvent {
  kind: "CombatResolved";
  attackerVillage: number;
  defenderVillage: number;
  tick: number;
  attackerPower: number;
  defenderPower: number;
  attackerWon: boolean;
}

export interface VictoryAchievedEvent {
  kind: "VictoryAchieved";
  villageId: number;
  victoryType: number;
  tick: number;
}

export interface CovenantEnactedEvent {
  kind: "CovenantEnacted";
  covenantId: number;
  villageId: number;
  nameHash: string;
  tick: number;
}

export interface InventionRegisteredEvent {
  kind: "InventionRegistered";
  inventionId: number;
  originVillageId: number;
  inventionType: number;
  tick: number;
}

export interface KnowledgeSpreadEvent {
  kind: "KnowledgeSpread";
  inventionId: number;
  targetVillageId: number;
  tick: number;
}

export interface InstitutionFoundedEvent {
  kind: "InstitutionFounded";
  institutionId: number;
  founderVillageId: number;
  institutionType: number;
  tick: number;
}

export interface InstitutionJoinedEvent {
  kind: "InstitutionJoined";
  institutionId: number;
  villageId: number;
  tick: number;
}

export interface InstitutionDissolvedEvent {
  kind: "InstitutionDissolved";
  institutionId: number;
  tick: number;
}

export interface TradeProposedEvent {
  kind: "TradeProposed";
  tradeId: number;
  fromVillage: number;
  toVillage: number;
  tick: number;
}

export interface TradeAcceptedEvent {
  kind: "TradeAccepted";
  tradeId: number;
  fromVillage: number;
  toVillage: number;
  tick: number;
}

export interface TradeExecutedEvent {
  kind: "TradeExecuted";
  routeId: number;
  fromVillage: number;
  toVillage: number;
  tick: number;
}

export type DojoGameEvent =
  | VillageTickedEvent
  | CombatResolvedEvent
  | VictoryAchievedEvent
  | CovenantEnactedEvent
  | InventionRegisteredEvent
  | KnowledgeSpreadEvent
  | InstitutionFoundedEvent
  | InstitutionJoinedEvent
  | InstitutionDissolvedEvent
  | TradeProposedEvent
  | TradeAcceptedEvent
  | TradeExecutedEvent;

// ── Selector map (computed once) ──

const EVENT_NAMES = [
  "VillageTicked",
  "CombatResolved",
  "VictoryAchieved",
  "CovenantEnacted",
  "InventionRegistered",
  "KnowledgeSpread",
  "InstitutionFounded",
  "InstitutionJoined",
  "InstitutionDissolved",
  "TradeProposed",
  "TradeAccepted",
  "TradeExecuted",
] as const;

type EventName = (typeof EVENT_NAMES)[number];

const SELECTOR_TO_NAME = new Map<string, EventName>();

for (const name of EVENT_NAMES) {
  // sn_keccak produces the selector used as keys[0] in Starknet events
  const selector = hash.getSelectorFromName(name);
  SELECTOR_TO_NAME.set(selector, name);
}

// ── Decoding helpers ──

function feltToU32(hex: string): number {
  return Number(BigInt(hex));
}

function feltToU64(hex: string): number {
  return Number(BigInt(hex));
}

function feltToU128(hex: string): number {
  return Number(BigInt(hex));
}

function feltToBool(hex: string): boolean {
  return BigInt(hex) !== 0n;
}

/** Cairo i128 fixed-point ×1000 → float */
function fromFixed1000Signed(hex: string): number {
  const raw = BigInt(hex);
  // Cairo i128 can be stored as felt252; negative values encoded as large felts
  const FELT_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;
  const half = FELT_PRIME / 2n;
  const signed = raw > half ? raw - FELT_PRIME : raw;
  return Number(signed) / 1000;
}

// ── Main parser ──

interface StarknetEvent {
  keys: string[];
  data: string[];
}

/**
 * Parse all recognized game events from a transaction receipt.
 * Unrecognized events (e.g. system/transfer events) are silently skipped.
 */
export function parseReceiptEvents(
  events: StarknetEvent[],
): DojoGameEvent[] {
  const parsed: DojoGameEvent[] = [];

  for (const ev of events) {
    if (!ev.keys || ev.keys.length === 0) continue;

    const eventName = SELECTOR_TO_NAME.get(ev.keys[0]);
    if (!eventName) continue;

    const decoded = decodeEvent(eventName, ev.keys, ev.data);
    if (decoded) parsed.push(decoded);
  }

  return parsed;
}

function decodeEvent(
  name: EventName,
  keys: string[],
  data: string[],
): DojoGameEvent | null {
  switch (name) {
    case "VillageTicked":
      // keys: [selector, village_id]  data: [tick, food_delta, population_delta]
      if (keys.length < 2 || data.length < 3) return null;
      return {
        kind: "VillageTicked",
        villageId: feltToU32(keys[1]),
        tick: feltToU64(data[0]),
        foodDelta: fromFixed1000Signed(data[1]),
        populationDelta: Number(BigInt(data[2])),
      };

    case "CombatResolved":
      // keys: [selector, attacker, defender]  data: [tick, atk_power, def_power, atk_won]
      if (keys.length < 3 || data.length < 4) return null;
      return {
        kind: "CombatResolved",
        attackerVillage: feltToU32(keys[1]),
        defenderVillage: feltToU32(keys[2]),
        tick: feltToU64(data[0]),
        attackerPower: feltToU128(data[1]),
        defenderPower: feltToU128(data[2]),
        attackerWon: feltToBool(data[3]),
      };

    case "VictoryAchieved":
      // keys: [selector, village_id]  data: [victory_type, tick]
      if (keys.length < 2 || data.length < 2) return null;
      return {
        kind: "VictoryAchieved",
        villageId: feltToU32(keys[1]),
        victoryType: feltToU32(data[0]),
        tick: feltToU64(data[1]),
      };

    case "CovenantEnacted":
      // keys: [selector, covenant_id]  data: [village_id, name_hash, tick]
      if (keys.length < 2 || data.length < 3) return null;
      return {
        kind: "CovenantEnacted",
        covenantId: feltToU32(keys[1]),
        villageId: feltToU32(data[0]),
        nameHash: data[1],
        tick: feltToU64(data[2]),
      };

    case "InventionRegistered":
      // keys: [selector, invention_id]  data: [origin_village_id, invention_type, tick]
      if (keys.length < 2 || data.length < 3) return null;
      return {
        kind: "InventionRegistered",
        inventionId: feltToU32(keys[1]),
        originVillageId: feltToU32(data[0]),
        inventionType: feltToU32(data[1]),
        tick: feltToU64(data[2]),
      };

    case "KnowledgeSpread":
      // keys: [selector, invention_id, target_village_id]  data: [tick]
      if (keys.length < 3 || data.length < 1) return null;
      return {
        kind: "KnowledgeSpread",
        inventionId: feltToU32(keys[1]),
        targetVillageId: feltToU32(keys[2]),
        tick: feltToU64(data[0]),
      };

    case "InstitutionFounded":
      // keys: [selector, institution_id]  data: [founder_village_id, institution_type, tick]
      if (keys.length < 2 || data.length < 3) return null;
      return {
        kind: "InstitutionFounded",
        institutionId: feltToU32(keys[1]),
        founderVillageId: feltToU32(data[0]),
        institutionType: feltToU32(data[1]),
        tick: feltToU64(data[2]),
      };

    case "InstitutionJoined":
      // keys: [selector, institution_id]  data: [village_id, tick]
      if (keys.length < 2 || data.length < 2) return null;
      return {
        kind: "InstitutionJoined",
        institutionId: feltToU32(keys[1]),
        villageId: feltToU32(data[0]),
        tick: feltToU64(data[1]),
      };

    case "InstitutionDissolved":
      // keys: [selector, institution_id]  data: [tick]
      if (keys.length < 2 || data.length < 1) return null;
      return {
        kind: "InstitutionDissolved",
        institutionId: feltToU32(keys[1]),
        tick: feltToU64(data[0]),
      };

    case "TradeProposed":
      // keys: [selector, trade_id]  data: [from_village, to_village, tick]
      if (keys.length < 2 || data.length < 3) return null;
      return {
        kind: "TradeProposed",
        tradeId: feltToU32(keys[1]),
        fromVillage: feltToU32(data[0]),
        toVillage: feltToU32(data[1]),
        tick: feltToU64(data[2]),
      };

    case "TradeAccepted":
      // keys: [selector, trade_id]  data: [from_village, to_village, tick]
      if (keys.length < 2 || data.length < 3) return null;
      return {
        kind: "TradeAccepted",
        tradeId: feltToU32(keys[1]),
        fromVillage: feltToU32(data[0]),
        toVillage: feltToU32(data[1]),
        tick: feltToU64(data[2]),
      };

    case "TradeExecuted":
      // keys: [selector, route_id]  data: [from_village, to_village, tick]
      if (keys.length < 2 || data.length < 3) return null;
      return {
        kind: "TradeExecuted",
        routeId: feltToU32(keys[1]),
        fromVillage: feltToU32(data[0]),
        toVillage: feltToU32(data[1]),
        tick: feltToU64(data[2]),
      };

    default:
      return null;
  }
}
