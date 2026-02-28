/**
 * agentPaymentClient.ts — エージェント間 USDC 決済
 *
 * サーバーが管理するカストディアルウォレットを使い、
 * AI エージェント同士の取引・同盟・貢物を USDC で決済する。
 *
 * X402_ONCHAIN_ENABLED=true の場合、viem を使い Base 上の USDC ERC20 transfer を実行。
 * それ以外はオフチェーン記録 (paymentTracker) のみ。
 */

import type { AgentWalletManager } from './agentWalletManager.ts';
import type { X402Config } from './x402Config.ts';
import { paymentTracker } from './paymentTracker.ts';
import { BatchSettlement } from './batchSettlement.ts';
import type { X402PaymentPurpose } from '@murasato/shared';

export class AgentPaymentClient {
  private batchSettlement: BatchSettlement | null = null;

  constructor(
    private walletManager: AgentWalletManager,
    private config: X402Config,
  ) {
    // オンチェーンモード時はバッチ決済を開始
    if (config.onchainEnabled) {
      this.batchSettlement = new BatchSettlement(walletManager, config);
      this.batchSettlement.start();
    }
  }

  /** バッチ決済を停止する（サーバーシャットダウン時） */
  shutdown(): void {
    this.batchSettlement?.stop();
  }

  /** バッチ決済の統計を取得する */
  getBatchStats() {
    return this.batchSettlement?.getStats() ?? null;
  }

  /**
   * エージェント間決済を実行する。
   * 両エージェントのウォレットを自動作成し、決済をトラッキングに記録する。
   * オンチェーンモードが有効な場合は、Base 上の USDC transfer も実行する。
   */
  async pay(
    fromAgentId: string,
    toAgentId: string,
    amountUSD: string,
    purpose: X402PaymentPurpose,
    tick: number,
    relatedEntityId?: string,
  ): Promise<boolean> {
    try {
      const fromWallet = this.walletManager.getOrCreate(fromAgentId);
      const toWallet = this.walletManager.getOrCreate(toAgentId);

      // オンチェーン決済（バッチ経由）
      if (this.batchSettlement) {
        await this.batchSettlement.enqueue(fromAgentId, toWallet.evmAddress, amountUSD);
      }

      // 決済を記録
      paymentTracker.record({
        fromAddress: fromWallet.evmAddress,
        toAddress: toWallet.evmAddress,
        amount: amountUSD,
        network: this.config.network,
        purpose,
        relatedEntityId,
        tick,
      });

      return true;
    } catch (err) {
      console.error(`[x402] Agent payment failed: ${fromAgentId} -> ${toAgentId}:`, err);
      return false;
    }
  }

}
