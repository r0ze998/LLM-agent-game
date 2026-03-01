/**
 * starknetProvider.tsx — Dojo context provider
 *
 * Shares txService, stateReader, tickAdvancer, stateSync via React Context.
 * Services are only active when walletStore.isOnChain is true.
 *
 * On initialization, fetches system addresses + model selectors from the server
 * so that DojoTxService / DojoStateReader work with both Katana and Sepolia.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useWalletStore } from '../store/walletStore.ts';
import { DojoTxService } from './dojoTxService.ts';
import { DojoStateReader } from './dojoStateReader.ts';
import { DojoStateSync } from './dojoStateSync.ts';
import { DojoTickAdvancer } from './dojoTickAdvancer.ts';
import { VillageIdMapper } from './dojoSync.ts';
import { initTxService } from './starknetTx.ts';
import { WORLD_ADDRESS, fetchDojoConfig } from './dojoConfig.ts';

export interface DojoContextValue {
  txService: DojoTxService | null;
  stateReader: DojoStateReader | null;
  stateSync: DojoStateSync | null;
  tickAdvancer: DojoTickAdvancer | null;
  villageMapper: VillageIdMapper;
  isReady: boolean;
}

const DojoContext = createContext<DojoContextValue>({
  txService: null,
  stateReader: null,
  stateSync: null,
  tickAdvancer: null,
  villageMapper: new VillageIdMapper(),
  isReady: false,
});

export function useDojoContext(): DojoContextValue {
  return useContext(DojoContext);
}

interface StarknetProviderProps {
  gameId?: string;
  children: React.ReactNode;
}

export function StarknetProvider({ gameId, children }: StarknetProviderProps) {
  const account = useWalletStore((s) => s.account);
  const provider = useWalletStore((s) => s.provider);
  const isOnChain = useWalletStore((s) => s.isOnChain);

  const mapperRef = useRef(new VillageIdMapper());
  const [value, setValue] = useState<DojoContextValue>({
    txService: null,
    stateReader: null,
    stateSync: null,
    tickAdvancer: null,
    villageMapper: mapperRef.current,
    isReady: false,
  });

  useEffect(() => {
    if (!isOnChain || !account || !provider) {
      setValue({
        txService: null,
        stateReader: null,
        stateSync: null,
        tickAdvancer: null,
        villageMapper: mapperRef.current,
        isReady: false,
      });
      return;
    }

    let cancelled = false;

    async function init() {
      // Fetch system addresses + model selectors from server (falls back to hardcoded dev defaults)
      const serverBaseUrl = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
      if (gameId) {
        await fetchDojoConfig(serverBaseUrl, gameId);
      }

      if (cancelled) return;

      const txService = new DojoTxService(account!, provider!);
      const stateReader = new DojoStateReader(provider!, WORLD_ADDRESS);
      const stateSync = new DojoStateSync(stateReader, mapperRef.current);
      const tickAdvancer = new DojoTickAdvancer(txService, mapperRef.current);

      // Initialize the global TX service (used by starknetTx.ts)
      initTxService(account!, provider!, mapperRef.current);

      setValue({
        txService,
        stateReader,
        stateSync,
        tickAdvancer,
        villageMapper: mapperRef.current,
        isReady: true,
      });
    }

    init().catch((err) => {
      console.error('[StarknetProvider] Initialization failed:', err);
    });

    return () => {
      cancelled = true;
      // Clean up previous services
      const prev = value;
      if (prev.tickAdvancer) prev.tickAdvancer.stop();
      if (prev.stateSync) prev.stateSync.stopPolling();
    };
  }, [isOnChain, account, provider, gameId]);

  return (
    <DojoContext.Provider value={value}>
      {children}
    </DojoContext.Provider>
  );
}
