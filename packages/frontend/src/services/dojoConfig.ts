/**
 * dojoConfig.ts — Dojo connection configuration
 *
 * Reads from Vite env vars (VITE_DOJO_PROFILE, VITE_RPC_URL, VITE_WORLD_ADDRESS).
 * System addresses and model selectors are fetched from the server at runtime.
 *
 * Supports two profiles:
 *   - "dev"     → Katana devnet (localhost:5050), dev account auto-connect
 *   - "sepolia" → Starknet Sepolia testnet, browser wallet (ArgentX/Braavos)
 */

// ── Profile ──

export type DojoProfile = 'dev' | 'sepolia';

export const DOJO_PROFILE: DojoProfile =
  (import.meta.env.VITE_DOJO_PROFILE as DojoProfile) || 'dev';

export const RPC_URL: string =
  import.meta.env.VITE_RPC_URL || 'http://localhost:5050';

export const WORLD_ADDRESS: string =
  import.meta.env.VITE_WORLD_ADDRESS ||
  '0x7f33e825352c154085aa90a606f8366fbe3d58e5bc5a791cdd3ed74c8dd3fd7';

export const isSepolia = DOJO_PROFILE === 'sepolia';
export const isDev = DOJO_PROFILE === 'dev';

// ── Server-fetched config (system addresses + model selectors) ──

export interface DojoServerConfig {
  worldAddress: string;
  systemAddresses: Record<string, string>;
  modelSelectors: Record<string, string>;
}

let _serverConfig: DojoServerConfig | null = null;

/**
 * Fetch system addresses and model selectors from the server.
 * Falls back to hardcoded defaults for dev profile.
 */
export async function fetchDojoConfig(
  serverBaseUrl: string,
  gameId: string,
): Promise<DojoServerConfig> {
  if (_serverConfig) return _serverConfig;

  try {
    const resp = await fetch(`${serverBaseUrl}/api/v1/strategy/dojo-config/${gameId}`);
    if (resp.ok) {
      const json = await resp.json();
      _serverConfig = json.data as DojoServerConfig;
      console.log('[DojoConfig] Loaded config from server');
      return _serverConfig;
    }
  } catch (err) {
    console.warn('[DojoConfig] Failed to fetch from server, using fallbacks:', err);
  }

  // Fallback: hardcoded dev defaults (from manifest_dev.json)
  _serverConfig = {
    worldAddress: WORLD_ADDRESS,
    systemAddresses: DEV_SYSTEM_ADDRESSES,
    modelSelectors: DEV_MODEL_SELECTORS,
  };
  return _serverConfig;
}

/** Get the cached server config (null if not yet fetched) */
export function getDojoConfig(): DojoServerConfig | null {
  return _serverConfig;
}

// ── System address helpers (used by DojoTxService) ──

export type SystemName = keyof typeof DEV_SYSTEM_ADDRESSES;

export function getSystemAddress(system: SystemName): string {
  if (_serverConfig) {
    return _serverConfig.systemAddresses[system] ?? DEV_SYSTEM_ADDRESSES[system];
  }
  return DEV_SYSTEM_ADDRESSES[system];
}

export function getModelSelector(model: string): string | undefined {
  if (_serverConfig) {
    return _serverConfig.modelSelectors[model];
  }
  return DEV_MODEL_SELECTORS[model as keyof typeof DEV_MODEL_SELECTORS];
}

// ── Katana dev accounts (only available in dev profile) ──

export const KATANA_DEV_ACCOUNTS = isDev
  ? ([
      {
        address:
          '0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec',
        privateKey:
          '0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912',
      },
    ] as const)
  : ([] as const);

// ── Hardcoded dev defaults (fallback when server is unreachable) ──

const DEV_SYSTEM_ADDRESSES = {
  physics:
    '0xa55f353cc852385a12a1bf729a4af74ec0de45346424fc2be4b8abc8f8711c',
  village_tick:
    '0x581dc98dba986e4251f008c7743c0c3580bf87d453cab94836d0d4da4359bbe',
  commands:
    '0x2de775d06f620e2279f7d2dc3681054f8453fa78abad21f9d1c7b6b2f2a660a',
  combat:
    '0x7360cdf4bb91fe882f7dae58cfa6ba07918ed210ad621b011ef04a3f8263860',
  covenant_sys:
    '0x70c4c883133b04b540248a5f1583657446718b66ac33bdabaa4d9dba9401cc9',
  institution_sys:
    '0x574e9f838d229be21f0c4579cd8d517ea38e6cc952d0d667242fd5b1e9242d1',
  invention_sys:
    '0x2f121b0c008120a99c0a6b74bfae8bc4394f02dc02fbcca3e297e94ae007de3',
  setup:
    '0x6bcdd573ef6cc0d1c3dcda9bf54df77c60e1fcfcebe9b9ebdd19461a9a6b3c9',
  trade_sys:
    '0x6c8e399756c98dff0d1c18b4fc04ad11efad82919a5419a0ae7d0eb22172816',
  victory:
    '0x186f02b810da5bc186596379a8764741314534136f5d665f41fd2808282504a',
} as const;

const DEV_MODEL_SELECTORS = {
  Village:
    '0x74425c1bbc578b3efc3e70f01c511b66edc0484246d311af104c16c9c10b9f1',
  Building:
    '0x58ddea2c8930eaf70f527152245effdddc1def1d4f628a3bbb076bee047575c',
  BuildingCounter:
    '0x124958d6aff4e4f06b9281ab814dc4f2afe4c65de3e4926d4a55c2f68735713',
  GarrisonUnit:
    '0x21e5d4b93260c076d899a7f5212f1625a0eeda2ef5e78fb236c2c1d0fa04f95',
  ResearchedTech:
    '0x3ba9c0392a0228646f7ee08df1d74fb897655ca288aa973c1bba59ef3ab1704',
  GameConfig:
    '0x28e8dae0a1ea29fc03b1e601ab2e483024d53d1ccf29a167c35182dc8745008',
  BuildQueue:
    '0x1d24fa0217e6bf1fb847e5a2358d09a6f3bbf5ebf285c512332691c1862b1dc',
  BuildQueueCounter:
    '0x73334ea5071162c191691fcdfc4f24bb49ad12b64a8fc472ac5be985def0e29',
  ResearchQueue:
    '0x56767df8ee97a72582a12c2ac9342d8b5041040faa66cec58be1cd1c2d4f0fa',
  TrainQueue:
    '0x467e144080c79c8f6831c5ea2b91a64a9be1f0ea17d71988ab48fd6f28763cd',
  TrainQueueCounter:
    '0x27b151323b8ff6b85aaa2b2ab7cd3f1d04f587c4fad47ea5aefe466fa31582a',
} as const;
