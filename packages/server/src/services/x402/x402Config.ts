/**
 * x402Config.ts — x402 決済レイヤー設定
 *
 * X402_ENABLED=true で有効化。
 * dojoConfig.ts と同パターンで環境変数から設定を集約する。
 */

export interface X402Config {
  enabled: boolean;
  payToAddress: string;
  network: string;
  facilitatorUrl: string;
  agentWalletMnemonic: string;
  /** true ならオンチェーン USDC transfer を実行。false ならオフチェーン記録のみ */
  onchainEnabled: boolean;
  /** Base RPC URL (オンチェーンモード時に使用) */
  rpcUrl: string;
  pricing: {
    intentionPerCommand: string;
    chronicleGeneration: string;
    biographyGeneration: string;
    blueprintDeploy: string;
  };
}

export function loadX402Config(): X402Config {
  const enabled = process.env.X402_ENABLED === 'true';

  if (!enabled) {
    return {
      enabled: false,
      payToAddress: '',
      network: '',
      facilitatorUrl: '',
      agentWalletMnemonic: '',
      onchainEnabled: false,
      rpcUrl: '',
      pricing: {
        intentionPerCommand: '$0.001',
        chronicleGeneration: '$0.005',
        biographyGeneration: '$0.003',
        blueprintDeploy: '$0.01',
      },
    };
  }

  return {
    enabled: true,
    payToAddress: process.env.X402_PAY_TO_ADDRESS ?? '',
    network: process.env.X402_NETWORK ?? 'eip155:84532',
    facilitatorUrl: process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator',
    agentWalletMnemonic: process.env.X402_AGENT_MNEMONIC ?? '',
    onchainEnabled: process.env.X402_ONCHAIN_ENABLED === 'true',
    rpcUrl: process.env.X402_RPC_URL ?? 'https://sepolia.base.org',
    pricing: {
      intentionPerCommand: process.env.X402_PRICE_INTENTION ?? '$0.001',
      chronicleGeneration: process.env.X402_PRICE_CHRONICLE ?? '$0.005',
      biographyGeneration: process.env.X402_PRICE_BIOGRAPHY ?? '$0.003',
      blueprintDeploy: process.env.X402_PRICE_BLUEPRINT ?? '$0.01',
    },
  };
}
