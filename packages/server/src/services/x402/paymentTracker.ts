/**
 * paymentTracker.ts — インメモリ決済記録
 *
 * costTracker (llmClient.ts) と同パターンで、x402 決済をトラッキングする。
 */

import type { X402PaymentRecord, X402PaymentPurpose } from '@murasato/shared';

export class PaymentTracker {
  private records: X402PaymentRecord[] = [];

  record(payment: Omit<X402PaymentRecord, 'id' | 'timestamp'>): X402PaymentRecord {
    const record: X402PaymentRecord = {
      ...payment,
      id: `pay_${crypto.randomUUID()}`,
      timestamp: Date.now(),
    };
    this.records.push(record);

    // メモリ上限: 最大 10,000 件
    if (this.records.length > 10_000) {
      this.records = this.records.slice(-5_000);
    }

    return record;
  }

  getByAgent(agentId: string): X402PaymentRecord[] {
    return this.records.filter(
      r => r.relatedEntityId === agentId || r.fromAddress === agentId,
    );
  }

  getByPurpose(purpose: X402PaymentPurpose): X402PaymentRecord[] {
    return this.records.filter(r => r.purpose === purpose);
  }

  getTotalRevenue(): number {
    return this.records.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  }

  getRecent(limit: number = 50): X402PaymentRecord[] {
    return this.records.slice(-limit);
  }

  getCount(): number {
    return this.records.length;
  }

  /**
   * 受取アドレス別の累計収益を計算する。
   * 経済勝利条件の判定に使用。
   */
  getRevenueByAddress(): Map<string, number> {
    const result = new Map<string, number>();
    for (const r of this.records) {
      const prev = result.get(r.toAddress) ?? 0;
      result.set(r.toAddress, prev + parseFloat(r.amount));
    }
    return result;
  }

  /**
   * relatedEntityId (村IDやエージェントID) 別の受取収益を計算する。
   * アドレス→村IDのマッピングが不要な簡易版。
   */
  getRevenueByEntity(): Map<string, number> {
    const result = new Map<string, number>();
    for (const r of this.records) {
      if (!r.relatedEntityId) continue;
      const prev = result.get(r.relatedEntityId) ?? 0;
      result.set(r.relatedEntityId, prev + parseFloat(r.amount));
    }
    return result;
  }
}

export const paymentTracker = new PaymentTracker();
