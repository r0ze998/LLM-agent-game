import { describe, test, expect } from "bun:test";
import {
  VillageIdMapper,
  BUILDING_STR_TO_U32,
  BUILDING_U32_TO_STR,
  TECH_STR_TO_U32,
  TECH_U32_TO_STR,
  UNIT_STR_TO_U32,
  UNIT_U32_TO_STR,
} from "../dojoSync.ts";

describe("VillageIdMapper", () => {
  test("register assigns sequential IDs", () => {
    const m = new VillageIdMapper();
    const id1 = m.register("aaa");
    const id2 = m.register("bbb");
    const id3 = m.register("ccc");
    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(id3).toBe(3);
    expect(m.size).toBe(3);
  });

  test("duplicate register is idempotent", () => {
    const m = new VillageIdMapper();
    const id1 = m.register("aaa");
    const id2 = m.register("aaa");
    expect(id1).toBe(id2);
    expect(m.size).toBe(1);
  });

  test("toU32 and toUuid are bidirectional", () => {
    const m = new VillageIdMapper();
    m.register("uuid-1");
    m.register("uuid-2");

    expect(m.toU32("uuid-1")).toBe(1);
    expect(m.toU32("uuid-2")).toBe(2);
    expect(m.toUuid(1)).toBe("uuid-1");
    expect(m.toUuid(2)).toBe("uuid-2");
    expect(m.toU32("unknown")).toBeUndefined();
    expect(m.toUuid(999)).toBeUndefined();
  });

  test("serialize and restore round-trip", () => {
    const m1 = new VillageIdMapper();
    m1.register("v1");
    m1.register("v2");
    m1.register("v3");

    const data = m1.serialize();
    expect(data.mappings).toHaveLength(3);
    expect(data.nextId).toBe(4);

    const m2 = new VillageIdMapper();
    m2.restore(data.mappings, data.nextId);

    expect(m2.toU32("v1")).toBe(1);
    expect(m2.toU32("v2")).toBe(2);
    expect(m2.toU32("v3")).toBe(3);
    expect(m2.toUuid(1)).toBe("v1");
    expect(m2.size).toBe(3);
  });

  test("nextId continues after restore", () => {
    const m = new VillageIdMapper();
    m.register("v1");
    m.register("v2");

    const data = m.serialize();
    const m2 = new VillageIdMapper();
    m2.restore(data.mappings, data.nextId);

    const newId = m2.register("v3");
    expect(newId).toBe(3);
  });
});

describe("Static mapping tables", () => {
  test("BUILDING: 25 entries with bidirectional consistency", () => {
    const strKeys = Object.keys(BUILDING_STR_TO_U32);
    expect(strKeys).toHaveLength(25);

    for (const [str, u32] of Object.entries(BUILDING_STR_TO_U32)) {
      expect(BUILDING_U32_TO_STR[u32]).toBe(str);
    }
    for (const [u32Str, str] of Object.entries(BUILDING_U32_TO_STR)) {
      expect(BUILDING_STR_TO_U32[str]).toBe(Number(u32Str));
    }
  });

  test("TECH: 30 entries with bidirectional consistency", () => {
    const strKeys = Object.keys(TECH_STR_TO_U32);
    expect(strKeys).toHaveLength(30);

    for (const [str, u32] of Object.entries(TECH_STR_TO_U32)) {
      expect(TECH_U32_TO_STR[u32]).toBe(str);
    }
    for (const [u32Str, str] of Object.entries(TECH_U32_TO_STR)) {
      expect(TECH_STR_TO_U32[str]).toBe(Number(u32Str));
    }
  });

  test("UNIT: 10 entries with bidirectional consistency", () => {
    const strKeys = Object.keys(UNIT_STR_TO_U32);
    expect(strKeys).toHaveLength(10);

    for (const [str, u32] of Object.entries(UNIT_STR_TO_U32)) {
      expect(UNIT_U32_TO_STR[u32]).toBe(str);
    }
    for (const [u32Str, str] of Object.entries(UNIT_U32_TO_STR)) {
      expect(UNIT_STR_TO_U32[str]).toBe(Number(u32Str));
    }
  });
});
