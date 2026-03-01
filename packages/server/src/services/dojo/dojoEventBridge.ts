/**
 * dojoEventBridge.ts — DojoGameEvent[] -> GameEvent[] conversion
 *
 * Converts on-chain events to off-chain GameEvent format,
 * using VillageIdMapper for u32 -> UUID reverse lookup.
 */

import type { GameEvent, GameEventType } from "@murasato/shared";
import type { DojoGameEvent, CombatResolvedEvent, VictoryAchievedEvent } from "./dojoEventParser.ts";
import type { VillageIdMapper } from "./dojoSync.ts";

const VICTORY_TYPE_LABELS: Record<number, string> = {
  0: "none",
  1: "domination",
  2: "cultural",
  3: "scientific",
  4: "economic",
  5: "diplomatic",
};

/**
 * Convert a batch of on-chain events to off-chain GameEvents.
 * Returns only events that successfully map to known villages.
 */
export function bridgeDojoEvents(
  dojoEvents: DojoGameEvent[],
  gameId: string,
  tick: number,
  mapper: VillageIdMapper,
): GameEvent[] {
  const results: GameEvent[] = [];

  for (const ev of dojoEvents) {
    const converted = convertOne(ev, gameId, tick, mapper);
    if (converted) results.push(converted);
  }

  return results;
}

/** Extract CombatResolved events for direct use */
export function extractCombatEvents(
  dojoEvents: DojoGameEvent[],
): CombatResolvedEvent[] {
  return dojoEvents.filter(
    (e): e is CombatResolvedEvent => e.kind === "CombatResolved",
  );
}

/** Extract VictoryAchieved events for direct use */
export function extractVictoryEvents(
  dojoEvents: DojoGameEvent[],
): VictoryAchievedEvent[] {
  return dojoEvents.filter(
    (e): e is VictoryAchievedEvent => e.kind === "VictoryAchieved",
  );
}

// ── Internal ──

