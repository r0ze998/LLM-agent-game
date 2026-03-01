/**
 * WalletConnect.tsx — Wallet connection button
 *
 * Dev profile:     "Connect Katana" → auto-connects with dev account
 * Sepolia profile: "Connect Wallet" → opens ArgentX/Braavos picker
 *
 * Connected state shows chain badge + shortened address + disconnect button.
 */

import { useWalletStore } from '../../store/walletStore.ts';
import { DOJO_PROFILE, isDev } from '../../services/dojoConfig.ts';

export function WalletConnect() {
  const { address, isConnected, isOnChain, chainId, disconnect, connectKatana, connectBrowser } =
    useWalletStore();

  if (isConnected && address) {
    const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const chainLabel = chainId === 'KATANA' ? 'Katana' : 'Sepolia';
    const chainColor = chainId === 'KATANA' ? '#5add5a' : '#6ea8fe';

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#2a2a3a',
        border: `1px solid ${chainColor}`,
        borderRadius: 6,
        padding: '4px 10px',
        fontFamily: '"M PLUS 1p", monospace',
        fontSize: 11,
      }}>
        {isOnChain && (
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: chainColor,
            boxShadow: `0 0 6px ${chainColor}`,
            display: 'inline-block',
          }} />
        )}
        <span style={{
          color: '#aaa',
          fontSize: 9,
          background: '#1a1a2a',
          borderRadius: 3,
          padding: '1px 4px',
        }}>
          {chainLabel}
        </span>
        <span style={{ color: chainColor }}>{shortAddr}</span>
        <button
          onClick={disconnect}
          style={{
            background: 'transparent',
            border: '1px solid #666',
            borderRadius: 4,
            padding: '2px 6px',
            color: '#aaa',
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: 'inherit',
          }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (isDev) {
    return (
      <button
        onClick={() => connectKatana()}
        style={{
          background: 'linear-gradient(135deg, #2a6a2a, #3a8a3a)',
          border: 'none',
          borderRadius: 6,
          padding: '6px 14px',
          color: '#fff',
          cursor: 'pointer',
          fontFamily: '"M PLUS 1p", monospace',
          fontSize: 12,
          fontWeight: 'bold',
        }}
      >
        Connect Katana
      </button>
    );
  }

  return (
    <button
      onClick={() => connectBrowser()}
      style={{
        background: 'linear-gradient(135deg, #2a4a8a, #3a6aba)',
        border: 'none',
        borderRadius: 6,
        padding: '6px 14px',
        color: '#fff',
        cursor: 'pointer',
        fontFamily: '"M PLUS 1p", monospace',
        fontSize: 12,
        fontWeight: 'bold',
      }}
    >
      Connect Wallet
    </button>
  );
}
