/**
 * agentWalletManager.ts — カストディアル HD ウォレット管理
 *
 * 各 AI エージェントに BIP-44 派生の EVM アドレスを割り当てる。
 * サーバーがプライベートキーを管理する（エージェントは AI であり人間ではない）。
 */

import { mnemonicToAccount } from 'viem/accounts';
import type { HDAccount } from 'viem/accounts';

export interface AgentWallet {
  agentId: string;
  evmAddress: string;
  account: HDAccount;
  derivationIndex: number;
}

export class AgentWalletManager {
  private wallets = new Map<string, AgentWallet>();
  private nextIndex = 0;
  private mnemonic: string;

  constructor(mnemonic: string) {
    this.mnemonic = mnemonic;
  }

  getOrCreate(agentId: string): AgentWallet {
    const existing = this.wallets.get(agentId);
    if (existing) return existing;

    const index = this.nextIndex++;
    const account = mnemonicToAccount(this.mnemonic, { addressIndex: index });

    const wallet: AgentWallet = {
      agentId,
      evmAddress: account.address,
      account,
      derivationIndex: index,
    };
    this.wallets.set(agentId, wallet);
    return wallet;
  }

  getAddress(agentId: string): string | null {
    return this.wallets.get(agentId)?.evmAddress ?? null;
  }

  getAll(): AgentWallet[] {
    return [...this.wallets.values()];
  }

  getSigner(agentId: string): HDAccount | null {
    return this.wallets.get(agentId)?.account ?? null;
  }
}
