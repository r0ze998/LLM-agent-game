/**
 * walletStore.ts — Zustand wallet state (F7)
 *
 * Starknet ウォレット接続状態を管理。
 * MULTIPLAYER_ENABLED 時にのみ意味を持つ。
 */

import { create } from 'zustand';

interface WalletStore {
  address: string | null;
  isConnected: boolean;
  chainId: string | null;

  setWallet: (address: string, chainId: string) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  address: null,
  isConnected: false,
  chainId: null,

  setWallet: (address, chainId) => set({
    address,
    isConnected: true,
    chainId,
  }),

  disconnect: () => set({
    address: null,
    isConnected: false,
    chainId: null,
  }),
}));
