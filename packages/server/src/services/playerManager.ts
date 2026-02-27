/**
 * playerManager.ts — マルチプレイヤー管理 (F7)
 *
 * Starknetアドレスと村UUIDのマッピングを管理。
 * MULTIPLAYER_ENABLED=true で有効化。
 */

const LOG_PREFIX = "[PlayerManager]";

export interface RegisteredPlayer {
  starknetAddress: string;
  villageUuid: string;
  registeredAt: number; // timestamp ms
}

export class PlayerManager {
  private addressToVillage = new Map<string, string>();  // address → villageUuid
  private villageToAddress = new Map<string, string>();   // villageUuid → address

  /** Register a player's wallet address to a village */
  register(starknetAddress: string, villageUuid: string): void {
    const normalized = starknetAddress.toLowerCase();
    this.addressToVillage.set(normalized, villageUuid);
    this.villageToAddress.set(villageUuid, normalized);
    console.log(`${LOG_PREFIX} Registered ${normalized.slice(0, 10)}... → ${villageUuid}`);
  }

  /** Unregister a player */
  unregister(starknetAddress: string): void {
    const normalized = starknetAddress.toLowerCase();
    const villageUuid = this.addressToVillage.get(normalized);
    if (villageUuid) {
      this.villageToAddress.delete(villageUuid);
    }
    this.addressToVillage.delete(normalized);
  }

  /** Get village UUID from wallet address */
  getVillageByAddress(starknetAddress: string): string | undefined {
    return this.addressToVillage.get(starknetAddress.toLowerCase());
  }

  /** Get wallet address from village UUID */
  getAddressByVillage(villageUuid: string): string | undefined {
    return this.villageToAddress.get(villageUuid);
  }

  /** Check if a signer owns a specific village */
  isVillageOwner(starknetAddress: string, villageUuid: string): boolean {
    const normalized = starknetAddress.toLowerCase();
    return this.addressToVillage.get(normalized) === villageUuid;
  }

  /** Get all registered players */
  getAll(): RegisteredPlayer[] {
    const result: RegisteredPlayer[] = [];
    for (const [addr, village] of this.addressToVillage) {
      result.push({
        starknetAddress: addr,
        villageUuid: village,
        registeredAt: 0,
      });
    }
    return result;
  }

  get playerCount(): number {
    return this.addressToVillage.size;
  }
}

export const playerManager = new PlayerManager();
