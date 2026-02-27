import type { Tile, TerrainType, Chunk, ResourceType, Position } from '@murasato/shared';
import {
  MAP_SIZE, CHUNK_SIZE, ELEVATION_WATER, ELEVATION_PLAINS,
  ELEVATION_FOREST, ELEVATION_MOUNTAIN,
} from '@murasato/shared';

// --- Simple Perlin-like noise (value noise with interpolation) ---

class NoiseGenerator {
  private perm: number[];

  constructor(seed: number) {
    // Generate permutation table from seed
    const rng = this.seededRandom(seed);
    this.perm = Array.from({ length: 512 }, (_, i) => i % 256);
    // Fisher-Yates shuffle first 256
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }
    // Duplicate for overflow
    for (let i = 0; i < 256; i++) {
      this.perm[i + 256] = this.perm[i];
    }
  }

  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.perm[this.perm[X] + Y];
    const ab = this.perm[this.perm[X] + Y + 1];
    const ba = this.perm[this.perm[X + 1] + Y];
    const bb = this.perm[this.perm[X + 1] + Y + 1];

    return this.lerp(
      this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u),
      this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u),
      v,
    );
  }

  // Multi-octave fractal noise
  fbm(x: number, y: number, octaves: number = 4, lacunarity: number = 2, gain: number = 0.5): number {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      sum += amplitude * this.noise2D(x * frequency, y * frequency);
      maxAmplitude += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return (sum / maxAmplitude + 1) / 2; // Normalize to 0-1
  }
}

// --- Terrain determination ---

function terrainFromElevation(elevation: number, moisture: number): TerrainType {
  if (elevation < ELEVATION_WATER) return 'water';
  if (elevation < ELEVATION_PLAINS) {
    if (moisture > 0.7) return 'swamp';
    return 'plains';
  }
  if (elevation < ELEVATION_FOREST) {
    if (moisture < 0.25) return 'desert';
    return 'forest';
  }
  if (elevation < ELEVATION_MOUNTAIN) return 'forest';
  return 'mountain';
}

function terrainResources(terrain: TerrainType): Partial<Record<ResourceType, number>> {
  switch (terrain) {
    case 'plains': return { food: 3, fiber: 2 };
    case 'forest': return { wood: 5, herbs: 2, food: 1 };
    case 'mountain': return { stone: 5, ore: 3 };
    case 'water': return {};
    case 'desert': return { clay: 2 };
    case 'swamp': return { herbs: 3, clay: 2 };
  }
}

function terrainFertility(terrain: TerrainType, moisture: number): number {
  switch (terrain) {
    case 'plains': return 0.6 + moisture * 0.3;
    case 'forest': return 0.4 + moisture * 0.2;
    case 'swamp': return 0.3;
    case 'mountain': return 0.1;
    case 'desert': return 0.05;
    case 'water': return 0;
  }
}

// --- Map generation ---

export interface WorldMap {
  size: number;
  tiles: Tile[][];
  seed: number;
}

export function generateMap(seed: number, size: number = MAP_SIZE): WorldMap {
  const elevationNoise = new NoiseGenerator(seed);
  const moistureNoise = new NoiseGenerator(seed + 1000);

  const tiles: Tile[][] = [];
  const scale = 0.04;

  for (let y = 0; y < size; y++) {
    tiles[y] = [];
    for (let x = 0; x < size; x++) {
      const elevation = elevationNoise.fbm(x * scale, y * scale, 5);
      const moisture = moistureNoise.fbm(x * scale * 1.2, y * scale * 1.2, 3);
      const terrain = terrainFromElevation(elevation, moisture);

      tiles[y][x] = {
        terrain,
        elevation,
        fertility: terrainFertility(terrain, moisture),
        resources: terrainResources(terrain),
        structureId: null,
        degradation: 0,
      };
    }
  }

  return { size, tiles, seed };
}

// --- Chunk extraction ---

export function getChunk(map: WorldMap, cx: number, cy: number): Chunk {
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;
  const chunkTiles: Tile[][] = [];

  for (let dy = 0; dy < CHUNK_SIZE; dy++) {
    chunkTiles[dy] = [];
    for (let dx = 0; dx < CHUNK_SIZE; dx++) {
      const x = startX + dx;
      const y = startY + dy;
      if (x < map.size && y < map.size) {
        chunkTiles[dy][dx] = map.tiles[y][x];
      } else {
        chunkTiles[dy][dx] = { terrain: 'water', elevation: 0, fertility: 0, resources: {}, structureId: null, degradation: 0 };
      }
    }
  }

  return { cx, cy, tiles: chunkTiles, version: 0 };
}

export function getChunkCount(size: number = MAP_SIZE): number {
  return Math.ceil(size / CHUNK_SIZE);
}

// --- Find walkable spawn positions ---

export function findSpawnPositions(map: WorldMap, count: number): Position[] {
  const candidates: Position[] = [];
  const center = Math.floor(map.size / 2);
  const radius = Math.min(6, Math.floor(map.size / 4)); // Tight spawn for social interaction

  for (let y = center - radius; y < center + radius; y++) {
    for (let x = center - radius; x < center + radius; x++) {
      if (x >= 0 && x < map.size && y >= 0 && y < map.size) {
        const tile = map.tiles[y][x];
        if (tile.terrain !== 'water' && tile.terrain !== 'mountain') {
          candidates.push({ x, y });
        }
      }
    }
  }

  // Shuffle and pick
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return candidates.slice(0, count);
}
