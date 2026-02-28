import type {
  Village, DiplomaticRelation, DiplomaticStatus, TradeAgreement,
  ResourceType, GameEvent, AgentState,
} from '@murasato/shared';
import { X402_DEFAULT_TRADE_FEE_USD, X402_ALLIANCE_FEE_USD } from '@murasato/shared';
import { callLLM, extractJSON } from '../agent/llmClient.ts';
import type { AgentPaymentClient } from '../services/x402/agentPaymentClient.ts';

function generateId(): string {
  return `trade_${crypto.randomUUID()}`;
}

// --- Diplomacy state ---

export class DiplomacyManager {
  private relations = new Map<string, DiplomaticRelation>(); // "v1,v2" sorted
  private trades: TradeAgreement[] = [];

  private key(v1: string, v2: string): string {
    return [v1, v2].sort().join(',');
  }

  getRelation(v1: string, v2: string): DiplomaticRelation {
    const k = this.key(v1, v2);
    let rel = this.relations.get(k);
    if (!rel) {
      rel = {
        villageId1: [v1, v2].sort()[0],
        villageId2: [v1, v2].sort()[1],
        status: 'neutral',
        tension: 30,
        tradeActive: false,
        lastInteractionTick: 0,
      };
      this.relations.set(k, rel);
    }
    return rel;
  }

  setStatus(v1: string, v2: string, status: DiplomaticStatus): void {
    const rel = this.getRelation(v1, v2);
    rel.status = status;
  }

  getAllRelations(): DiplomaticRelation[] {
    return [...this.relations.values()];
  }

  getTrades(): TradeAgreement[] {
    return this.trades;
  }

  addTrade(trade: TradeAgreement): void {
    this.trades.push(trade);
  }

  removeTrade(tradeId: string): void {
    this.trades = this.trades.filter(t => t.id !== tradeId);
  }

  // --- Tension dynamics ---

  adjustTension(v1: string, v2: string, delta: number): void {
    const rel = this.getRelation(v1, v2);
    rel.tension = Math.max(0, Math.min(100, rel.tension + delta));

    // Auto status transitions
    if (rel.tension >= 90 && rel.status !== 'war' && rel.status !== 'allied') {
      rel.status = 'hostile';
    } else if (rel.tension <= 20 && rel.status === 'hostile') {
      rel.status = 'neutral';
    } else if (rel.tension <= 10 && rel.status === 'neutral') {
      rel.status = 'friendly';
    }
  }

  // --- Check if diplomatic event should occur between villages ---

  checkDiplomaticEvents(
    villages: Map<string, Village>,
    agents: Map<string, AgentState>,
    tick: number,
  ): { rel: DiplomaticRelation; village1: Village; village2: Village }[] {
    const candidates: { rel: DiplomaticRelation; village1: Village; village2: Village }[] = [];
    const villageList = [...villages.values()];

    for (let i = 0; i < villageList.length; i++) {
      for (let j = i + 1; j < villageList.length; j++) {
        const v1 = villageList[i];
        const v2 = villageList[j];
        const rel = this.getRelation(v1.id, v2.id);

        // Only process if enough time has passed since last interaction
        if (tick - rel.lastInteractionTick < 50) continue;

        candidates.push({ rel, village1: v1, village2: v2 });
      }
    }

    return candidates;
  }

  // --- Execute trades ---

