import type {
  AgentState, Village, GovernanceSystem, GovernanceType,
  CultureState, Position, ResourceType, GameEvent,
} from '@murasato/shared';
import {
  VILLAGE_FOUNDING_MIN_AGENTS, VILLAGE_FOUNDING_MIN_TICKS,
  ELECTION_INTERVAL_TICKS,
} from '@murasato/shared';
import { callLLM, extractJSON } from '../agent/llmClient.ts';

function generateId(): string {
  return `vil_${crypto.randomUUID()}`;
}

// --- Proximity tracker for village founding ---

// Tracks how many consecutive ticks agents have been clustered
const clusterTracker = new Map<string, number>(); // clusterKey -> ticksClumped

function getClusterKey(agents: AgentState[]): string {
  return agents.map(a => a.identity.id).sort().join(',');
}

// --- Find clusters of nearby agents (not already in a village) ---

export function findAgentClusters(agents: AgentState[], minSize: number, maxDistance: number = 3): AgentState[][] {
  const homeless = agents.filter(a => !a.villageId && a.identity.status !== 'dead' && a.identity.status !== 'child');
  const visited = new Set<string>();
  const clusters: AgentState[][] = [];

  for (const agent of homeless) {
    if (visited.has(agent.identity.id)) continue;

    // BFS to find cluster
    const cluster: AgentState[] = [agent];
    visited.add(agent.identity.id);
    const queue = [agent];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const other of homeless) {
        if (visited.has(other.identity.id)) continue;
        const dist = Math.abs(current.position.x - other.position.x) + Math.abs(current.position.y - other.position.y);
        if (dist <= maxDistance) {
          cluster.push(other);
          visited.add(other.identity.id);
          queue.push(other);
        }
      }
    }

    if (cluster.length >= minSize) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

// --- Check if cluster qualifies for village founding ---

export function checkVillageForming(
  agents: AgentState[],
  tick: number,
): { ready: boolean; cluster: AgentState[] }[] {
  const clusters = findAgentClusters(agents, VILLAGE_FOUNDING_MIN_AGENTS);
  const results: { ready: boolean; cluster: AgentState[] }[] = [];

  // Clean stale entries
  for (const [key, startTick] of clusterTracker) {
    if (tick - startTick > VILLAGE_FOUNDING_MIN_TICKS * 3) {
      clusterTracker.delete(key);
    }
  }

  for (const cluster of clusters) {
    const key = getClusterKey(cluster);
    const existingTick = clusterTracker.get(key);

    if (!existingTick) {
      clusterTracker.set(key, tick);
      results.push({ ready: false, cluster });
    } else if (tick - existingTick >= VILLAGE_FOUNDING_MIN_TICKS) {
      clusterTracker.delete(key);
      results.push({ ready: true, cluster });
    } else {
      results.push({ ready: false, cluster });
    }
  }

  return results;
}

// --- Determine initial governance from members' philosophies ---

function determineGovernance(members: AgentState[]): GovernanceType {
  const votes: Record<GovernanceType, number> = {
    democratic: 0, meritocratic: 0, authoritarian: 0, anarchist: 0, theocratic: 0,
  };

  for (const agent of members) {
    votes[agent.identity.philosophy.governance]++;
  }

  let max = 0;
  let winner: GovernanceType = 'democratic';
  for (const [type, count] of Object.entries(votes)) {
    if (count > max) {
      max = count;
      winner = type as GovernanceType;
    }
  }
  return winner;
}

// --- Elect leader ---

