import { describe, expect, it } from "vitest";
import type { Scene, Slot } from "@jujia/scene";
import sceneJson from "../../../fixtures/two-bedroom.json" with { type: "json" };
import { demoClutter } from "./demo";
import { suggestPlacements } from "./suggest";
import type { ClutterItem } from "./types";

function loadScene(): Scene {
  return structuredClone(sceneJson) as Scene;
}

function slot(scene: Scene, id: string) {
  const found = scene.levels[0]?.slots.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function byId(result: ReturnType<typeof suggestPlacements>) {
  if (!result.ok) throw new Error(result.message);
  return {
    placed: new Map(result.placements.map((item) => [item.itemId, item])),
    missed: new Map(result.unplaced.map((item) => [item.itemId, item])),
  };
}

describe("suggestPlacements", () => {
  it("places the demo list onto the confirmed two-bedroom", () => {
    const scene = loadScene();
    const before = JSON.stringify(scene);
    const items = demoClutter.map((item) => ({ ...item }));
    const beforeItems = JSON.stringify(items);
    const result = suggestPlacements(scene, items);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { placed, missed } = byId(result);
    expect(placed.get("quilt")).toMatchObject({ slotId: "slot_wardrobe", roomName: "主卧", hostName: "衣柜", shelf: 2, shelfCount: 1 });
    expect(placed.get("winter_coats")).toMatchObject({ slotId: "slot_wardrobe", shelf: 3, shelfCount: 1 });
    expect(placed.get("shirts")).toMatchObject({ slotId: "slot_wardrobe", shelf: 4, shelfCount: 1 });
    expect(placed.get("shoes")).toMatchObject({ slotId: "slot_wardrobe", shelf: 1, shelfCount: 1, reason: "放在主卧的衣柜，第 1 层" });
    expect(placed.get("novels")).toMatchObject({ slotId: "slot_shelf", roomName: "客厅", hostName: "靠墙书架", shelf: 1, shelfCount: 1 });
    expect(placed.get("blocks")).toMatchObject({ slotId: "slot_shelf", shelf: 2, shelfCount: 1 });
    expect(placed.get("magazines")).toMatchObject({ slotId: "slot_shelf", shelf: 3, shelfCount: 1 });
    expect(placed.get("tax_docs")).toMatchObject({ slotId: "slot_desk", roomName: "次卧", hostName: "书桌", shelf: 1, shelfCount: 1 });
    expect(placed.get("charger")).toMatchObject({ slotId: "slot_nightstand", roomName: "主卧", hostName: "床头柜", shelf: 1, shelfCount: 1 });
    expect(missed.get("toiletries")?.reason).toBe("卫生间还没有柜或层架，不塞进卧室");
    expect(missed.get("pans")?.reason).toBe("这套房没有厨房柜");
    expect(result.placements.every((item) => item.shelfCount === 1)).toBe(true);
    expect(JSON.stringify(scene)).toBe(before);
    expect(JSON.stringify(items)).toBe(beforeItems);
  });

  it("rejects a draft before it looks at an illegal list", () => {
    const scene = loadScene();
    scene.status = "draft";
    const before = JSON.stringify(scene);
    const result = suggestPlacements(scene, [{ id: "", name: "", category: "nope" as ClutterItem["category"], volumeM3: -1 }]);
    expect(result).toEqual({ ok: false, code: "not_confirmed", message: "平面还没确认，先不定杂物放哪。" });
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("rejects an unconfirmed scale", () => {
    const scene = loadScene();
    scene.scale.confirmed = false;
    const result = suggestPlacements(scene, demoClutter);
    expect(result).toEqual({ ok: false, code: "not_confirmed", message: "比例还没确认，先不定杂物放哪。" });
  });

  it("still places after the plan is frozen", () => {
    const scene = loadScene();
    scene.status = "frozen";
    const result = suggestPlacements(scene, demoClutter);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements.some((item) => item.itemId === "quilt")).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const scene = loadScene();
    const before = JSON.stringify(scene);
    const result = suggestPlacements(scene, [
      { id: "same", name: "甲", category: "books", volumeM3: 0.01 },
      { id: "same", name: "乙", category: "books", volumeM3: 0.02 },
    ]);
    expect(result).toEqual({ ok: false, code: "invalid_item", message: "杂物清单不合法。" });
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("uses a smaller stored cabinet capacity without recomputing the formula", () => {
    const scene = loadScene();
    const wardrobe = slot(scene, "slot_wardrobe");
    wardrobe.capacity = { volumeM3: 0.05, shelves: 1 };
    const result = suggestPlacements(scene, [
      { id: "quilt", name: "被子", category: "bedding", volumeM3: 0.2 },
      { id: "socks", name: "袜子", category: "clothes", volumeM3: 0.04 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements.map((item) => item.itemId)).toEqual(["socks"]);
    expect(result.placements[0]).toMatchObject({ slotId: "slot_wardrobe", shelf: 1 });
    expect(result.unplaced.map((item) => item.itemId)).toEqual(["quilt"]);
    expect(wardrobe.width).toBe(1.2);
    expect(wardrobe.depth).toBe(0.55);
    expect(wardrobe.height).toBe(2.2);
  });

  it("returns empty lists for an empty confirmed request", () => {
    const result = suggestPlacements(loadScene(), []);
    expect(result).toEqual({ ok: true, placements: [], unplaced: [] });
  });

  it("does not move shoes onto a larger cabinet when the best one cannot hold them", () => {
    const scene = loadScene();
    const wardrobe = slot(scene, "slot_wardrobe");
    wardrobe.capacity = { volumeM3: 0.01, shelves: 1 };
    const bigger: Slot = {
      ...structuredClone(wardrobe),
      id: "slot_cabinet_second",
      roomId: "bedroom_second",
      capacity: { volumeM3: 2, shelves: 4 },
    };
    scene.levels[0]?.slots.push(bigger);
    const result = suggestPlacements(scene, [
      { id: "shoes", name: "鞋子", category: "shoes", volumeM3: 0.08 },
      { id: "quilt", name: "被子", category: "bedding", volumeM3: 0.2 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unplaced).toEqual([{ itemId: "shoes", reason: "合适的位置已经满了" }]);
    expect(result.placements.map((item) => item.itemId)).toEqual(["quilt"]);
    expect(result.placements[0]?.slotId).toBe("slot_cabinet_second");
  });

  it("sends books to the desk only after the shelf is full", () => {
    const result = suggestPlacements(loadScene(), [
      { id: "toy_a", name: "积木甲", category: "toys", volumeM3: 0.08 },
      { id: "toy_b", name: "积木乙", category: "toys", volumeM3: 0.08 },
      { id: "toy_c", name: "积木丙", category: "toys", volumeM3: 0.08 },
      { id: "toy_d", name: "积木丁", category: "toys", volumeM3: 0.08 },
      { id: "novels", name: "小说", category: "books", volumeM3: 0.05 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements.find((item) => item.itemId === "novels")).toMatchObject({
      slotId: "slot_desk",
      hostName: "书桌",
      shelf: 1,
      shelfCount: 1,
    });
    expect(result.unplaced).toEqual([]);
  });
});
