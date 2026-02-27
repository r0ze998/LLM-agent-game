/**
 * manifestParser.ts — Dojo manifest_dev.json パーサー
 *
 * sozo migrate で生成されるマニフェストを読み取り、
 * 9システムのコントラクトアドレスを抽出する。
 */

import { readFileSync } from "fs";

export interface ManifestContracts {
  physics: string;
  village_tick: string;
  combat: string;
  commands: string;
  covenant_sys: string;
  institution_sys: string;
  invention_sys: string;
  setup: string;
  victory: string;
  trade_sys: string;
}

interface ManifestContract {
  address: string;
  tag: string;
  [key: string]: unknown;
}

interface ManifestJson {
  world: {
    address: string;
    seed: string;
    [key: string]: unknown;
  };
  contracts: ManifestContract[];
  [key: string]: unknown;
}

/** マニフェストファイルからシステムアドレスを抽出 */
export function parseManifest(manifestPath: string): {
  worldAddress: string;
  contracts: ManifestContracts;
} {
  const raw = readFileSync(manifestPath, "utf-8");
  const manifest: ManifestJson = JSON.parse(raw);

  const worldAddress = manifest.world.address;

  // tag → system name マッピング (tag format: "aw-{system_name}")
  const tagToSystem: Record<string, keyof ManifestContracts> = {
    "aw-physics": "physics",
    "aw-village_tick": "village_tick",
    "aw-combat": "combat",
    "aw-commands": "commands",
    "aw-covenant_sys": "covenant_sys",
    "aw-institution_sys": "institution_sys",
    "aw-invention_sys": "invention_sys",
    "aw-setup": "setup",
    "aw-victory": "victory",
    "aw-trade_sys": "trade_sys",
  };

  const contracts: Partial<ManifestContracts> = {};
  for (const entry of manifest.contracts) {
    const system = tagToSystem[entry.tag];
    if (system) {
      contracts[system] = entry.address;
    }
  }

  // 全9システムが揃っていることを検証
  const required: (keyof ManifestContracts)[] = [
    "physics", "village_tick", "combat", "commands",
    "covenant_sys", "institution_sys", "invention_sys",
    "setup", "victory", "trade_sys",
  ];
  const missing = required.filter((k) => !contracts[k]);
  if (missing.length > 0) {
    throw new Error(
      `[ManifestParser] Missing system addresses: ${missing.join(", ")}`,
    );
  }

  return {
    worldAddress,
    contracts: contracts as ManifestContracts,
  };
}