  executeTrades(villages: Map<string, Village>, tick: number, agentPaymentClient?: AgentPaymentClient): GameEvent[] {
    const events: GameEvent[] = [];

    for (const trade of this.trades) {
      if (tick % trade.intervalTicks !== 0) continue;

      const fromVillage = villages.get(trade.fromVillageId);
      const toVillage = villages.get(trade.toVillageId);
      if (!fromVillage || !toVillage) continue;

      // Check if from village can fulfill offer
      let canFulfill = true;
      for (const [resource, amount] of Object.entries(trade.offer)) {
        if ((fromVillage.resources[resource as ResourceType] ?? 0) < (amount ?? 0)) {
          canFulfill = false;
          break;
        }
      }

      // Check if to village can fulfill request
      let canReturn = true;
      for (const [resource, amount] of Object.entries(trade.request)) {
        if ((toVillage.resources[resource as ResourceType] ?? 0) < (amount ?? 0)) {
          canReturn = false;
          break;
        }
      }

      if (!canFulfill || !canReturn) continue;

      // Execute trade
      for (const [resource, amount] of Object.entries(trade.offer)) {
        const r = resource as ResourceType;
        fromVillage.resources[r] = (fromVillage.resources[r] ?? 0) - (amount ?? 0);
        toVillage.resources[r] = (toVillage.resources[r] ?? 0) + (amount ?? 0);
      }
      for (const [resource, amount] of Object.entries(trade.request)) {
        const r = resource as ResourceType;
        toVillage.resources[r] = (toVillage.resources[r] ?? 0) - (amount ?? 0);
        fromVillage.resources[r] = (fromVillage.resources[r] ?? 0) + (amount ?? 0);
      }

      // Reduce tension through trade
      this.adjustTension(trade.fromVillageId, trade.toVillageId, -2);

      events.push({
        id: `evt_${crypto.randomUUID()}`,
        gameId: '',
        type: 'trade',
        tick,
        actorIds: [],
        description: `${fromVillage.name}と${toVillage.name}が交易を行った`,
        data: { offer: trade.offer, request: trade.request },
      });

      // x402: 交易決済を記録
      if (agentPaymentClient) {
        const tradeValue = estimateTradeValueUSD(trade.offer);
        agentPaymentClient.pay(
          trade.fromVillageId, trade.toVillageId,
          tradeValue, 'agent_trade', tick, trade.id,
        );
      }
    }

    return events;
  }
}

// --- Evaluate diplomatic disposition between two villages ---

export function evaluateDisposition(
  v1: Village,
  v2: Village,
  agentsV1: AgentState[],
  agentsV2: AgentState[],
): { tension: number; reason: string } {
  let tension = 0;
  const reasons: string[] = [];

  // Governance conflict
  if (v1.governance.type !== v2.governance.type) {
    tension += 15;
    reasons.push('統治形態の違い');
  }

  // Economic philosophy conflict
  const econ1 = getMajorityEconomics(agentsV1);
  const econ2 = getMajorityEconomics(agentsV2);
  if (econ1 !== econ2) {
    tension += 10;
    reasons.push('経済思想の相違');
  }

  // Territory overlap
  const overlap = v1.territory.filter(p1 =>
    v2.territory.some(p2 => p1.x === p2.x && p1.y === p2.y),
  );
  if (overlap.length > 0) {
    tension += overlap.length * 5;
    reasons.push('領土重複');
  }

  // Population size difference (bigger village is more threatening)
  const sizeDiff = Math.abs(v1.population.length - v2.population.length);
  if (sizeDiff > 5) {
    tension += sizeDiff * 2;
    reasons.push('人口格差');
  }

  // Shared cultural traits reduce tension
  const sharedTraditions = v1.culture.traditions.filter(t =>
    v2.culture.traditions.some(t2 => t2.includes(t) || t.includes(t2)),
  );
  tension -= sharedTraditions.length * 5;

  return {
    tension: Math.max(0, Math.min(100, tension)),
    reason: reasons.join('、') || '特に問題なし',
  };
}

function getMajorityEconomics(agents: AgentState[]): string {
  const counts: Record<string, number> = {};
  for (const a of agents) {
    const e = a.identity.philosophy.economics;
    counts[e] = (counts[e] ?? 0) + 1;
  }
  let max = 0;
  let result = 'market';
  for (const [e, c] of Object.entries(counts)) {
    if (c > max) { max = c; result = e; }
  }
  return result;
}

// --- Propose trade agreement via LLM ---

