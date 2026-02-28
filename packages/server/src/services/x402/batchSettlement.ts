/**
 * batchSettlement.ts — バッチ決済システム
 *
 * 小額のエージェント間決済を一定期間蓄積し、
 * まとめてオンチェーン送信することでガスコストを最適化する。
 *
 * フロー:
 * 1. agentPaymentClient が pay() するたびに pending に追加
 * 2. 一定間隔 (BATCH_INTERVAL_MS) または閾値到達で flush
 * 3. 送信先ごとに net amount を集約 → 1つの USDC transfer/アドレス
 */

import { createWalletClient, http, parseUnits } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import type { AgentWalletManager } from './agentWalletManager.ts';
import type { X402Config } from './x402Config.ts';

/** バッチ設定 */
const BATCH_INTERVAL_MS = 60_000;  // 60秒ごとにフラッシュ
const BATCH_MAX_PENDING = 50;      // 50件溜まったらフラッシュ
const MIN_SETTLEMENT_USD = 0.001;  // 最小決済額（これ以下は次回に繰り越し）

const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  'eip155:8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'eip155:84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

interface PendingPayment {
  fromAgentId: string;
  toAddress: string;
  amountUSD: number;
  timestamp: number;
}

export interface BatchSettlementStats {
  pendingCount: number;
  pendingTotalUSD: number;
  settledBatchCount: number;
  settledTotalUSD: number;
  lastFlushTimestamp: number | null;
}

export class BatchSettlement {
  private pending: PendingPayment[] = [];
  private settledBatchCount = 0;
  private settledTotalUSD = 0;
  private lastFlushTimestamp: number | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private walletManager: AgentWalletManager,
    private config: X402Config,
  ) {}

  /** バッチタイマーを開始する */
  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      if (this.pending.length > 0) {
        this.flush().catch((err) =>
          console.error('[x402 Batch] Scheduled flush failed:', err),
        );
      }
    }, BATCH_INTERVAL_MS);
    console.log(`[x402 Batch] Started (interval: ${BATCH_INTERVAL_MS}ms, threshold: ${BATCH_MAX_PENDING})`);
  }

  /** バッチタイマーを停止する */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * 決済をバッチキューに追加する。
   * 閾値に到達した場合は自動的にフラッシュ。
   */
  async enqueue(fromAgentId: string, toAddress: string, amountUSD: string): Promise<void> {
    this.pending.push({
      fromAgentId,
      toAddress,
      amountUSD: parseFloat(amountUSD),
      timestamp: Date.now(),
    });

    if (this.pending.length >= BATCH_MAX_PENDING) {
      await this.flush();
    }
  }

  /**
   * 保留中の全決済を集約してオンチェーン送信する。
   * 送信先ごとにnet amountを計算し、最小額以上の場合のみ送信。
   */
  async flush(): Promise<number> {
    if (this.pending.length === 0) return 0;

    const toFlush = [...this.pending];
    this.pending = [];

    // 送信先ごとにaggregation
    const aggregated = new Map<string, { totalUSD: number; fromAgentIds: Set<string> }>();
    for (const p of toFlush) {
      const existing = aggregated.get(p.toAddress);
      if (existing) {
        existing.totalUSD += p.amountUSD;
        existing.fromAgentIds.add(p.fromAgentId);
      } else {
        aggregated.set(p.toAddress, {
          totalUSD: p.amountUSD,
          fromAgentIds: new Set([p.fromAgentId]),
        });
      }
    }

    let settledCount = 0;

    if (!this.config.onchainEnabled) {
      // オフチェーンモード: ログのみ
      for (const [toAddr, data] of aggregated) {
        if (data.totalUSD < MIN_SETTLEMENT_USD) {
          // 繰り越し
          this.pending.push({
            fromAgentId: [...data.fromAgentIds][0],
            toAddress: toAddr,
            amountUSD: data.totalUSD,
            timestamp: Date.now(),
          });
          continue;
        }
        console.log(`[x402 Batch] Settled (offchain): $${data.totalUSD.toFixed(6)} -> ${toAddr.slice(0, 10)}...`);
        settledCount++;
        this.settledTotalUSD += data.totalUSD;
      }
    } else {
      // オンチェーンモード: 実際の USDC transfer
      const usdcAddress = USDC_ADDRESSES[this.config.network];
      if (!usdcAddress) {
        console.error(`[x402 Batch] No USDC address for network ${this.config.network}`);
        // 全て繰り越し
        this.pending.push(...toFlush);
        return 0;
      }

      const chain = this.config.network === 'eip155:8453' ? base : baseSepolia;

      for (const [toAddr, data] of aggregated) {
        if (data.totalUSD < MIN_SETTLEMENT_USD) {
          this.pending.push({
            fromAgentId: [...data.fromAgentIds][0],
            toAddress: toAddr,
            amountUSD: data.totalUSD,
            timestamp: Date.now(),
          });
          continue;
        }

        // 最初の送信元エージェントのsignerを使用（カストディアルなので問題ない）
        const firstAgentId = [...data.fromAgentIds][0];
        const signer = this.walletManager.getSigner(firstAgentId);
        if (!signer) {
          console.error(`[x402 Batch] No signer for agent ${firstAgentId}`);
          continue;
        }

        try {
          const walletClient = createWalletClient({
            account: signer,
            chain,
            transport: http(this.config.rpcUrl),
          });

          const amount = parseUnits(data.totalUSD.toFixed(6), 6);

          const txHash = await walletClient.writeContract({
            address: usdcAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: 'transfer',
            args: [toAddr as `0x${string}`, amount],
          });

          console.log(`[x402 Batch] Settled: $${data.totalUSD.toFixed(6)} -> ${toAddr.slice(0, 10)}... (tx: ${txHash})`);
          settledCount++;
          this.settledTotalUSD += data.totalUSD;
        } catch (err) {
          console.error(`[x402 Batch] Transfer failed for ${toAddr}:`, err);
          // 失敗分は繰り越し
          this.pending.push({
            fromAgentId: firstAgentId,
            toAddress: toAddr,
            amountUSD: data.totalUSD,
            timestamp: Date.now(),
          });
        }
      }
    }

    this.settledBatchCount++;
    this.lastFlushTimestamp = Date.now();

    if (settledCount > 0) {
      console.log(`[x402 Batch] Flush complete: ${settledCount} settlements, ${this.pending.length} carried over`);
    }

    return settledCount;
  }

  getStats(): BatchSettlementStats {
    return {
      pendingCount: this.pending.length,
      pendingTotalUSD: this.pending.reduce((sum, p) => sum + p.amountUSD, 0),
      settledBatchCount: this.settledBatchCount,
      settledTotalUSD: this.settledTotalUSD,
      lastFlushTimestamp: this.lastFlushTimestamp,
    };
  }
}