function convertOne(
  ev: DojoGameEvent,
  gameId: string,
  tick: number,
  mapper: VillageIdMapper,
): GameEvent | null {
  switch (ev.kind) {
    case "VillageTicked": {
      const uuid = mapper.toUuid(ev.villageId);
      if (!uuid) return null;
      // Starvation is detected when foodDelta is negative and severe
      const isStarvation = ev.foodDelta < -0.5 && ev.populationDelta < 0;
      if (!isStarvation) return null; // Only emit event for starvation; normal ticks are state-synced
      return makeEvent(gameId, "death", tick, [],
        `Starvation occurred in village ${uuid} (population ${ev.populationDelta})`,
        { villageId: uuid, populationLost: -ev.populationDelta, _origin: "onchain" },
      );
    }

    case "CombatResolved": {
      const atkUuid = mapper.toUuid(ev.attackerVillage);
      const defUuid = mapper.toUuid(ev.defenderVillage);
      if (!atkUuid || !defUuid) return null;
      return makeEvent(gameId, "war", tick, [],
        `${atkUuid} attacked ${defUuid} (${ev.attackerWon ? "victory" : "defeat"})`,
        {
          _origin: "onchain",
          combatResult: {
            attackerVillageId: atkUuid,
            defenderVillageId: defUuid,
            attackerWon: ev.attackerWon,
            attackerLosses: [],
            defenderLosses: [],
          },
        },
      );
    }

    case "VictoryAchieved": {
      const uuid = mapper.toUuid(ev.villageId);
      if (!uuid) return null;
      const label = VICTORY_TYPE_LABELS[ev.victoryType] ?? `type_${ev.victoryType}`;
      return makeEvent(gameId, "discovery", tick, [],
        `Victory achieved: ${label} by ${uuid}`,
        {
          _origin: "onchain",
          victory: {
            winnerId: uuid,
            villageId: uuid,
            victoryType: label,
            tick: ev.tick,
            score: 0,
          },
        },
      );
    }

    case "CovenantEnacted": {
      const uuid = mapper.toUuid(ev.villageId);
      if (!uuid) return null;
      return makeEvent(gameId, "election", tick, [],
        `Covenant enacted in village ${uuid} (ID=${ev.covenantId})`,
        { _origin: "onchain", type: "covenant_enacted", covenantOnChainId: ev.covenantId },
      );
    }

    case "InventionRegistered": {
      const uuid = mapper.toUuid(ev.originVillageId);
      if (!uuid) return null;
      return makeEvent(gameId, "discovery", tick, [],
        `Invention registered in village ${uuid} (ID=${ev.inventionId})`,
        { _origin: "onchain", type: "invention_registered", inventionOnChainId: ev.inventionId },
      );
    }

    case "KnowledgeSpread": {
      const uuid = mapper.toUuid(ev.targetVillageId);
      if (!uuid) return null;
      return makeEvent(gameId, "discovery", tick, [],
        `Knowledge spread to village ${uuid} (invention ID=${ev.inventionId})`,
        { _origin: "onchain", type: "knowledge_spread", inventionOnChainId: ev.inventionId },
      );
    }

    case "InstitutionFounded": {
      const uuid = mapper.toUuid(ev.founderVillageId);
      if (!uuid) return null;
      return makeEvent(gameId, "discovery", tick, [],
        `Village ${uuid} founded an institution (ID=${ev.institutionId})`,
        { _origin: "onchain", type: "institution_founded", institutionOnChainId: ev.institutionId },
      );
    }

    case "InstitutionJoined": {
      const uuid = mapper.toUuid(ev.villageId);
      if (!uuid) return null;
      return makeEvent(gameId, "diplomacy", tick, [],
        `Village ${uuid} joined an institution (ID=${ev.institutionId})`,
        { _origin: "onchain", type: "institution_joined", institutionOnChainId: ev.institutionId },
      );
    }

    case "InstitutionDissolved": {
      return makeEvent(gameId, "discovery", tick, [],
        `Institution dissolved (ID=${ev.institutionId})`,
        { _origin: "onchain", type: "institution_dissolved", institutionOnChainId: ev.institutionId },
      );
    }

    case "TradeProposed": {
      const fromUuid = mapper.toUuid(ev.fromVillage);
      const toUuid = mapper.toUuid(ev.toVillage);
      if (!fromUuid || !toUuid) return null;
      return makeEvent(gameId, "trade", tick, [],
        `${fromUuid} proposed trade to ${toUuid} (ID=${ev.tradeId})`,
        { _origin: "onchain", type: "trade_proposed", tradeId: ev.tradeId, fromVillage: fromUuid, toVillage: toUuid },
      );
    }

    case "TradeAccepted": {
      const fromUuid = mapper.toUuid(ev.fromVillage);
      const toUuid = mapper.toUuid(ev.toVillage);
      if (!fromUuid || !toUuid) return null;
      return makeEvent(gameId, "trade", tick, [],
        `Trade accepted between ${fromUuid} and ${toUuid} (ID=${ev.tradeId})`,
        { _origin: "onchain", type: "trade_accepted", tradeId: ev.tradeId, fromVillage: fromUuid, toVillage: toUuid },
      );
    }

    case "TradeExecuted": {
      const fromUuid = mapper.toUuid(ev.fromVillage);
      const toUuid = mapper.toUuid(ev.toVillage);
      if (!fromUuid || !toUuid) return null;
      return makeEvent(gameId, "trade", tick, [],
        `Trade route ${ev.routeId} executed: ${fromUuid} <-> ${toUuid}`,
        { _origin: "onchain", type: "trade_executed", routeId: ev.routeId, fromVillage: fromUuid, toVillage: toUuid },
      );
    }

    default:
      return null;
  }
}

function makeEvent(
  gameId: string,
  type: GameEventType,
  tick: number,
  actorIds: string[],
  description: string,
  data: Record<string, unknown>,
): GameEvent {
  return {
    id: `evt_chain_${crypto.randomUUID()}`,
    gameId,
    type,
    tick,
    actorIds,
    description,
    data,
  };
}