export async function proposeTrade(
  v1: Village,
  v2: Village,
): Promise<TradeAgreement | null> {
  // Identify surplus and deficit resources
  const surplus1 = findSurplus(v1);
  const deficit1 = findDeficit(v1);
  const surplus2 = findSurplus(v2);
  const deficit2 = findDeficit(v2);

  // Check for complementary needs
  const canOffer = surplus1.filter(r => deficit2.includes(r));
  const canRequest = surplus2.filter(r => deficit1.includes(r));

  if (canOffer.length === 0 || canRequest.length === 0) return null;

  const offerResource = canOffer[0];
  const requestResource = canRequest[0];
  const offerAmount = Math.min(10, Math.floor((v1.resources[offerResource] ?? 0) * 0.2));
  const requestAmount = Math.min(10, Math.floor((v2.resources[requestResource] ?? 0) * 0.2));

  if (offerAmount <= 0 || requestAmount <= 0) return null;

  return {
    id: generateId(),
    fromVillageId: v1.id,
    toVillageId: v2.id,
    offer: { [offerResource]: offerAmount } as Partial<Record<ResourceType, number>>,
    request: { [requestResource]: requestAmount } as Partial<Record<ResourceType, number>>,
    establishedTick: 0,
    intervalTicks: 100,
  };
}

function findSurplus(village: Village): ResourceType[] {
  const resources: ResourceType[] = ['food', 'wood', 'stone', 'ore', 'herbs', 'clay', 'fiber'];
  return resources.filter(r => (village.resources[r] ?? 0) > 30);
}

function findDeficit(village: Village): ResourceType[] {
  const resources: ResourceType[] = ['food', 'wood', 'stone', 'ore', 'herbs', 'clay', 'fiber'];
  return resources.filter(r => (village.resources[r] ?? 0) < 10);
}

// --- Declare war ---

export function declareWar(
  diplomacy: DiplomacyManager,
  v1: Village,
  v2: Village,
  tick: number,
): GameEvent {
  diplomacy.setStatus(v1.id, v2.id, 'war');
  // Cancel any active trades
  for (const trade of diplomacy.getTrades()) {
    if (
      (trade.fromVillageId === v1.id && trade.toVillageId === v2.id) ||
      (trade.fromVillageId === v2.id && trade.toVillageId === v1.id)
    ) {
      diplomacy.removeTrade(trade.id);
    }
  }

  return {
    id: `evt_${crypto.randomUUID()}`,
    gameId: '',
    type: 'war',
    tick,
    actorIds: [],
    description: `${v1.name}と${v2.name}の間で戦争が勃発した`,
    data: { village1: v1.id, village2: v2.id },
  };
}

// --- Make peace ---

export function makePeace(
  diplomacy: DiplomacyManager,
  v1: Village,
  v2: Village,
  tick: number,
): GameEvent {
  diplomacy.setStatus(v1.id, v2.id, 'neutral');
  const rel = diplomacy.getRelation(v1.id, v2.id);
  rel.tension = 40;

  return {
    id: `evt_${crypto.randomUUID()}`,
    gameId: '',
    type: 'peace',
    tick,
    actorIds: [],
    description: `${v1.name}と${v2.name}が和平を結んだ`,
    data: { village1: v1.id, village2: v2.id },
  };
}

// --- Form alliance ---

export function formAlliance(
  diplomacy: DiplomacyManager,
  v1: Village,
  v2: Village,
  tick: number,
  agentPaymentClient?: AgentPaymentClient,
): GameEvent {
  diplomacy.setStatus(v1.id, v2.id, 'allied');
  const rel = diplomacy.getRelation(v1.id, v2.id);
  rel.tension = 5;

  // x402: 同盟締結手数料
  if (agentPaymentClient) {
    agentPaymentClient.pay(v1.id, v2.id, X402_ALLIANCE_FEE_USD, 'agent_alliance', tick);
    agentPaymentClient.pay(v2.id, v1.id, X402_ALLIANCE_FEE_USD, 'agent_alliance', tick);
  }

  return {
    id: `evt_${crypto.randomUUID()}`,
    gameId: '',
    type: 'alliance',
    tick,
    actorIds: [],
    description: `${v1.name}と${v2.name}が同盟を結んだ`,
    data: { village1: v1.id, village2: v2.id },
  };
}

