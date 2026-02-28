/**
 * payment.ts — x402 決済履歴 & 統計 API
 */

import { Hono } from 'hono';
import type { ApiResponse } from '@murasato/shared';
import { paymentTracker } from '../services/x402/paymentTracker.ts';

export const paymentRouter = new Hono();

// 最近の決済一覧
paymentRouter.get('/recent', (c) => {
  const limit = Number(c.req.query('limit') ?? '50');
  const records = paymentTracker.getRecent(limit);
  return c.json<ApiResponse<typeof records>>({ ok: true, data: records });
});

// 決済統計
paymentRouter.get('/stats', (c) => {
  return c.json<ApiResponse<{ totalRevenue: number; totalPayments: number }>>({
    ok: true,
    data: {
      totalRevenue: paymentTracker.getTotalRevenue(),
      totalPayments: paymentTracker.getCount(),
    },
  });
});

// エージェント別決済履歴
paymentRouter.get('/agent/:agentId', (c) => {
  const records = paymentTracker.getByAgent(c.req.param('agentId'));
  return c.json<ApiResponse<typeof records>>({ ok: true, data: records });
});
