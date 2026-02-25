import Anthropic from '@anthropic-ai/sdk';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CACHE_DIR = './cache/sprites';

// --- Ensure cache directory ---

async function ensureCacheDir(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

// --- Check if cached sprite exists ---

function getCachePath(key: string, extension: string = 'png'): string {
  return `${CACHE_DIR}/${key}.${extension}`;
}

function isCached(key: string): boolean {
  return existsSync(getCachePath(key));
}

// --- Generate pixel art prompt ---

function buildTilesetPrompt(style: string): string {
  return `Create a 16x16 pixel art tileset sprite sheet for a JRPG game.
Style: ${style}
The sprite sheet should contain these tiles in a 4x2 grid (each 16x16 pixels):
Row 1: grass plains, dense forest, mountain peak, water/ocean
Row 2: sandy desert, murky swamp, farmland, village path

Rules:
- Exactly 16x16 pixels per tile
- Limited palette (max 8 colors per tile)
- Classic SNES/GBA JRPG aesthetic
- Clean pixel art, no anti-aliasing
- Top-down perspective`;
}

function buildCharacterPrompt(personality: {
  openness: number;
  agreeableness: number;
  ambition: number;
}, role: string): string {
  const palette = personality.ambition > 60 ? 'warm reds and golds' :
    personality.agreeableness > 60 ? 'cool greens and blues' :
    personality.openness > 60 ? 'bright varied colors' : 'muted earth tones';

  return `Create a 16x24 pixel art character sprite sheet for a JRPG game.
Character role: ${role}
Color palette: ${palette}

The sprite sheet should show 4 directions x 3 walk frames (12 frames total):
Row 1: facing down (3 frames)
Row 2: facing left (3 frames)
Row 3: facing right (3 frames)
Row 4: facing up (3 frames)

Rules:
- Each frame is 16x24 pixels
- Classic SNES JRPG character style
- Clean pixel art, no anti-aliasing
- Simple but recognizable character design`;
}

function buildBuildingPrompt(type: string, style: string): string {
  return `Create a 32x32 pixel art building sprite for a JRPG village.
Building type: ${type}
Architectural style: ${style}

Rules:
- 32x32 pixels
- 3/4 top-down perspective (typical JRPG view)
- Classic SNES pixel art aesthetic
- Clean lines, limited palette
- Should look like a ${type} in a fantasy village`;
}

// --- Generate with OpenAI DALL-E (placeholder for actual API) ---
// Note: Actual DALL-E integration requires OpenAI SDK; this provides the interface
// and falls back to procedural generation when API key is not available.

export interface GeneratedSprite {
  key: string;
  path: string;
  width: number;
  height: number;
  cached: boolean;
}

export async function generateTileset(style: string = '和風ファンタジー'): Promise<GeneratedSprite> {
  const key = `tileset_${hashString(style)}`;
  await ensureCacheDir();

  if (isCached(key)) {
    return { key, path: getCachePath(key), width: 64, height: 32, cached: true };
  }

  // Generate procedurally as fallback (actual DALL-E would go here)
  const data = generateProceduralTileset();
  await Bun.write(getCachePath(key), data);

  return { key, path: getCachePath(key), width: 64, height: 32, cached: false };
}

export async function generateCharacterSprite(
  agentId: string,
  personality: { openness: number; agreeableness: number; ambition: number },
  role: string = '村人',
): Promise<GeneratedSprite> {
  const key = `char_${agentId}`;
  await ensureCacheDir();

  if (isCached(key)) {
    return { key, path: getCachePath(key), width: 48, height: 96, cached: true };
  }

  const data = generateProceduralCharacter(personality);
  await Bun.write(getCachePath(key), data);

  return { key, path: getCachePath(key), width: 48, height: 96, cached: false };
}

export async function generateBuildingSprite(
  type: string,
  style: string = '伝統的',
): Promise<GeneratedSprite> {
  const key = `building_${type}_${hashString(style)}`;
  await ensureCacheDir();

  if (isCached(key)) {
    return { key, path: getCachePath(key), width: 32, height: 32, cached: true };
  }

  const data = generateProceduralBuilding(type);
  await Bun.write(getCachePath(key), data);

  return { key, path: getCachePath(key), width: 32, height: 32, cached: false };
}

// --- Simple hash for cache keys ---

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// --- Procedural sprite generation (BMP-like binary data) ---
// These generate simple colored rectangles as placeholder sprites.
// When DALL-E API is connected, these get replaced with AI-generated art.

function generateProceduralTileset(): Uint8Array {
  // 64x32 RGBA raw data (4 tiles x 2 rows of 16x16)
  const w = 64, h = 32;
  const data = new Uint8Array(w * h * 4);
  const colors = [
    [0x5a, 0x9a, 0x3a], // plains
    [0x2a, 0x5a, 0x2a], // forest
    [0x7a, 0x6a, 0x50], // mountain
    [0x2a, 0x5a, 0xb0], // water
    [0xb0, 0x9a, 0x60], // desert
    [0x4a, 0x5a, 0x3a], // swamp
    [0xc4, 0xb0, 0x60], // farmland
    [0xa0, 0x90, 0x80], // path
  ];

  for (let tileIdx = 0; tileIdx < 8; tileIdx++) {
    const col = tileIdx % 4;
    const row = Math.floor(tileIdx / 4);
    const [r, g, b] = colors[tileIdx];

    for (let dy = 0; dy < 16; dy++) {
      for (let dx = 0; dx < 16; dx++) {
        const px = col * 16 + dx;
        const py = row * 16 + dy;
        const idx = (py * w + px) * 4;
        // Add slight noise for texture
        const noise = Math.floor(Math.random() * 20 - 10);
        data[idx] = Math.max(0, Math.min(255, r + noise));
        data[idx + 1] = Math.max(0, Math.min(255, g + noise));
        data[idx + 2] = Math.max(0, Math.min(255, b + noise));
        data[idx + 3] = 255;
      }
    }
  }

  return data;
}

function generateProceduralCharacter(personality: {
  openness: number;
  agreeableness: number;
  ambition: number;
}): Uint8Array {
  // 48x96 (3 frames x 4 directions, each 16x24)
  const w = 48, h = 96;
  const data = new Uint8Array(w * h * 4);

  const r = Math.round(100 + personality.ambition * 1.5);
  const g = Math.round(100 + personality.agreeableness * 1.2);
  const b = Math.round(100 + personality.openness * 1.0);

  // Simple character silhouette per frame
  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 3; frame++) {
      const ox = frame * 16;
      const oy = dir * 24;
      // Head (centered 8x8)
      for (let dy = 2; dy < 10; dy++) {
        for (let dx = 4; dx < 12; dx++) {
          const px = ox + dx;
          const py = oy + dy;
          const idx = (py * w + px) * 4;
          data[idx] = 0xff; data[idx + 1] = 0xd5; data[idx + 2] = 0xb0; data[idx + 3] = 255;
        }
      }
      // Body
      for (let dy = 10; dy < 20; dy++) {
        for (let dx = 3; dx < 13; dx++) {
          const px = ox + dx;
          const py = oy + dy;
          const idx = (py * w + px) * 4;
          data[idx] = Math.min(255, r); data[idx + 1] = Math.min(255, g); data[idx + 2] = Math.min(255, b); data[idx + 3] = 255;
        }
      }
    }
  }

  return data;
}

function generateProceduralBuilding(type: string): Uint8Array {
  const w = 32, h = 32;
  const data = new Uint8Array(w * h * 4);

  const colorMap: Record<string, [number, number, number]> = {
    house: [0xc4, 0x95, 0x6a],
    farm: [0xd4, 0xc3, 0x6a],
    workshop: [0x8b, 0x69, 0x14],
    temple: [0xff, 0xd7, 0x00],
    market: [0xda, 0xa5, 0x20],
  };
  const [r, g, b] = colorMap[type] ?? [0xa0, 0x80, 0x60];

  // Simple building shape
  for (let dy = 8; dy < 30; dy++) {
    for (let dx = 4; dx < 28; dx++) {
      const idx = (dy * w + dx) * 4;
      const isRoof = dy < 14;
      data[idx] = isRoof ? Math.max(0, r - 40) : r;
      data[idx + 1] = isRoof ? Math.max(0, g - 40) : g;
      data[idx + 2] = isRoof ? Math.max(0, b - 40) : b;
      data[idx + 3] = 255;
    }
  }

  return data;
}

// --- Route handler for serving cached sprites ---

export function getSpritePath(key: string): string | null {
  const path = getCachePath(key);
  return existsSync(path) ? path : null;
}
