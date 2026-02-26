/**
 * dojoConfig.ts — Dojo 接続設定
 *
 * DOJO_ENABLED=true で有効化。
 * RPC URL、アカウント、マニフェストパスを集約する。
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseManifest, type ManifestContracts } from "./manifestParser.ts";

export interface DojoConfig {
  enabled: boolean;
  rpcUrl: string;
  accountAddress: string;
  privateKey: string;
  worldAddress: string;
  contracts: ManifestContracts;
}

// Katana devnet default account (sozo dev seed 0)
const KATANA_DEFAULT_ACCOUNT =
  "0xb3ff441a68610b30fd5e2abbf3a1548eb6ba6f3559f2862bf2dc757e5828ca";
const KATANA_DEFAULT_PRIVATE_KEY =
  "0x2bbf4f9fd0bbb2e60b0316c1fe0b76cf7a4d0198571b55369d141b49d25e1e";

/**
 * 環境変数からDojoConfigを構築。
 * DOJO_ENABLED が true でない場合は enabled: false を返す。
 */
export function loadDojoConfig(): DojoConfig {
  const enabled = process.env.DOJO_ENABLED === "true";

  if (!enabled) {
    return {
      enabled: false,
      rpcUrl: "",
      accountAddress: "",
      privateKey: "",
      worldAddress: "",
      contracts: {} as ManifestContracts,
    };
  }

  const rpcUrl = process.env.DOJO_RPC_URL ?? "http://localhost:5050";
  const accountAddress =
    process.env.DOJO_ACCOUNT_ADDRESS ?? KATANA_DEFAULT_ACCOUNT;
  const privateKey =
    process.env.DOJO_PRIVATE_KEY ?? KATANA_DEFAULT_PRIVATE_KEY;

  // マニフェストパス (デフォルト: packages/contracts/manifest_dev.json)
  // import.meta.url は日本語パスを URL エンコードするため fileURLToPath で正規化
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = resolve(
    process.env.DOJO_MANIFEST_PATH ??
      resolve(thisDir, "../../../../contracts/manifest_dev.json"),
  );

  const { worldAddress, contracts } = parseManifest(manifestPath);

  console.log(`[DojoConfig] Loaded manifest from ${manifestPath}`);
  console.log(`[DojoConfig] World: ${worldAddress}`);
  console.log(
    `[DojoConfig] Systems: ${Object.keys(contracts).join(", ")}`,
  );

  return {
    enabled: true,
    rpcUrl,
    accountAddress,
    privateKey,
    worldAddress,
    contracts,
  };
}
