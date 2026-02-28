/**
 * walletStore.ts — Zustand wallet state
 *
 * Starknet ウォレット接続状態を管理。
 * Katana devnet 直接接続 + ブラウザウォレット両対応。
 */

import { create } from 'zustand';
import { RpcProvider, Account } from 'starknet';
import { KATANA_RPC_URL, KATANA_DEV_ACCOUNTS } from '../services/dojoConfig.ts';

interface WalletStore {
  address: string | null;
  isConnected: boolean;
  chainId: string | null;
  provider: RpcProvider | null;
  account: Account | null;
  isOnChain: boolean;

  setWallet: (address: string, chainId: string) => void;
  disconnect: () => void;
  connectKatana: (accountIndex?: number) => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  address: null,
  isConnected: false,
  chainId: null,
  provider: null,
  account: null,
  isOnChain: false,

  setWallet: (address, chainId) => set({
    address,
    isConnected: true,
    chainId,
  }),

  disconnect: () => set({
    address: null,
    isConnected: false,
    chainId: null,
    provider: null,
    account: null,
    isOnChain: false,
  }),

  connectKatana: (accountIndex = 0) => {
    const devAccount = KATANA_DEV_ACCOUNTS[accountIndex] ?? KATANA_DEV_ACCOUNTS[0];
    const provider = new RpcProvider({ nodeUrl: KATANA_RPC_URL });
    const account = new Account(provider, devAccount.address, devAccount.privateKey);
    if (import.meta.env.DEV) console.log(`[Wallet] Connected to Katana: ${devAccount.address.slice(0, 10)}...`);
    set({
      address: devAccount.address,
      isConnected: true,
      chainId: 'KATANA',
      provider,
      account,
      isOnChain: true,
    });
  },
}));
