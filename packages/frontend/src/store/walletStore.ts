/**
 * walletStore.ts — Zustand wallet state
 *
 * Manages Starknet wallet connection state.
 * Supports both Katana devnet direct connection and browser wallets (ArgentX/Braavos).
 */

import { create } from 'zustand';
import { RpcProvider, Account } from 'starknet';
import { RPC_URL, KATANA_DEV_ACCOUNTS } from '../services/dojoConfig.ts';

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
  connectBrowser: () => Promise<void>;
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
    if (!devAccount) {
      console.warn('[Wallet] No Katana dev accounts available (profile is not dev)');
      return;
    }
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
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

  connectBrowser: async () => {
    try {
      const gsCore = await import('get-starknet-core');
      const sn = gsCore.getStarknet();
      const available = await sn.getAvailableWallets();
      if (available.length === 0) {
        console.warn('[Wallet] No Starknet wallets found. Install ArgentX or Braavos.');
        return;
      }
      // Pick the first available wallet (ArgentX or Braavos)
      const wallet = await sn.enable(available[0]);
      // Use the wallet's own provider wrapped in RpcProvider for DojoStateReader compatibility
      const provider = new RpcProvider({ nodeUrl: RPC_URL });
      set({
        address: wallet.selectedAddress,
        account: wallet.account as unknown as Account,
        provider,
        chainId: wallet.chainId ?? 'SN_SEPOLIA',
        isConnected: true,
        isOnChain: true,
      });
      console.log(`[Wallet] Connected browser wallet: ${wallet.selectedAddress.slice(0, 10)}...`);
    } catch (err) {
      console.error('[Wallet] Browser wallet connection failed:', err);
    }
  },
}));
