/**
 * dojoConfig.ts — Katana devnet 接続定数
 *
 * manifest_dev.json から抽出した静的アドレス。
 * ブラウザからFSアクセス不可のため定数として埋め込む。
 */

export const KATANA_RPC_URL = "http://localhost:5050";

export const WORLD_ADDRESS =
  "0x7f33e825352c154085aa90a606f8366fbe3d58e5bc5a791cdd3ed74c8dd3fd7";

/** 10 system contract addresses (from manifest_dev.json) */
export const SYSTEM_ADDRESSES = {
  physics:
    "0xa55f353cc852385a12a1bf729a4af74ec0de45346424fc2be4b8abc8f8711c",
  village_tick:
    "0x581dc98dba986e4251f008c7743c0c3580bf87d453cab94836d0d4da4359bbe",
  commands:
    "0x2de775d06f620e2279f7d2dc3681054f8453fa78abad21f9d1c7b6b2f2a660a",
  combat:
    "0x7360cdf4bb91fe882f7dae58cfa6ba07918ed210ad621b011ef04a3f8263860",
  covenant_sys:
    "0x70c4c883133b04b540248a5f1583657446718b66ac33bdabaa4d9dba9401cc9",
  institution_sys:
    "0x574e9f838d229be21f0c4579cd8d517ea38e6cc952d0d667242fd5b1e9242d1",
  invention_sys:
    "0x2f121b0c008120a99c0a6b74bfae8bc4394f02dc02fbcca3e297e94ae007de3",
  setup:
    "0x6bcdd573ef6cc0d1c3dcda9bf54df77c60e1fcfcebe9b9ebdd19461a9a6b3c9",
  trade_sys:
    "0x6c8e399756c98dff0d1c18b4fc04ad11efad82919a5419a0ae7d0eb22172816",
  victory:
    "0x186f02b810da5bc186596379a8764741314534136f5d665f41fd2808282504a",
} as const;

export type SystemName = keyof typeof SYSTEM_ADDRESSES;

/** Katana dev accounts (seed 0) */
export const KATANA_DEV_ACCOUNTS = [
  {
    address:
      "0xb3ff441a68610b30fd5e2abbf3a1548eb6ba6f3559f2862bf2dc757e5828ca",
    privateKey:
      "0x2bbf4f9fd0bbb2e60b0316c1fe0b76cf7a4d0198571b55369d141b49d25e1e",
  },
] as const;
