/**
 * dojoVillageMapperPersistence.ts — VillageIdMapper の JSON 永続化
 *
 * `saves/village_mapper.json` に UUID ↔ u32 マッピングを保存・復元する。
 * サーバー再起動時にマッピングが失われないことを保証する。
 */

import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { VillageIdMapper } from "./dojoSync.ts";

const SAVES_DIR = join(process.cwd(), "saves");
const MAPPER_FILE = join(SAVES_DIR, "village_mapper.json");

const LOG_PREFIX = "[VillageMapperPersistence]";

interface MapperData {
  version: 1;
  nextId: number;
  mappings: Array<{ uuid: string; u32: number }>;
}

/**
 * Save the current mapper state to disk.
 */
export async function saveMapper(mapper: VillageIdMapper): Promise<void> {
  const entries = mapper.entries();
  const data: MapperData = {
    version: 1,
    nextId: mapper.size > 0
      ? Math.max(...entries.map(([, id]) => id)) + 1
      : 1,
    mappings: entries.map(([uuid, u32]) => ({ uuid, u32 })),
  };

  if (!existsSync(SAVES_DIR)) {
    mkdirSync(SAVES_DIR, { recursive: true });
  }

  await writeFile(MAPPER_FILE, JSON.stringify(data, null, 2), "utf-8");
  console.log(`${LOG_PREFIX} Saved ${data.mappings.length} mappings to ${MAPPER_FILE}`);
}

/**
 * Restore mapper state from disk. Returns true if successful.
 */
export async function restoreMapper(mapper: VillageIdMapper): Promise<boolean> {
  if (!existsSync(MAPPER_FILE)) {
    console.log(`${LOG_PREFIX} No saved mapper found at ${MAPPER_FILE}`);
    return false;
  }

  try {
    const raw = await readFile(MAPPER_FILE, "utf-8");
    const data: MapperData = JSON.parse(raw);

    if (data.version !== 1) {
      console.warn(`${LOG_PREFIX} Unknown mapper version: ${data.version}`);
      return false;
    }

    mapper.restore(data.mappings, data.nextId);
    console.log(`${LOG_PREFIX} Restored ${data.mappings.length} mappings (nextId=${data.nextId})`);
    return true;
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to restore mapper:`, err);
    return false;
  }
}
