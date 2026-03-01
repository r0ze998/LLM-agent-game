// === F9: Information Propagation System ===

import type { AgentState, InformationPiece, InformationType } from '@murasato/shared';

// --- Create information piece ---

export function createInformationPiece(
  type: InformationType,
  content: string,
  originAgentId: string,
  originTick: number,
  originVillageId?: string,
): InformationPiece {
  return {
    id: `info_${crypto.randomUUID()}`,
    type,
    content,
    reliability: 1.0,
    hopCount: 0,
    knownByAgentIds: [originAgentId],
    originTick,
    originVillageId,
  };
}

// --- Transfer information between agents (conversation hop) ---

export function transferInformation(
  info: InformationPiece,
  fromAgentId: string,
  toAgentId: string,
): InformationPiece {
  // Create a copy with degraded reliability
  const transferred: InformationPiece = {
    ...info,
    id: `info_${crypto.randomUUID()}`,
    reliability: Math.max(0, info.reliability - 0.15),
    hopCount: info.hopCount + 1,
    knownByAgentIds: [...info.knownByAgentIds, toAgentId],
  };

  // Auto-degrade to rumor at low reliability
  if (transferred.reliability < 0.4 && transferred.type !== 'rumor') {
    transferred.type = 'rumor';
  }

  return transferred;
}

// --- Parse information from conversation exchange ---

export function parseConversationInformation(
  exchangeStrings: string[],
  a1Id: string,
  a2Id: string,
  tick: number,
  villageId?: string,
): InformationPiece[] {
  const pieces: InformationPiece[] = [];

  for (const content of exchangeStrings) {
    const type = classifyInformation(content);
    pieces.push(createInformationPiece(type, content, a1Id, tick, villageId));
  }

  return pieces;
}

// --- Classify information string into a type ---

function classifyInformation(content: string): InformationType {
  const lower = content.toLowerCase();
  if (lower.includes('disaster') || lower.includes('storm') || lower.includes('earthquake') || lower.includes('plague')) {
    return 'disaster_warning';
  }
  if (lower.includes('resource') || lower.includes('vein') || lower.includes('food')) {
    return 'resource_location';
  }
  if (lower.includes('war') || lower.includes('battle') || lower.includes('attack')) {
    return 'war_status';
  }
  if (lower.includes('village') || lower.includes('prosper') || lower.includes('famine')) {
    return 'village_condition';
  }
  return 'rumor';
}

// --- Check if info should influence migration ---

export function shouldInfluenceMigration(
  info: InformationPiece,
  agentVillageId: string | null,
): boolean {
  if (info.type !== 'village_condition') return false;
  if (info.reliability < 0.3) return false;
  // If info is about a prosperous village different from current
  if (info.originVillageId && info.originVillageId !== agentVillageId) {
    return info.content.includes('prosper') || info.content.includes('abundant') || info.content.includes('plentiful food');
  }
  return false;
}

// --- Prune old information ---

export function pruneOldInformation(
  pool: InformationPiece[],
  currentTick: number,
  maxAge: number = 200,
): InformationPiece[] {
  return pool.filter(info => currentTick - info.originTick < maxAge);
}

// --- Agent knowledge store ---

export class AgentKnowledgeStore {
  private knowledge = new Map<string, InformationPiece[]>(); // agentId -> known info

  getKnowledge(agentId: string): InformationPiece[] {
    return this.knowledge.get(agentId) ?? [];
  }

  addKnowledge(agentId: string, info: InformationPiece): void {
    const existing = this.knowledge.get(agentId) ?? [];
    // Don't add duplicates (by content match)
    if (existing.some(e => e.content === info.content)) return;
    existing.push(info);
    // Cap at 50 per agent
    if (existing.length > 50) existing.shift();
    this.knowledge.set(agentId, existing);
  }

  pruneAll(currentTick: number, maxAge: number = 200): void {
    for (const [agentId, infos] of this.knowledge) {
      const pruned = pruneOldInformation(infos, currentTick, maxAge);
      if (pruned.length === 0) {
        this.knowledge.delete(agentId);
      } else {
        this.knowledge.set(agentId, pruned);
      }
    }
  }
}
