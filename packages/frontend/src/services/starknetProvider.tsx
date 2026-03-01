/**
 * starknetProvider.tsx — Dojo context provider
 *
 * Shares txService, stateReader, tickAdvancer, stateSync via React Context.
 * Services are only active when walletStore.isOnChain is true.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useWalletStore } from '../store/walletStore.ts';
import { DojoTxService } from './dojoTxService.ts';
import { DojoStateReader } from './dojoStateReader.ts';
import { DojoStateSync } from './dojoStateSync.ts';
import { DojoTickAdvancer } from './dojoTickAdvancer.ts';
import { VillageIdMapper } from './dojoSync.ts';
import { initTxService } from './starknetTx.ts';
import { WORLD_ADDRESS } from './dojoConfig.ts';

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
  children: React.ReactNode;
}

export function StarknetProvider({ children }: StarknetProviderProps) {
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

    const txService = new DojoTxService(account, provider);
    const stateReader = new DojoStateReader(provider, WORLD_ADDRESS);
    const stateSync = new DojoStateSync(stateReader, mapperRef.current);
    const tickAdvancer = new DojoTickAdvancer(txService, mapperRef.current);

    // Initialize the global TX service (used by starknetTx.ts)
    initTxService(account, provider, mapperRef.current);

    setValue({
      txService,
      stateReader,
      stateSync,
      tickAdvancer,
      villageMapper: mapperRef.current,
      isReady: true,
    });

    return () => {
      tickAdvancer.stop();
      stateSync.stopPolling();
    };
  }, [isOnChain, account, provider]);

  return (
    <DojoContext.Provider value={value}>
      {children}
    </DojoContext.Provider>
  );
}
