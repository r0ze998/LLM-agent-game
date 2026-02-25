import type { AgentState, Relationship } from '@murasato/shared';

// --- Get or create relationship ---

export function getOrCreateRelationship(
  relationshipMap: Map<string, Relationship[]>,
  agentId: string,
  targetId: string,
  tick: number,
): Relationship {
  const rels = relationshipMap.get(agentId) ?? [];
  let rel = rels.find(r => r.targetId === targetId);

  if (!rel) {
    rel = {
      agentId,
      targetId,
      sentiment: 0,
      trust: 0,
      familiarity: 0,
      roles: [],
      lastInteractionTick: tick,
    };
    rels.push(rel);
    relationshipMap.set(agentId, rels);
  }

  return rel;
}

// --- Apply sentiment change with clamping ---

export function adjustSentiment(rel: Relationship, change: number): void {
  rel.sentiment = Math.max(-100, Math.min(100, rel.sentiment + change));
}

export function adjustTrust(rel: Relationship, change: number): void {
  rel.trust = Math.max(0, Math.min(100, rel.trust + change));
}

export function adjustFamiliarity(rel: Relationship, change: number): void {
  rel.familiarity = Math.max(0, Math.min(100, rel.familiarity + change));
}

// --- Add role (no duplicates) ---

export function addRole(rel: Relationship, role: string): void {
  if (!rel.roles.includes(role)) {
    rel.roles.push(role);
  }
}

// --- Natural sentiment decay towards neutral ---

export function decaySentiment(rels: Relationship[], tick: number, decayRate: number = 0.01): void {
  for (const rel of rels) {
    const ticksSince = tick - rel.lastInteractionTick;
    if (ticksSince < 50) continue; // No decay for recent interactions

    // Slowly decay towards 0
    if (rel.sentiment > 0) {
      rel.sentiment = Math.max(0, rel.sentiment - decayRate * ticksSince);
    } else if (rel.sentiment < 0) {
      rel.sentiment = Math.min(0, rel.sentiment + decayRate * ticksSince);
    }

    // Trust also slowly decays
    if (ticksSince > 200) {
      rel.trust = Math.max(0, rel.trust - 0.005 * ticksSince);
    }
  }
}

// --- Calculate compatibility between two agents ---

export function calculateCompatibility(a1: AgentState, a2: AgentState): number {
  const p1 = a1.identity.personality;
  const p2 = a2.identity.personality;

  // Similar personalities tend to get along
  const personalityDiff =
    Math.abs(p1.openness - p2.openness) +
    Math.abs(p1.agreeableness - p2.agreeableness) +
    Math.abs(p1.conscientiousness - p2.conscientiousness) +
    Math.abs(p1.courage - p2.courage) +
    Math.abs(p1.ambition - p2.ambition);

  const personalityScore = 1 - (personalityDiff / 500); // 0-1

  // Shared philosophy is a bonus
  let philosophyBonus = 0;
  if (a1.identity.philosophy.governance === a2.identity.philosophy.governance) philosophyBonus += 0.2;
  if (a1.identity.philosophy.economics === a2.identity.philosophy.economics) philosophyBonus += 0.15;

  const sharedValues = a1.identity.philosophy.values.filter(v => a2.identity.philosophy.values.includes(v));
  philosophyBonus += sharedValues.length * 0.1;

  return Math.min(1, personalityScore * 0.6 + philosophyBonus + 0.2);
}

// --- Find top N relationships sorted by sentiment ---

export function getTopRelationships(
  relationshipMap: Map<string, Relationship[]>,
  agentId: string,
  n: number,
  type: 'positive' | 'negative' | 'all' = 'all',
): Relationship[] {
  const rels = relationshipMap.get(agentId) ?? [];
  const filtered = type === 'all' ? rels :
    type === 'positive' ? rels.filter(r => r.sentiment > 0) :
    rels.filter(r => r.sentiment < 0);

  return [...filtered]
    .sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment))
    .slice(0, n);
}

// --- Check if two agents are rivals ---

export function areRivals(
  relationshipMap: Map<string, Relationship[]>,
  id1: string,
  id2: string,
): boolean {
  const rel1 = relationshipMap.get(id1)?.find(r => r.targetId === id2);
  const rel2 = relationshipMap.get(id2)?.find(r => r.targetId === id1);
  return (rel1?.sentiment ?? 0) < -30 && (rel2?.sentiment ?? 0) < -30;
}

// --- Set parent-child roles ---

export function setParentChildRoles(
  relationshipMap: Map<string, Relationship[]>,
  parentId: string,
  childId: string,
  tick: number,
): void {
  const parentRel = getOrCreateRelationship(relationshipMap, parentId, childId, tick);
  addRole(parentRel, 'parent');
  parentRel.sentiment = 80;
  parentRel.trust = 90;
  parentRel.familiarity = 100;

  const childRel = getOrCreateRelationship(relationshipMap, childId, parentId, tick);
  addRole(childRel, 'child');
  childRel.sentiment = 70;
  childRel.trust = 80;
  childRel.familiarity = 100;
}

// --- Set spouse roles ---

export function setSpouseRoles(
  relationshipMap: Map<string, Relationship[]>,
  id1: string,
  id2: string,
  tick: number,
): void {
  const rel1 = getOrCreateRelationship(relationshipMap, id1, id2, tick);
  addRole(rel1, 'spouse');

  const rel2 = getOrCreateRelationship(relationshipMap, id2, id1, tick);
  addRole(rel2, 'spouse');
}
