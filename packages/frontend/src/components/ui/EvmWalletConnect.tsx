/**
 * EvmWalletConnect.tsx — Base (EVM) 接続ボタン
 *
 * x402 決済用の EVM ウォレット接続 UI。
 * WalletConnect.tsx (Starknet) と同じスタイルパターン。
 */

import { useEvmWalletStore } from '../../store/evmWalletStore.ts';
import { initializePaymentFetch, resetPaymentFetch } from '../../services/api.ts';

export function EvmWalletConnect() {
  const { evmAddress, isConnected, canAutoSign, disconnect, connectWithBrowserWallet } = useEvmWalletStore();

  const handleConnect = async () => {
    await connectWithBrowserWallet();
    const store = useEvmWalletStore.getState();
    if (store.signer) {
      initializePaymentFetch(store.signer);
    }
  };

  const handleDisconnect = () => {
    resetPaymentFetch();
    disconnect();
  };

  if (isConnected && evmAddress) {
    const shortAddr = `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}`;
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#2a2a3a',
        border: '1px solid #4fc3f7',
        borderRadius: 6,
        padding: '4px 10px',
        fontFamily: '"M PLUS 1p", monospace',
        fontSize: 11,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#4fc3f7',
          boxShadow: '0 0 6px #4fc3f7',
          display: 'inline-block',
        }} />
        <span style={{ color: '#4fc3f7' }}>{shortAddr}</span>
        <span style={{ color: '#888', fontSize: 10 }}>Base{canAutoSign ? '' : ' (閲覧)'}</span>
        <button
          onClick={handleDisconnect}
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
          切断
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      style={{
        background: 'linear-gradient(135deg, #1565c0, #42a5f5)',
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
      Base接続 (x402)
    </button>
  );
}
