/**
 * WalletConnect.tsx — Katana devnet 接続ボタン
 *
 * connectKatana() で RpcProvider + Account を作成。
 * 接続時はアドレス短縮表示 + 緑インジケーター。
 */

import { useWalletStore } from '../../store/walletStore.ts';

export function WalletConnect() {
  const { address, isConnected, isOnChain, disconnect, connectKatana } = useWalletStore();

  if (isConnected && address) {
    const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#2a2a3a',
        border: `1px solid ${isOnChain ? '#5add5a' : '#8b8bff'}`,
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
            background: '#5add5a',
            boxShadow: '0 0 6px #5add5a',
            display: 'inline-block',
          }} />
        )}
        <span style={{ color: isOnChain ? '#5add5a' : '#8b8bff' }}>{shortAddr}</span>
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
          切断
        </button>
      </div>
    );
  }

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
      Katana接続
    </button>
  );
}
