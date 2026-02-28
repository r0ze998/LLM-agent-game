/**
 * x402Server.ts — Hono ミドルウェア設定 & ルート別課金定義
 */

import { paymentMiddleware, x402ResourceServer } from '@x402/hono';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { RoutesConfig } from '@x402/core/server';
import type { Network } from '@x402/core/types';
import type { Hono } from 'hono';
import type { X402Config } from './x402Config.ts';

export function createX402Server(config: X402Config) {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
  });

  const network = config.network as Network;
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(network, new ExactEvmScheme());

  return { facilitatorClient, resourceServer };
}

export function buildPaymentRoutes(config: X402Config): RoutesConfig {
  const payTo = config.payToAddress;
  const network = config.network as Network;

  return {
    'POST /api/v1/player/*/intention': {
      accepts: { scheme: 'exact', price: config.pricing.intentionPerCommand, network, payTo },
      description: '天の声 (Voice of Heaven) intention command',
      mimeType: 'application/json',
    },
    'GET /api/v1/game/*/chronicle': {
      accepts: { scheme: 'exact', price: config.pricing.chronicleGeneration, network, payTo },
      description: 'AI chronicle of game history',
      mimeType: 'application/json',
    },
    'GET /api/v1/game/*/agent/*/biography': {
      accepts: { scheme: 'exact', price: config.pricing.biographyGeneration, network, payTo },
      description: 'AI biography for an agent',
      mimeType: 'application/json',
    },
    'POST /api/v1/blueprint/*/deploy': {
      accepts: { scheme: 'exact', price: config.pricing.blueprintDeploy, network, payTo },
      description: 'Deploy a custom agent blueprint',
      mimeType: 'application/json',
    },
  };
}

export function applyX402Middleware(app: Hono, config: X402Config): void {
  const { resourceServer } = createX402Server(config);
  const routes = buildPaymentRoutes(config);

  app.use(paymentMiddleware(routes, resourceServer));
}
