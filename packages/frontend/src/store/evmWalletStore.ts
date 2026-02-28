/**
 * evmWalletStore.ts — EVM ウォレット状態管理 (Base / x402)
 *
 * Starknet 用の walletStore.ts とは別に、x402 決済用の EVM ウォレットを管理する。
 *
 * x402 はプログラマティック署名が必要なため、ブラウザウォレット接続時は
 * アドレス表示のみ（signer不要の閲覧モード）。
 * 自動決済にはprivateKeyモードが必要。
 */

import { create } from 'zustand';
import { privateKeyToAccount } from 'viem/accounts';
import type { PrivateKeyAccount } from 'viem/accounts';

interface EvmWalletStore {
  evmAddress: string | null;
  isConnected: boolean;
  /** x402自動決済用signer。ブラウザウォレットではnull（閲覧モード）。 */
  signer: PrivateKeyAccount | null;
  /** x402自動決済が可能か（signer保持時のみtrue） */
  canAutoSign: boolean;

  connectWithPrivateKey: (privateKey: string) => void;
  connectWithBrowserWallet: () => Promise<void>;
  disconnect: () => void;
}

export const useEvmWalletStore = create<EvmWalletStore>((set) => ({
  evmAddress: null,
  isConnected: false,
  signer: null,
  canAutoSign: false,

  connectWithPrivateKey: (privateKey: string) => {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    if (import.meta.env.DEV) console.log(`[EVM Wallet] Connected (auto-sign): ${account.address.slice(0, 10)}...`);
    set({ evmAddress: account.address, isConnected: true, signer: account, canAutoSign: true });
  },

  connectWithBrowserWallet: async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const accounts: string[] = await (window as any).ethereum.request({
          method: 'eth_requestAccounts',
        });
        if (accounts.length > 0) {
          if (import.meta.env.DEV) console.log(`[EVM Wallet] Browser wallet connected (view-only): ${accounts[0].slice(0, 10)}...`);
          set({ evmAddress: accounts[0], isConnected: true, signer: null, canAutoSign: false });
        }
      } catch (err) {
        console.error('[EVM Wallet] Browser wallet connection failed:', err);
      }
    } else {
      console.warn('[EVM Wallet] No browser wallet detected (MetaMask, Coinbase Wallet, etc.)');
    }
  },

  disconnect: () => {
    if (import.meta.env.DEV) console.log('[EVM Wallet] Disconnected');
    set({ evmAddress: null, isConnected: false, signer: null, canAutoSign: false });
  },
}));