// --- 4X integration: check if two villages are at war ---

export function areAtWar(diplomacy: DiplomacyManager, v1: string, v2: string): boolean {
  const rel = diplomacy.getRelation(v1, v2);
  return rel.status === 'war';
}

export function areAllied(diplomacy: DiplomacyManager, v1: string, v2: string): boolean {
  const rel = diplomacy.getRelation(v1, v2);
  return rel.status === 'allied';
}

/** Count how many villages are allied with the given village */
export function countAllies(diplomacy: DiplomacyManager, villageId: string, allVillageIds: string[]): number {
  let count = 0;
  for (const otherId of allVillageIds) {
    if (otherId === villageId) continue;
    if (areAllied(diplomacy, villageId, otherId)) count++;
  }
  return count;
}

// --- Periodic diplomacy tick ---

export async function processDiplomacy(
  diplomacy: DiplomacyManager,
  villages: Map<string, Village>,
  agents: Map<string, AgentState>,
  gameId: string,
  tick: number,
  agentPaymentClient?: AgentPaymentClient,
): Promise<GameEvent[]> {
  const events: GameEvent[] = [];

  // Execute active trades
  const tradeEvents = diplomacy.executeTrades(villages, tick, agentPaymentClient);
  for (const e of tradeEvents) { e.gameId = gameId; events.push(e); }

  // Check for diplomatic events between village pairs
  const candidates = diplomacy.checkDiplomaticEvents(villages, agents, tick);

  for (const { rel, village1, village2 } of candidates) {
    rel.lastInteractionTick = tick;

    const agents1 = village1.population.map(id => agents.get(id)).filter((a): a is AgentState => !!a && a.identity.status !== 'dead');
    const agents2 = village2.population.map(id => agents.get(id)).filter((a): a is AgentState => !!a && a.identity.status !== 'dead');

    // Update tension
    const disposition = evaluateDisposition(village1, village2, agents1, agents2);
    diplomacy.adjustTension(village1.id, village2.id, (disposition.tension - rel.tension) * 0.1);

    // State transitions
    if (rel.status === 'hostile' && rel.tension >= 85 && Math.random() < 0.1) {
      const evt = declareWar(diplomacy, village1, village2, tick);
      evt.gameId = gameId;
      events.push(evt);
    } else if (rel.status === 'war' && rel.tension <= 30 && Math.random() < 0.15) {
      const evt = makePeace(diplomacy, village1, village2, tick);
      evt.gameId = gameId;
      events.push(evt);
    } else if (rel.status === 'friendly' && rel.tension <= 10 && Math.random() < 0.05) {
      const evt = formAlliance(diplomacy, village1, village2, tick, agentPaymentClient);
      evt.gameId = gameId;
      events.push(evt);
    }

    // Propose trade between friendly/neutral villages
    if ((rel.status === 'friendly' || rel.status === 'allied' || rel.status === 'neutral') && !rel.tradeActive) {
      if (Math.random() < 0.1) {
        const trade = await proposeTrade(village1, village2);
        if (trade) {
          trade.establishedTick = tick;
          diplomacy.addTrade(trade);
          rel.tradeActive = true;
          events.push({
            id: `evt_${crypto.randomUUID()}`,
            gameId,
            type: 'diplomacy',
            tick,
            actorIds: [],
            description: `${village1.name}と${village2.name}が交易協定を結んだ`,
            data: { trade },
          });
        }
      }
    }
  }

  return events;
}

// --- x402: 資源量から USD 換算 ---

function estimateTradeValueUSD(
  resources: Partial<Record<ResourceType, number>>,
): string {
  const RESOURCE_PRICE = 0.00001;
  let total = 0;
  for (const amount of Object.values(resources)) {
    total += amount ?? 0;
  }
  return (total * RESOURCE_PRICE).toFixed(6);
}
