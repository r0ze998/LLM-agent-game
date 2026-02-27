/**
 * starknetTx.ts — プレイヤーウォレット直接オンチェーンコマンド (F7)
 *
 * ブラウザのStarknetウォレットから直接TXを送信する。
 * サーバー経由のバックエンドTXとは別ルート。
 */

import type { PlayerCommand } from '@murasato/shared';

interface StarknetWallet {
  account: {
    execute: (calls: any[]) => Promise<{ transaction_hash: string }>;
    address: string;
  };
}

function getWallet(): StarknetWallet | null {
  const starknet = (window as any).starknet;
  if (!starknet?.account) return null;
  return starknet;
}

/**
 * Execute a player command directly via wallet TX.
 * Returns the transaction hash, or null if wallet is not available.
 */
export async function executeCommandViaWallet(
  command: PlayerCommand,
  systemAddress: string,
): Promise<string | null> {
  const wallet = getWallet();
  if (!wallet) return null;

  try {
    const call = buildCall(command, systemAddress);
    if (!call) return null;

    const result = await wallet.account.execute([call]);
    console.log(`[StarknetTx] Command ${command.type} → tx: ${result.transaction_hash}`);
    return result.transaction_hash;
  } catch (err) {
    console.error(`[StarknetTx] Command ${command.type} failed:`, err);
    return null;
  }
}

function buildCall(command: PlayerCommand, systemAddress: string): any | null {
  switch (command.type) {
    case 'build':
      return {
        contractAddress: systemAddress,
        entrypoint: 'build',
        calldata: [
          (command as any).villageId ?? '0',
          (command as any).buildingDefId ?? '0',
          String((command as any).position?.x ?? 0),
          String((command as any).position?.y ?? 0),
        ],
      };

    case 'research':
      return {
        contractAddress: systemAddress,
        entrypoint: 'research',
        calldata: [
          (command as any).villageId ?? '0',
          (command as any).techDefId ?? '0',
        ],
      };

    case 'train':
      return {
        contractAddress: systemAddress,
        entrypoint: 'train',
        calldata: [
          (command as any).villageId ?? '0',
          (command as any).unitDefId ?? '0',
          String((command as any).count ?? 1),
        ],
      };

    case 'diplomacy':
      return {
        contractAddress: systemAddress,
        entrypoint: 'set_diplomacy',
        calldata: [
          (command as any).villageId ?? '0',
          (command as any).targetVillageId ?? '0',
          String((command as any).status ?? 0),
        ],
      };

    default:
      return null;
  }
}

/** Get the connected wallet address, or null */
export function getWalletAddress(): string | null {
  const wallet = getWallet();
  return wallet?.account.address ?? null;
}
