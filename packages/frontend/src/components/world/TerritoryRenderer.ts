// F14: Territory Overlay — territory visualization
import type { VillageState4XSerialized } from '@murasato/shared';
import { TILE_SIZE } from '@murasato/shared';

// 10-color deterministic palette
const VILLAGE_PALETTE = [
  '#4a90d9', '#d94a4a', '#4ad97a', '#d9c04a', '#9b59b6',
  '#e67e22', '#1abc9c', '#e84393', '#636e72', '#00cec9',
];

export function getVillageColor(villageId: string, allIds: string[]): string {
  const idx = allIds.indexOf(villageId);
  return VILLAGE_PALETTE[((idx >= 0 ? idx : 0) % VILLAGE_PALETTE.length)];
}

export type TerritoryLookup = Map<string, string>; // "x,y" → villageId

export function buildTerritoryLookup(
  village4xStates: Map<string, VillageState4XSerialized>,
): TerritoryLookup {
  const lookup: TerritoryLookup = new Map();
  for (const vs of village4xStates.values()) {
    for (const pos of vs.territory) {
      lookup.set(`${pos.x},${pos.y}`, vs.villageId);
    }
  }
  return lookup;
}

export function buildColorMap(
  village4xStates: Map<string, VillageState4XSerialized>,
): Map<string, string> {
  const allIds = [...village4xStates.keys()];
  const colorMap = new Map<string, string>();
  for (const id of allIds) {
    colorMap.set(id, getVillageColor(id, allIds));
  }
  return colorMap;
}

export function drawTerritoryOverlay(
  ctx: CanvasRenderingContext2D,
  lookup: TerritoryLookup,
  colorMap: Map<string, string>,
  startTileX: number,
  endTileX: number,
  startTileY: number,
  endTileY: number,
  camX: number,
  camY: number,
  halfW: number,
  halfH: number,
  zoom: number,
): void {
  const size = Math.ceil(TILE_SIZE * zoom) + 1;

  for (let ty = startTileY; ty <= endTileY; ty++) {
    for (let tx = startTileX; tx <= endTileX; tx++) {
      const key = `${tx},${ty}`;
      const villageId = lookup.get(key);
      if (!villageId) continue;

      const color = colorMap.get(villageId);
      if (!color) continue;

      const screenX = halfW + (tx * TILE_SIZE - camX) * zoom;
      const screenY = halfH + (ty * TILE_SIZE - camY) * zoom;

      // Territory fill (19% alpha)
      ctx.fillStyle = color + '30';
      ctx.fillRect(screenX, screenY, size, size);

      // Border lines: draw 2px borders where adjacent tile is different village or unowned
      ctx.strokeStyle = color + '80';
      ctx.lineWidth = 2;

      const left = lookup.get(`${tx - 1},${ty}`);
      const right = lookup.get(`${tx + 1},${ty}`);
      const up = lookup.get(`${tx},${ty - 1}`);
      const down = lookup.get(`${tx},${ty + 1}`);

      if (left !== villageId) {
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX, screenY + size);
        ctx.stroke();
      }
      if (right !== villageId) {
        ctx.beginPath();
        ctx.moveTo(screenX + size, screenY);
        ctx.lineTo(screenX + size, screenY + size);
        ctx.stroke();
      }
      if (up !== villageId) {
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + size, screenY);
        ctx.stroke();
      }
      if (down !== villageId) {
        ctx.beginPath();
        ctx.moveTo(screenX, screenY + size);
        ctx.lineTo(screenX + size, screenY + size);
        ctx.stroke();
      }
    }
  }
}
