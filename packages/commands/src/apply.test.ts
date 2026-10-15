import { describe, expect, it } from "vitest";
import type { Scene } from "@jujia/scene";
import sceneJson from "../../../fixtures/two-bedroom.json" with { type: "json" };
import { applyCommand } from "./apply";
import type { Command, CommandErrorCode } from "./types";

function loadScene(): Scene {
  return structuredClone(sceneJson) as Scene;
}

function unchanged(scene: Scene, command: Command, code: CommandErrorCode) {
  const before = JSON.stringify(scene);
  const result = applyCommand(scene, command);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe(code);
  expect(JSON.stringify(scene)).toBe(before);
  return result;
}

describe("applyCommand", () => {
  it("changes a floor material without touching geometry", () => {
    const scene = loadScene();
    const before = JSON.stringify(scene);
    const result = applyCommand(scene, {
      type: "change_material",
      roomId: "living",
      surface: "floor",
      materialId: "floor_tile",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene).not.toBe(scene);
    expect(result.scene.levels[0]?.rooms[0]?.floorMaterialId).toBe("floor_tile");
    expect(result.scene.levels[0]?.rooms[0]?.polygon).toEqual(scene.levels[0]?.rooms[0]?.polygon);
    expect(result.scene.levels[0]?.openings).toEqual(scene.levels[0]?.openings);
    expect(result.scene.levels[0]?.slots).toEqual(scene.levels[0]?.slots);
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("adds a wall material and overwrites an existing material id", () => {
    const scene = loadScene();
    const oak = scene.materials.find((item) => item.id === "floor_oak");
    expect(oak).toBeDefined();
    if (oak) oak.color = "#000000";
    const added = applyCommand(scene, {
      type: "change_material",
      roomId: "bedroom_master",
      surface: "wall",
      materialId: "wall_warm",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.scene.materials.some((item) => item.id === "wall_warm")).toBe(true);
    expect(added.scene.levels[0]?.rooms.find((room) => room.id === "bedroom_master")?.wallMaterialId).toBe(
      "wall_warm",
    );

    const restored = applyCommand(scene, {
      type: "change_material",
      roomId: "living",
      surface: "floor",
      materialId: "floor_oak",
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.scene.materials.filter((item) => item.id === "floor_oak")).toHaveLength(1);
    expect(restored.scene.materials.find((item) => item.id === "floor_oak")?.color).toBe("#C4A574");
  });

  it("rejects material commands for missing rooms, materials, and categories", () => {
    const scene = loadScene();
    unchanged(scene, { type: "change_material", roomId: "missing", surface: "floor", materialId: "floor_oak" }, "unknown_target");
    unchanged(scene, { type: "change_material", roomId: "living", surface: "floor", materialId: "missing" }, "unknown_material");
    unchanged(scene, { type: "change_material", roomId: "living", surface: "floor", materialId: "wall_white" }, "category_mismatch");
    unchanged(scene, { type: "change_material", roomId: "living", surface: "wall", materialId: "floor_oak" }, "category_mismatch");
  });

  it("changes only an opening style", () => {
    const scene = loadScene();
    const result = applyCommand(scene, {
      type: "change_opening_style",
      openingId: "door_master",
      styleId: "door_flat",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = scene.levels[0]?.openings.find((item) => item.id === "door_master");
    const after = result.scene.levels[0]?.openings.find((item) => item.id === "door_master");
    expect(after?.styleId).toBe("door_flat");
    expect(after?.width).toBe(0.8);
    expect(after?.offset).toBe(before?.offset);
    expect(after?.height).toBe(before?.height);
    expect(after?.sill).toBe(before?.sill);
  });

  it("rejects opening commands for missing targets, styles, and kinds", () => {
    const scene = loadScene();
    unchanged(scene, { type: "change_opening_style", openingId: "missing", styleId: "door_flat" }, "unknown_target");
    unchanged(scene, { type: "change_opening_style", openingId: "door_master", styleId: "missing" }, "unknown_style");
    unchanged(scene, { type: "change_opening_style", openingId: "door_master", styleId: "window_sliding" }, "category_mismatch");
  });

  it("replaces furniture inside the slot limits", () => {
    const scene = loadScene();
    const beforeSlot = scene.levels[0]?.slots.find((item) => item.id === "slot_sofa");
    const result = applyCommand(scene, {
      type: "replace_furniture",
      slotId: "slot_sofa",
      catalogItemId: "sofa_160",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slot = result.scene.levels[0]?.slots.find((item) => item.id === "slot_sofa");
    expect(slot?.catalogItemId).toBe("sofa_160");
    expect(slot?.width).toBe(1.6);
    expect(slot?.depth).toBe(0.85);
    expect(slot?.height).toBe(0.78);
    expect(slot?.x).toBe(beforeSlot?.x);
    expect(slot?.y).toBe(beforeSlot?.y);
    expect(slot?.rotation).toBe(beforeSlot?.rotation);
    expect(slot?.maxWidth).toBe(beforeSlot?.maxWidth);
    expect(slot?.maxDepth).toBe(beforeSlot?.maxDepth);
    expect(slot?.maxHeight).toBe(beforeSlot?.maxHeight);
  });

  it("rejects furniture replacement for the documented failure codes", () => {
    const scene = loadScene();
    unchanged(scene, { type: "replace_furniture", slotId: "missing", catalogItemId: "sofa_160" }, "unknown_target");
    unchanged(scene, { type: "replace_furniture", slotId: "slot_wardrobe", catalogItemId: "sofa_160" }, "wrong_slot_kind");
    unchanged(scene, { type: "replace_furniture", slotId: "slot_sofa", catalogItemId: "cabinet_120" }, "wrong_slot_kind");
    unchanged(scene, { type: "replace_furniture", slotId: "slot_sofa", catalogItemId: "missing" }, "unknown_item");

    const tight = loadScene();
    const sofa = tight.levels[0]?.slots.find((item) => item.id === "slot_sofa");
    expect(sofa).toBeDefined();
    if (sofa) sofa.maxWidth = 1.5;
    unchanged(tight, { type: "replace_furniture", slotId: "slot_sofa", catalogItemId: "sofa_160" }, "footprint_exceeds_slot");
  });

  it("resizes a cabinet and rewrites capacity", () => {
    const scene = loadScene();
    const result = applyCommand(scene, {
      type: "resize_cabinet",
      slotId: "slot_wardrobe",
      width: 1.6,
      depth: 0.55,
      height: 2.2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slot = result.scene.levels[0]?.slots.find((item) => item.id === "slot_wardrobe");
    expect(slot?.width).toBe(1.6);
    expect(slot?.depth).toBe(0.55);
    expect(slot?.height).toBe(2.2);
    expect(slot?.capacity).toEqual({ volumeM3: 1.2, shelves: 4 });
    expect(slot?.x).toBe(scene.levels[0]?.slots.find((item) => item.id === "slot_wardrobe")?.x);
    expect(slot?.maxWidth).toBe(2);
  });

  it("accepts cabinet sizes on the lower and upper bounds", () => {
    const scene = loadScene();
    const low = applyCommand(scene, {
      type: "resize_cabinet",
      slotId: "slot_wardrobe",
      width: 0.2,
      depth: 0.2,
      height: 0.2,
    });
    expect(low.ok).toBe(true);
    if (low.ok) {
      expect(low.scene.levels[0]?.slots.find((item) => item.id === "slot_wardrobe")?.capacity).toEqual({
        volumeM3: 0.005,
        shelves: 1,
      });
    }
    const high = applyCommand(scene, {
      type: "resize_cabinet",
      slotId: "slot_wardrobe",
      width: 2,
      depth: 0.6,
      height: 2.4,
    });
    expect(high.ok).toBe(true);
  });

  it("rejects cabinet resizing for the documented failure codes", () => {
    const scene = loadScene();
    unchanged(scene, { type: "resize_cabinet", slotId: "missing", width: 1, depth: 0.5, height: 2 }, "unknown_target");
    unchanged(scene, { type: "resize_cabinet", slotId: "slot_sofa", width: 1, depth: 0.5, height: 2 }, "wrong_slot_kind");
    unchanged(scene, { type: "resize_cabinet", slotId: "slot_wardrobe", width: 0.199, depth: 0.55, height: 2.2 }, "invalid_command");
    unchanged(scene, { type: "resize_cabinet", slotId: "slot_wardrobe", width: 2.01, depth: 0.55, height: 2.2 }, "footprint_exceeds_slot");
  });

  it("checks frozen, confirmation, then command shape, in that order", () => {
    const frozen = loadScene();
    frozen.status = "frozen";
    frozen.scale.confirmed = false;
    unchanged(frozen, { type: "change_material", roomId: "living", surface: "floor", materialId: "floor_tile" }, "frozen");
    unchanged(frozen, { type: "not_a_command" } as unknown as Command, "frozen");

    const draft = loadScene();
    draft.status = "draft";
    unchanged(draft, { type: "resize_cabinet", slotId: "slot_wardrobe", width: Number.NaN, depth: 0.5, height: 2 }, "not_confirmed");

    const unscaled = loadScene();
    unscaled.scale.confirmed = false;
    unchanged(unscaled, { type: "change_opening_style", openingId: "door_entry", styleId: "door_glass" }, "not_confirmed");

    const scene = loadScene();
    unchanged(scene, { type: "resize_cabinet", slotId: "slot_wardrobe", width: Number.POSITIVE_INFINITY, depth: 0.5, height: 2 }, "invalid_command");
    unchanged(scene, { type: "change_material", roomId: "living", surface: "ceiling", materialId: "floor_oak" } as unknown as Command, "invalid_command");
    unchanged(scene, { type: "replace_furniture", slotId: "slot_sofa" } as unknown as Command, "invalid_command");
  });

  it("finds a room on a later level", () => {
    const scene = loadScene();
    const level = structuredClone(scene.levels[0]);
    expect(level).toBeDefined();
    if (!level) return;
    level.id = "L2";
    level.rooms[0]!.id = "upstairs";
    scene.levels.push(level);
    const result = applyCommand(scene, {
      type: "change_material",
      roomId: "upstairs",
      surface: "floor",
      materialId: "floor_tile",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.levels[1]?.rooms[0]?.floorMaterialId).toBe("floor_tile");
    expect(result.scene.levels[0]?.rooms[0]?.floorMaterialId).toBe("floor_oak");
  });
});
