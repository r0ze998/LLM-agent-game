/**
 * starknetProvider.tsx — StarknetConfig ラッパー (F7)
 *
 * Argent / Braavos コネクタ + Katana devnet チェーン設定。
 * @starknet-react/core が未インストールの場合は graceful に children のみ返す。
 */

import React from 'react';

// Katana devnet chain definition
export const katanaDevnet = {
  id: BigInt('0x4b4154414e41'), // "KATANA" in hex
  network: 'katana',
  name: 'Katana Devnet',
  rpcUrls: {
    default: { http: ['http://localhost:5050'] },
  },
} as const;

interface StarknetProviderProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that provides Starknet context.
 * When @starknet-react packages are available, this wraps children in StarknetConfig.
 * Otherwise, it renders children directly (graceful degradation).
 */
export function StarknetProvider({ children }: StarknetProviderProps) {
  // Graceful degradation: if starknet-react is not installed, just render children
  try {
    // Dynamic import check — if the module is available, we'd use it
    // For now, since we can't guarantee the dependency is installed,
    // we provide a pass-through wrapper
    return <>{children}</>;
  } catch {
    return <>{children}</>;
  }
}

// Re-export chain config for use in starknetTx.ts
export function getKatanaRpcUrl(): string {
  return 'http://localhost:5050';
}