function electLeader(members: AgentState[]): string {
  // Leadership skill + ambition weighted random
  const candidates = members.filter(a => a.identity.status === 'adult' || a.identity.status === 'elder');
  if (candidates.length === 0) return members[0].identity.id;

  let best = candidates[0];
  let bestScore = 0;

  for (const c of candidates) {
    const score = c.identity.skills.leadership * 2 + c.identity.personality.ambition + Math.random() * 20;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best.identity.id;
}

// --- Found a village ---

export async function foundVillage(
  gameId: string,
  members: AgentState[],
  tick: number,
): Promise<{ village: Village; event: GameEvent }> {
  const governanceType = determineGovernance(members);
  const leaderId = electLeader(members);

  // LLM generates village name
  let villageName: string;
  try {
    const memberNames = members.map(a => a.identity.name).join('、');
    const raw = await callLLM({
      system: 'あなたはJRPGの村の命名者です。メンバーの名前や性格から村の名前を1つだけ返してください。和風・ファンタジー風の名前で、2-4文字がベスト。名前のみ返してください。',
      userMessage: `メンバー: ${memberNames}\n統治: ${governanceType}\nこの村にふさわしい名前を1つだけ。`,
      importance: 'routine',
      maxTokens: 32,
    });
    villageName = raw.trim().replace(/["""「」]/g, '').slice(0, 10);
  } catch {
    villageName = `里${Math.floor(Math.random() * 100)}`;
  }

  // Calculate territory (tiles around center)
  const centerX = Math.round(members.reduce((s, a) => s + a.position.x, 0) / members.length);
  const centerY = Math.round(members.reduce((s, a) => s + a.position.y, 0) / members.length);
  const territory: Position[] = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      territory.push({ x: centerX + dx, y: centerY + dy });
    }
  }

  const village: Village = {
    id: generateId(),
    name: villageName,
    founderId: leaderId,
    governance: {
      type: governanceType,
      leaderId,
      councilIds: members.filter(a => a.identity.id !== leaderId).map(a => a.identity.id).slice(0, 3),
      electionIntervalTicks: governanceType === 'democratic' ? ELECTION_INTERVAL_TICKS : null,
      lastElectionTick: tick,
    },
    culture: createInitialCulture(members),
    population: members.map(a => a.identity.id),
    territory,
    resources: { food: 20, wood: 15, stone: 10, ore: 0, herbs: 5, clay: 0, fiber: 5 },
    laws: [],
    foundedAtTick: tick,
  };

  // Assign agents to village
  for (const agent of members) {
    agent.villageId = village.id;
  }

  const event: GameEvent = {
    id: `evt_${crypto.randomUUID()}`,
    gameId,
    type: 'founding',
    tick,
    actorIds: members.map(a => a.identity.id),
    description: `${villageName}が建村された。初代村長: ${members.find(a => a.identity.id === leaderId)?.identity.name}。統治形態: ${governanceType}`,
    data: { villageId: village.id, governanceType, population: members.length },
  };

  return { village, event };
}

// --- Election ---

/** Set of village IDs owned by players (elections are skipped, player = permanent leader) */
const playerOwnedVillages = new Set<string>();

export function markPlayerOwned(villageId: string): void {
  playerOwnedVillages.add(villageId);
}

export function unmarkPlayerOwned(villageId: string): void {
  playerOwnedVillages.delete(villageId);
}

export function isPlayerOwned(villageId: string): boolean {
  return playerOwnedVillages.has(villageId);
}

export async function runElection(
  gameId: string,
  village: Village,
  agents: Map<string, AgentState>,
  tick: number,
): Promise<{ newLeaderId: string; event: GameEvent } | null> {
  // Player-owned villages: player is permanent leader, skip elections
  if (playerOwnedVillages.has(village.id)) return null;

  if (village.governance.type !== 'democratic' && village.governance.type !== 'meritocratic') return null;
  if (!village.governance.electionIntervalTicks) return null;
  if (!village.governance.lastElectionTick) return null;
  if (tick - village.governance.lastElectionTick < village.governance.electionIntervalTicks) return null;

  const members = village.population
    .map(id => agents.get(id))
    .filter((a): a is AgentState => !!a && a.identity.status !== 'dead');

  if (members.length < 2) return null;

  const candidates = members.filter(a => a.identity.status === 'adult' || a.identity.status === 'elder');
  if (candidates.length < 2) return null;

  // Simple voting: each agent votes for the candidate they like most
  const votes = new Map<string, number>();
  for (const c of candidates) votes.set(c.identity.id, 0);

  for (const voter of members) {
    let bestCandidate = candidates[0].identity.id;
    let bestScore = -Infinity;

    for (const c of candidates) {
      if (c.identity.id === voter.identity.id) continue;
      // Vote based on: leadership skill, relationship, and shared philosophy
      let score = c.identity.skills.leadership * 3;
      if (c.identity.philosophy.governance === voter.identity.philosophy.governance) score += 20;
      score += Math.random() * 10;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = c.identity.id;
      }
    }

    votes.set(bestCandidate, (votes.get(bestCandidate) ?? 0) + 1);
  }

  // Find winner
  let winnerId = candidates[0].identity.id;
  let maxVotes = 0;
  for (const [id, count] of votes) {
    if (count > maxVotes) {
      maxVotes = count;
      winnerId = id;
    }
  }

  village.governance.leaderId = winnerId;
  village.governance.lastElectionTick = tick;

  const winner = agents.get(winnerId);
  const event: GameEvent = {
    id: `evt_${crypto.randomUUID()}`,
    gameId,
    type: 'election',
    tick,
    actorIds: [winnerId],
    description: `${village.name}で選挙が行われ、${winner?.identity.name ?? '不明'}が新村長に選ばれた（${maxVotes}票）`,
    data: { villageId: village.id, winnerId, votes: Object.fromEntries(votes) },
  };

  return { newLeaderId: winnerId, event };
}

// --- Law proposal (LLM-driven) ---

export async function proposeLaw(
  village: Village,
  proposer: AgentState,
  situation: string,
): Promise<string | null> {
  try {
    const raw = await callLLM({
      system: `あなたは${village.name}の住民${proposer.identity.name}です。村の状況を踏まえて、新しい法律を1つ提案してください。短い1文で表現してください。法律の文面のみ返してください。`,
      userMessage: `村の状況: ${situation}\n現在の法律: ${village.laws.join('、') || 'なし'}\n統治形態: ${village.governance.type}\n\n新しい法律を1つ提案:`,
      importance: 'social',
      maxTokens: 100,
    });
    return raw.trim().replace(/["""「」]/g, '').slice(0, 100);
  } catch {
    return null;
  }
}

// --- Vote on a law ---

export function voteLaw(
  village: Village,
  members: AgentState[],
  law: string,
): boolean {
  let yesVotes = 0;
  let noVotes = 0;

  for (const member of members) {
    if (member.identity.status === 'dead' || member.identity.status === 'child') continue;
    // Cooperative agents more likely to approve, competitive ones oppose
    const threshold = 50 - member.identity.personality.agreeableness * 0.3;
    if (Math.random() * 100 > threshold) {
      yesVotes++;
    } else {
      noVotes++;
    }
  }

  if (yesVotes > noVotes) {
    village.laws.push(law);
    // Keep only last 10 laws
    if (village.laws.length > 10) village.laws.shift();
    return true;
  }
  return false;
}

// --- Create initial culture for a new village ---

function createInitialCulture(members: AgentState[]): CultureState {
  // Derive from members' philosophies
  const avgOpenness = members.reduce((s, a) => s + a.identity.personality.openness, 0) / members.length;

  return {
    traditions: [],
    stories: [],
    taboos: [],
    namingStyle: avgOpenness > 60 ? '自由命名' : '和風',
    greetingStyle: avgOpenness > 60 ? 'カジュアル' : '丁寧',
    architectureStyle: avgOpenness > 60 ? 'モダン' : '伝統的',
  };
}

// --- Migration: agent joins existing village ---

export function joinVillage(agent: AgentState, village: Village): void {
  if (agent.villageId === village.id) return;
  // Leave old village
  if (agent.villageId) {
    // handled externally
  }
  agent.villageId = village.id;
  if (!village.population.includes(agent.identity.id)) {
    village.population.push(agent.identity.id);
  }
}

// --- Leave village ---

export function leaveVillage(agent: AgentState, village: Village): void {
  agent.villageId = null;
  village.population = village.population.filter(id => id !== agent.identity.id);
  // Remove from council if applicable
  village.governance.councilIds = village.governance.councilIds.filter(id => id !== agent.identity.id);
  if (village.governance.leaderId === agent.identity.id) {
    // Leader left — trigger new election or pick from council
    village.governance.leaderId = village.governance.councilIds[0] ?? village.population[0] ?? null;
  }
}
