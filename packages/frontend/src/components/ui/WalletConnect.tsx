/**
 * WalletConnect.tsx — ウォレット接続/切断ボタン (F7)
 *
 * 接続時はアドレス短縮表示。
 * @starknet-react/core が利用可能な場合はネイティブコネクタを使用。
 */

import { useWalletStore } from '../../store/walletStore.ts';

export function WalletConnect() {
  const { address, isConnected, disconnect, setWallet } = useWalletStore();

  const handleConnect = async () => {
    try {
      // Try to use get-starknet for wallet connection
      const starknet = (window as any).starknet;
      if (starknet) {
        await starknet.enable();
        const addr = starknet.selectedAddress;
        const chainId = starknet.chainId ?? 'unknown';
        if (addr) {
          setWallet(addr, chainId);
        }
      } else {
        console.warn('No Starknet wallet detected');
      }
    } catch (err) {
      console.error('Wallet connection failed:', err);
    }
  };

  if (isConnected && address) {
    const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#2a2a3a',
        border: '1px solid #8b8bff',
        borderRadius: 6,
        padding: '4px 10px',
        fontFamily: '"M PLUS 1p", monospace',
        fontSize: 11,
      }}>
        <span style={{ color: '#8b8bff' }}>{shortAddr}</span>
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
      onClick={handleConnect}
      style={{
        background: 'linear-gradient(135deg, #4a3aaa, #6a4aee)',
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
      ウォレット接続
    </button>
  );
}
