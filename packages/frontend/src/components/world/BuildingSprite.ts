/**
 * BuildingSprite — FRLG-style pixel-art buildings.
 *
 * Each structure type has a pre-rendered 16×16 canvas cached on first use.
 * At render time we just drawImage().
 */

import type { Structure } from '@murasato/shared';
import { TILE_SIZE } from '@murasato/shared';

// ── Helpers ──────────────────────────────────────────────────────────────

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function createTile(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

// ── Building pattern generators ──────────────────────────────────────────

function drawHouse(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Triangular roof
  const roofColor = '#C85040';
  const roofDark = '#A03830';
  for (let y = 2; y < 7; y++) {
    const half = y - 2;
    rect(ctx, 7 - half, y, 1 + half * 2, 1, roofColor);
  }
  // Roof shadow on right
  for (let y = 3; y < 7; y++) {
    const half = y - 2;
    px(ctx, 7 + half, y, roofDark);
  }
  // Wall
  rect(ctx, 3, 7, 10, 7, '#E8D8B0');
  // Wall shadow right edge
  rect(ctx, 12, 7, 1, 7, '#C8B890');
  // Windows
  rect(ctx, 4, 8, 2, 2, '#68A8D8');
  px(ctx, 4, 8, '#88C8F0'); // window highlight
  rect(ctx, 10, 8, 2, 2, '#68A8D8');
  px(ctx, 10, 8, '#88C8F0');
  // Door
  rect(ctx, 7, 10, 2, 4, '#5C3D1E');
  px(ctx, 8, 12, '#C8A040'); // doorknob
  // Foundation
  rect(ctx, 2, 14, 12, 2, '#888078');
  return c;
}

function drawFarm(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Low sloped roof
  rect(ctx, 1, 5, 14, 2, '#A04020');
  rect(ctx, 2, 4, 12, 1, '#B05030');
  // Walls (red-brown barn)
  rect(ctx, 2, 7, 12, 7, '#8B4020');
  rect(ctx, 13, 7, 1, 7, '#6B3018'); // shadow
  // Large barn door
  rect(ctx, 5, 9, 6, 5, '#5C3010');
  rect(ctx, 7, 9, 2, 5, '#4B2808'); // door gap
  // X on door
  px(ctx, 6, 10, '#3B1800'); px(ctx, 10, 10, '#3B1800');
  px(ctx, 7, 11, '#3B1800'); px(ctx, 9, 11, '#3B1800');
  px(ctx, 8, 12, '#3B1800');
  // Hay bale next to barn
  rect(ctx, 14, 12, 2, 2, '#D8C060');
  px(ctx, 14, 11, '#C8B050');
  // Foundation
  rect(ctx, 1, 14, 14, 2, '#706858');
  return c;
}

function drawWorkshop(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Flat roof with chimney
  rect(ctx, 2, 4, 12, 2, '#605040');
  rect(ctx, 3, 3, 10, 1, '#706050');
  // Chimney
  rect(ctx, 11, 0, 2, 4, '#504030');
  px(ctx, 11, 0, '#808080'); // smoke
  // Walls
  rect(ctx, 2, 6, 12, 8, '#A08868');
  rect(ctx, 13, 6, 1, 8, '#887050');
  // Anvil shape in window
  rect(ctx, 4, 8, 3, 2, '#404040');
  px(ctx, 5, 7, '#505050');
  // Door
  rect(ctx, 9, 10, 3, 4, '#5C3D1E');
  // Sparks
  px(ctx, 3, 7, '#F8C020');
  px(ctx, 6, 6, '#F8A010');
  // Foundation
  rect(ctx, 1, 14, 14, 2, '#706858');
  return c;
}

function drawWarehouse(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Flat roof
  rect(ctx, 1, 3, 14, 2, '#606060');
  // Walls (gray stone)
  rect(ctx, 1, 5, 14, 9, '#989088');
  rect(ctx, 14, 5, 1, 9, '#787068');
  // Large door
  rect(ctx, 3, 8, 10, 6, '#685840');
  rect(ctx, 4, 8, 8, 1, '#786848'); // door top trim
  // Crates visible inside
  rect(ctx, 5, 11, 3, 3, '#B09060');
  rect(ctx, 9, 10, 3, 4, '#C0A070');
  // Foundation
  rect(ctx, 0, 14, 16, 2, '#706858');
  return c;
}

function drawMarket(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Awning (striped)
  for (let x = 1; x < 15; x++) {
    const color = x % 4 < 2 ? '#D04040' : '#F0E0C0';
    rect(ctx, x, 3, 1, 3, color);
  }
  // Poles
  rect(ctx, 2, 3, 1, 11, '#806040');
  rect(ctx, 13, 3, 1, 11, '#806040');
  // Counter
  rect(ctx, 3, 9, 10, 2, '#A08060');
  // Goods on counter
  px(ctx, 5, 8, '#E04040'); px(ctx, 6, 8, '#40C040'); px(ctx, 7, 8, '#F0D020');
  px(ctx, 9, 8, '#E08040'); px(ctx, 10, 8, '#8040D0'); px(ctx, 11, 8, '#40B0E0');
  // Ground
  rect(ctx, 1, 14, 14, 2, '#B0A890');
  return c;
}

function drawMeetingHall(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Peaked roof
  for (let y = 1; y < 6; y++) {
    const half = y - 1;
    rect(ctx, 7 - half, y, 2 + half * 2, 1, '#705830');
  }
  rect(ctx, 2, 6, 12, 1, '#806840');
  // Walls
  rect(ctx, 2, 7, 12, 7, '#D8C8A0');
  rect(ctx, 13, 7, 1, 7, '#B8A880');
  // Columns
  rect(ctx, 3, 7, 1, 7, '#C0B090');
  rect(ctx, 12, 7, 1, 7, '#C0B090');
  // Large door
  rect(ctx, 6, 10, 4, 4, '#5C3D1E');
  rect(ctx, 7, 10, 2, 4, '#4B2D0E');
  // Windows
  rect(ctx, 4, 8, 2, 2, '#68A8D8');
  rect(ctx, 10, 8, 2, 2, '#68A8D8');
  // Foundation
  rect(ctx, 1, 14, 14, 2, '#908878');
  return c;
}

function drawSchool(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Flat roof with bell
  rect(ctx, 2, 3, 12, 2, '#607090');
  // Bell tower
  rect(ctx, 7, 0, 2, 3, '#708090');
  px(ctx, 7, 0, '#F0D040'); px(ctx, 8, 0, '#F0D040'); // bell
  // Walls
  rect(ctx, 2, 5, 12, 9, '#B0C4DE');
  rect(ctx, 13, 5, 1, 9, '#90A4BE');
  // Windows (3)
  rect(ctx, 3, 7, 2, 2, '#68A8D8');
  rect(ctx, 7, 7, 2, 2, '#68A8D8');
  rect(ctx, 11, 7, 2, 2, '#68A8D8');
  // Door
  rect(ctx, 7, 10, 2, 4, '#5C3D1E');
  // Foundation
  rect(ctx, 1, 14, 14, 2, '#808078');
  return c;
}

function drawTemple(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Two-tier pagoda roof (Japanese style)
  // Top tier
  rect(ctx, 5, 0, 6, 1, '#C8A040'); // gold tip
  rect(ctx, 4, 1, 8, 1, '#803020');
  rect(ctx, 3, 2, 10, 1, '#A04030');
  // Eaves flare out
  px(ctx, 2, 3, '#803020'); rect(ctx, 3, 3, 10, 1, '#803020'); px(ctx, 13, 3, '#803020');
  // Upper wall
  rect(ctx, 4, 4, 8, 3, '#E8D8B0');
  // Lower roof tier
  px(ctx, 1, 7, '#803020'); rect(ctx, 2, 7, 12, 1, '#A04030'); px(ctx, 14, 7, '#803020');
  // Lower wall
  rect(ctx, 3, 8, 10, 6, '#E8D8B0');
  rect(ctx, 12, 8, 1, 6, '#C8B890');
  // Gold accents
  px(ctx, 4, 5, '#F0D040'); px(ctx, 11, 5, '#F0D040');
  px(ctx, 4, 9, '#F0D040'); px(ctx, 11, 9, '#F0D040');
  // Door
  rect(ctx, 7, 11, 2, 3, '#5C3020');
  px(ctx, 8, 12, '#C8A040'); // door handle
  // Foundation
  rect(ctx, 2, 14, 12, 2, '#908878');
  return c;
}

function drawWall(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Stone wall — fills tile horizontally
  rect(ctx, 0, 6, 16, 8, '#808080');
  rect(ctx, 0, 6, 16, 1, '#909090'); // top highlight
  rect(ctx, 0, 13, 16, 1, '#606060'); // bottom shadow
  // Mortar lines
  for (let x = 0; x < 16; x += 5) {
    rect(ctx, x, 8, 1, 4, '#707070');
  }
  rect(ctx, 0, 10, 16, 1, '#707070');
  // Crenellations
  for (let x = 0; x < 16; x += 4) {
    rect(ctx, x, 4, 2, 2, '#888888');
    px(ctx, x, 4, '#989898');
  }
  return c;
}

function drawWatchtower(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Pointed roof
  px(ctx, 7, 0, '#706050'); px(ctx, 8, 0, '#706050');
  rect(ctx, 6, 1, 4, 1, '#806840');
  rect(ctx, 5, 2, 6, 1, '#907850');
  // Upper lookout
  rect(ctx, 5, 3, 6, 3, '#A09080');
  // Window slit
  px(ctx, 7, 4, '#283040'); px(ctx, 8, 4, '#283040');
  // Body (narrow tower)
  rect(ctx, 6, 6, 4, 8, '#989088');
  rect(ctx, 9, 6, 1, 8, '#787068');
  // Arrow slits
  px(ctx, 7, 8, '#283040');
  px(ctx, 7, 12, '#283040');
  // Foundation — wider base
  rect(ctx, 4, 14, 8, 2, '#706858');
  return c;
}

function drawWell(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Stone circle (overhead view)
  rect(ctx, 4, 5, 8, 8, '#A09888');
  rect(ctx, 5, 4, 6, 1, '#A09888');
  rect(ctx, 5, 13, 6, 1, '#A09888');
  // Dark water center
  rect(ctx, 6, 7, 4, 4, '#1830508');
  rect(ctx, 5, 6, 6, 6, '#183050');
  rect(ctx, 6, 5, 4, 8, '#183050');
  // Inner dark
  rect(ctx, 7, 7, 2, 4, '#0C1828');
  // Small roof structure
  rect(ctx, 3, 2, 1, 5, '#806040'); // left pole
  rect(ctx, 12, 2, 1, 5, '#806040'); // right pole
  rect(ctx, 3, 1, 10, 2, '#A04030'); // roof beam
  rect(ctx, 4, 0, 8, 1, '#B05040');
  // Rope
  px(ctx, 8, 3, '#C8B090');
  px(ctx, 8, 4, '#C8B090');
  // Bucket
  px(ctx, 8, 5, '#806040');
  return c;
}

function drawRoad(): HTMLCanvasElement {
  const [c, ctx] = createTile();
  // Dirt path
  rect(ctx, 0, 0, 16, 16, '#B0A080');
  // Lighter center
  rect(ctx, 3, 0, 10, 16, '#C0B090');
  // Edge stones
  rect(ctx, 1, 0, 1, 16, '#908878');
  rect(ctx, 14, 0, 1, 16, '#908878');
  // Pebble details
  px(ctx, 5, 3, '#9B8B70'); px(ctx, 10, 7, '#9B8B70');
  px(ctx, 7, 11, '#9B8B70'); px(ctx, 12, 14, '#9B8B70');
  // Worn track marks
  rect(ctx, 5, 0, 1, 16, '#B8A888');
  rect(ctx, 10, 0, 1, 16, '#B8A888');
  return c;
}

// ── Cache ────────────────────────────────────────────────────────────────

type DrawFn = () => HTMLCanvasElement;
const BUILDING_DRAW: Record<string, DrawFn> = {
  house: drawHouse,
  farm: drawFarm,
  workshop: drawWorkshop,
  warehouse: drawWarehouse,
  market: drawMarket,
  meeting_hall: drawMeetingHall,
  school: drawSchool,
  temple: drawTemple,
  wall: drawWall,
  watchtower: drawWatchtower,
  well: drawWell,
  road: drawRoad,
};

const buildingCache = new Map<string, HTMLCanvasElement>();

function getCachedBuilding(type: string): HTMLCanvasElement {
  let cached = buildingCache.get(type);
  if (!cached) {
    const fn = BUILDING_DRAW[type];
    cached = fn ? fn() : drawHouse(); // fallback to house
    buildingCache.set(type, cached);
  }
  return cached;
}

// ── Public API ───────────────────────────────────────────────────────────

const BUILDING_TYPES = Object.keys(BUILDING_DRAW);

/** Simple string hash for deterministic building type selection */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Draw a building given a Structure object (used when full structure data is available).
 */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  structure: Structure,
  cameraX: number,
  cameraY: number,
  zoom: number,
) {
  const screenX = (structure.position.x * TILE_SIZE - cameraX) * zoom;
  const screenY = (structure.position.y * TILE_SIZE - cameraY) * zoom;
  const size = TILE_SIZE * zoom;

  const tile = getCachedBuilding(structure.type);
  ctx.drawImage(tile, 0, 0, TILE_SIZE, TILE_SIZE, screenX, screenY, size, size);
}

/**
 * Draw a building on a tile that has a structureId but no Structure object.
 * Uses a hash of the structureId to deterministically pick a building type.
 */
export function drawBuildingFromId(
  ctx: CanvasRenderingContext2D,
  structureId: string,
  screenX: number,
  screenY: number,
  size: number,
) {
  const typeIdx = hashStr(structureId) % BUILDING_TYPES.length;
  const type = BUILDING_TYPES[typeIdx];
  const tile = getCachedBuilding(type);
  ctx.drawImage(tile, 0, 0, TILE_SIZE, TILE_SIZE, screenX, screenY, size, size);
}
