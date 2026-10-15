import type { Scene } from "@jujia/scene";
import { describe, expect, it } from "vitest";
import { buildPreviewModel } from "./build";
import fixture from "../../../fixtures/two-bedroom.json";

function loadScene(): Scene {
  return structuredClone(fixture) as Scene;
}

describe("buildPreviewModel", () => {
  const model = buildPreviewModel(loadScene());

  it("builds 25 meshes for the sample scene", () => {
    expect(model.meshes).toHaveLength(25);
    expect(model.ceilingHeight).toBe(2.8);
  });

  it("colors the living room floor from its material", () => {
    const floor = model.meshes.find((mesh) => mesh.id === "living:floor");
    expect(floor).toMatchObject({
      role: "floor",
      roomId: "living",
      color: "#C4A574",
      roughness: 0.62,
      metalness: 0,
      rotationY: 0,
      position: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0.02, z: 0 },
    });
    expect(floor?.polygon).toHaveLength(4);
  });

  it("places the sofa on the slot footprint", () => {
    const sofa = model.meshes.find((mesh) => mesh.id === "slot_sofa");
    expect(sofa).toMatchObject({
      role: "furniture",
      slotId: "slot_sofa",
      roomId: "living",
      color: "#4E6A78",
      position: { x: 2.6, y: 0.41, z: 1.6 },
      size: { x: 2.1, y: 0.82, z: 0.9 },
      rotationY: 0,
    });
  });

  it("keeps the entry door width from the scene", () => {
    const door = model.meshes.find((mesh) => mesh.id === "door_entry");
    expect(door).toMatchObject({
      role: "door",
      openingId: "door_entry",
      color: "#8C6A4A",
      size: { x: 0.9, y: 2.1, z: 0.06 },
    });
  });

  it("uses a neutral floor when the material is missing and does not throw", () => {
    const scene = loadScene();
    scene.materials = scene.materials.filter((material) => material.category !== "floor");
    scene.levels[0]?.rooms.forEach((room) => {
      room.floorMaterialId = "missing_floor";
    });
    const firstWall = scene.levels[0]?.walls[0];
    if (firstWall) firstWall.height = 2.4;

    const preview = buildPreviewModel(scene);
    const floor = preview.meshes.find((mesh) => mesh.role === "floor");
    const wall = preview.meshes.find((mesh) => mesh.id === firstWall?.id);
    expect(floor).toMatchObject({ color: "#CCCCCC", roughness: 1, metalness: 0 });
    expect(wall?.size.y).toBe(2.4);
    expect(wall?.color).toBe("#F3F0E8");
  });

  it("falls back when wall_white is absent and ignores unknown opening walls", () => {
    const scene = loadScene();
    scene.materials = [
      {
        id: "wall_warm",
        name: "暖米色墙面",
        category: "wall",
        color: "#E7D7C1",
        roughness: 0.88,
        metalness: 0,
      },
    ];
    const level = scene.levels[0];
    if (!level) throw new Error("fixture has no level");
    level.elevation = 0.3;
    level.openings.push({
      id: "door_missing_wall",
      wallId: "missing",
      kind: "door",
      offset: 0,
      width: 0.8,
      height: 2,
      sill: 0,
    });
    const plain = level.openings.find((opening) => opening.id === "door_master");
    if (plain) delete plain.styleId;
    const wardrobe = level.slots.find((slot) => slot.id === "slot_wardrobe");
    if (wardrobe) wardrobe.catalogItemId = "cabinet_other";

    const preview = buildPreviewModel(scene);
    expect(preview.ceilingHeight).toBe(2.8);
    expect(preview.meshes.some((mesh) => mesh.id === "door_missing_wall")).toBe(false);
    expect(preview.meshes.find((mesh) => mesh.role === "wall")).toMatchObject({
      color: "#E7D7C1",
      roughness: 0.88,
      metalness: 0,
    });
    expect(preview.meshes.find((mesh) => mesh.id === "door_master")?.color).toBe("#8C6A4A");
    const wardrobeMesh = preview.meshes.find((mesh) => mesh.id === "slot_wardrobe");
    expect(wardrobeMesh).toMatchObject({ role: "cabinet", color: "#A67C52" });
    expect(wardrobeMesh?.position.y).toBeCloseTo(1.4);
    expect(preview.meshes.find((mesh) => mesh.id === "w_ext_s")?.position.y).toBeCloseTo(1.7);
  });
});
