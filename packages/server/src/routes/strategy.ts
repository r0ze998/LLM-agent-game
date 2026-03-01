// === Strategy Routes — 4X data definition listing + command execution API ===

import { Hono } from 'hono';
import { BUILDING_DEFS, BUILDING_LIST, TECH_DEFS, TECH_LIST, UNIT_DEFS, UNIT_LIST, VICTORY_DEFS, TERRAIN_RULES } from '@murasato/shared';
import { tickService } from '../services/tickService.ts';
import { processCommand } from '../engine/commandProcessor.ts';
import { buildWorld4XRef } from '../world/simulation.ts';
import { computeScoreRanking } from '../engine/victoryChecker.ts';
import { loadDojoConfig } from '../services/dojo/dojoConfig.ts';
import type { PlayerCommand } from '@murasato/shared';

export const strategyRouter = new Hono();

// --- GET data definitions ---

strategyRouter.get('/buildings', (c) => c.json({ ok: true, data: BUILDING_LIST }));
strategyRouter.get('/buildings/:id', (c) => {
  const def = BUILDING_DEFS[c.req.param('id')];
  return def ? c.json({ ok: true, data: def }) : c.json({ ok: false, error: 'Not found' }, 404);
});

strategyRouter.get('/techs', (c) => c.json({ ok: true, data: TECH_LIST }));
strategyRouter.get('/techs/:id', (c) => {
  const def = TECH_DEFS[c.req.param('id')];
  return def ? c.json({ ok: true, data: def }) : c.json({ ok: false, error: 'Not found' }, 404);
});

strategyRouter.get('/units', (c) => c.json({ ok: true, data: UNIT_LIST }));
strategyRouter.get('/units/:id', (c) => {
  const def = UNIT_DEFS[c.req.param('id')];
  return def ? c.json({ ok: true, data: def }) : c.json({ ok: false, error: 'Not found' }, 404);
});

strategyRouter.get('/victory', (c) => c.json({ ok: true, data: VICTORY_DEFS }));
strategyRouter.get('/terrain', (c) => c.json({ ok: true, data: TERRAIN_RULES }));

// --- GET village 4X states ---

strategyRouter.get('/villages/:gameId', (c) => {
  const world = tickService.getWorld(c.req.param('gameId'));
  if (!world) return c.json({ ok: false, error: 'Game not found' }, 404);

  const villages = [...world.villageStates4X.values()].map(vs => ({
    ...vs,
    researchedTechs: [...vs.researchedTechs],
  }));
  return c.json({ ok: true, data: villages });
});

strategyRouter.get('/villages/:gameId/:villageId', (c) => {
  const world = tickService.getWorld(c.req.param('gameId'));
  if (!world) return c.json({ ok: false, error: 'Game not found' }, 404);

  const vs = world.villageStates4X.get(c.req.param('villageId'));
  if (!vs) return c.json({ ok: false, error: 'Village not found' }, 404);

  return c.json({ ok: true, data: { ...vs, researchedTechs: [...vs.researchedTechs] } });
});

// --- GET score ranking ---

strategyRouter.get('/ranking/:gameId', (c) => {
  const world = tickService.getWorld(c.req.param('gameId'));
  if (!world) return c.json({ ok: false, error: 'Game not found' }, 404);

  const ranking = computeScoreRanking(world.villageStates4X);
  return c.json({ ok: true, data: ranking });
});

// --- POST command ---

strategyRouter.post('/command', async (c) => {
  const body = await c.req.json<{
    gameId: string;
    playerId: string;
    command: PlayerCommand;
  }>();

  const world = tickService.getWorld(body.gameId);
  if (!world) return c.json({ ok: false, error: 'Game not found' }, 404);

  const worldRef = buildWorld4XRef(world);
  const result = processCommand(body.command, body.playerId, worldRef);

  return c.json({ ok: result.success, data: result });
});

// --- GET Dojo config (for frontend browser wallet) ---

strategyRouter.get('/dojo-config/:gameId', (c) => {
  const dojoConfig = loadDojoConfig();
  if (!dojoConfig.enabled) {
    return c.json({ ok: false, error: 'Dojo bridge is disabled' }, 503);
  }

  return c.json({
    ok: true,
    data: {
      worldAddress: dojoConfig.worldAddress,
      systemAddresses: dojoConfig.contracts,
      modelSelectors: dojoConfig.modelSelectors,
    },
  });
});
