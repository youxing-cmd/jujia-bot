import { getItem, getMaterial, getOpeningStyle } from "@jujia/catalog";
import type { Scene, SceneMaterial, Slot } from "@jujia/scene";
import type { Command, CommandErrorCode, CommandResult } from "./types";

function fail(code: CommandErrorCode, message: string): CommandResult {
  return { ok: false, code, message };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCommandShape(command: Command): boolean {
  if (command === null || typeof command !== "object") return false;
  switch (command.type) {
    case "change_material":
      return (
        isString(command.roomId) &&
        (command.surface === "floor" || command.surface === "wall") &&
        isString(command.materialId)
      );
    case "change_opening_style":
      return isString(command.openingId) && isString(command.styleId);
    case "replace_furniture":
      return isString(command.slotId) && isString(command.catalogItemId);
    case "resize_cabinet":
      return (
        isString(command.slotId) &&
        isFiniteNumber(command.width) &&
        isFiniteNumber(command.depth) &&
        isFiniteNumber(command.height)
      );
    default:
      return false;
  }
}

function findRoom(scene: Scene, roomId: string) {
  for (const level of scene.levels) {
    const room = level.rooms.find((item) => item.id === roomId);
    if (room) return room;
  }
  return undefined;
}

function findOpening(scene: Scene, openingId: string) {
  for (const level of scene.levels) {
    const opening = level.openings.find((item) => item.id === openingId);
    if (opening) return opening;
  }
  return undefined;
}

function findSlot(scene: Scene, slotId: string) {
  for (const level of scene.levels) {
    const slot = level.slots.find((item) => item.id === slotId);
    if (slot) return slot;
  }
  return undefined;
}

function writeMaterial(scene: Scene, material: SceneMaterial) {
  const existing = scene.materials.find((item) => item.id === material.id);
  if (existing) {
    existing.name = material.name;
    existing.category = material.category;
    existing.color = material.color;
    existing.roughness = material.roughness;
    existing.metalness = material.metalness;
    return;
  }
  scene.materials.push({ ...material });
}

function cabinetCapacity(width: number, depth: number, height: number) {
  return {
    volumeM3: Math.round(width * depth * height * 0.62 * 1000) / 1000,
    shelves: Math.max(1, Math.floor(height / 0.4) - 1),
  };
}

function exceedsSlot(slot: Slot, width: number, depth: number, height: number) {
  return width > slot.maxWidth || depth > slot.maxDepth || height > slot.maxHeight;
}

export function applyCommand(scene: Scene, command: Command): CommandResult {
  if (scene.status === "frozen") {
    return fail("frozen", "场景已冻结，不能再执行装修命令。");
  }
  if (scene.status !== "plan_confirmed" || scene.scale.confirmed !== true) {
    return fail("not_confirmed", "平面或比例尚未确认。");
  }
  if (!isCommandShape(command)) {
    return fail("invalid_command", "命令不完整，或尺寸不是有限数字。");
  }

  const next = structuredClone(scene);

  if (command.type === "change_material") {
    const room = findRoom(next, command.roomId);
    if (!room) return fail("unknown_target", "找不到这个房间。");
    const material = getMaterial(command.materialId);
    if (!material) return fail("unknown_material", "目录里没有这个材质。");
    const expected = command.surface === "floor" ? "floor" : "wall";
    if (material.category !== expected) {
      return fail("category_mismatch", "材质类别和要改的表面不一致。");
    }
    writeMaterial(next, material);
    if (command.surface === "floor") room.floorMaterialId = material.id;
    else room.wallMaterialId = material.id;
    return { ok: true, scene: next };
  }

  if (command.type === "change_opening_style") {
    const opening = findOpening(next, command.openingId);
    if (!opening) return fail("unknown_target", "找不到这扇门窗。");
    const style = getOpeningStyle(command.styleId);
    if (!style) return fail("unknown_style", "目录里没有这个门窗款式。");
    if (style.kind !== opening.kind) {
      return fail("category_mismatch", "款式种类和门窗不一致。");
    }
    opening.styleId = style.id;
    return { ok: true, scene: next };
  }

  if (command.type === "replace_furniture") {
    const slot = findSlot(next, command.slotId);
    if (!slot) return fail("unknown_target", "找不到这个槽位。");
    if (slot.kind !== "furniture") return fail("wrong_slot_kind", "这个槽位不是活动家具。");
    const item = getItem(command.catalogItemId);
    if (!item) return fail("unknown_item", "目录里没有这个物品。");
    if (item.category === "cabinet") return fail("wrong_slot_kind", "柜体不能放到活动家具槽位。");
    if (exceedsSlot(slot, item.width, item.depth, item.height)) {
      return fail("footprint_exceeds_slot", "物品尺寸超过槽位上限。");
    }
    slot.catalogItemId = item.id;
    slot.width = item.width;
    slot.depth = item.depth;
    slot.height = item.height;
    return { ok: true, scene: next };
  }

  const slot = findSlot(next, command.slotId);
  if (!slot) return fail("unknown_target", "找不到这个槽位。");
  if (slot.kind !== "cabinet") return fail("wrong_slot_kind", "这个槽位不是柜体。");
  if (command.width < 0.2 || command.depth < 0.2 || command.height < 0.2) {
    return fail("invalid_command", "柜体单边不能小于 0.2 米。");
  }
  if (exceedsSlot(slot, command.width, command.depth, command.height)) {
    return fail("footprint_exceeds_slot", "柜体尺寸超过槽位上限。");
  }
  slot.width = command.width;
  slot.depth = command.depth;
  slot.height = command.height;
  slot.capacity = cabinetCapacity(command.width, command.depth, command.height);
  return { ok: true, scene: next };
}
