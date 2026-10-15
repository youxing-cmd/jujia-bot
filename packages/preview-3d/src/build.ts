import type { Level, Opening, Scene, SceneMaterial, Slot, Vec2, Wall } from "@jujia/scene";
import type { PreviewMesh, PreviewModel } from "./types";

const MISSING_FLOOR = { color: "#CCCCCC", roughness: 1, metalness: 0 };
const MISSING_WALL = { color: "#F3F0E8", roughness: 0.9, metalness: 0 };
const OPENING_DEPTH = 0.06;

const OPENING_COLORS: Record<string, string> = {
  door_flat: "#8C6A4A",
  door_glass: "#9BB8C4",
  window_sliding: "#A9C7D6",
  window_casement: "#8FB4C4",
};

const SLOT_COLORS: Record<string, string> = {
  sofa_210: "#4E6A78",
  sofa_160: "#8C6E5A",
  cabinet_120: "#A67C52",
};

function wallLength(wall: Wall): number {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  return Math.hypot(dx, dy);
}

function pointOnWall(wall: Wall, distance: number): Vec2 {
  const length = wallLength(wall);
  if (length < 1e-6) return { x: wall.a.x, y: wall.a.y };
  const t = distance / length;
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  };
}

function materialById(scene: Scene, id: string): SceneMaterial | undefined {
  return scene.materials.find((material) => material.id === id);
}

function wallMaterial(scene: Scene): { color: string; roughness: number; metalness: number } {
  const named = scene.materials.find((material) => material.id === "wall_white");
  const fallback = named ?? scene.materials.find((material) => material.category === "wall");
  if (!fallback) return MISSING_WALL;
  return {
    color: fallback.color,
    roughness: fallback.roughness,
    metalness: fallback.metalness,
  };
}

function floorMesh(level: Level, room: Level["rooms"][number], scene: Scene): PreviewMesh {
  const material = materialById(scene, room.floorMaterialId);
  return {
    id: `${room.id}:floor`,
    role: "floor",
    polygon: room.polygon.map((point) => ({ x: point.x, y: point.y })),
    position: { x: 0, y: level.elevation, z: 0 },
    rotationY: 0,
    size: { x: 0, y: 0.02, z: 0 },
    color: material?.color ?? MISSING_FLOOR.color,
    roughness: material?.roughness ?? MISSING_FLOOR.roughness,
    metalness: material?.metalness ?? MISSING_FLOOR.metalness,
    roomId: room.id,
  };
}

function wallMesh(level: Level, wall: Wall, scene: Scene): PreviewMesh {
  const height = wall.height ?? level.ceilingHeight;
  const mid = pointOnWall(wall, wallLength(wall) / 2);
  const finish = wallMaterial(scene);
  return {
    id: wall.id,
    role: "wall",
    position: { x: mid.x, y: height / 2 + level.elevation, z: mid.y },
    rotationY: Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x),
    size: { x: wallLength(wall), y: height, z: wall.thickness },
    color: finish.color,
    roughness: finish.roughness,
    metalness: finish.metalness,
  };
}

function openingColor(opening: Opening): string {
  if (opening.styleId && OPENING_COLORS[opening.styleId]) return OPENING_COLORS[opening.styleId];
  return opening.kind === "door" ? "#8C6A4A" : "#A9C7D6";
}

function openingMesh(level: Level, opening: Opening, walls: Map<string, Wall>): PreviewMesh | undefined {
  const wall = walls.get(opening.wallId);
  if (!wall) return undefined;
  const center = pointOnWall(wall, opening.offset + opening.width / 2);
  return {
    id: opening.id,
    role: opening.kind,
    position: {
      x: center.x,
      y: opening.sill + opening.height / 2 + level.elevation,
      z: center.y,
    },
    rotationY: Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x),
    size: { x: opening.width, y: opening.height, z: OPENING_DEPTH },
    color: openingColor(opening),
    roughness: 0.5,
    metalness: 0,
    openingId: opening.id,
  };
}

function slotColor(slot: Slot): string {
  if (slot.catalogItemId && SLOT_COLORS[slot.catalogItemId]) return SLOT_COLORS[slot.catalogItemId];
  return slot.kind === "cabinet" ? "#A67C52" : "#4E6A78";
}

function slotMesh(level: Level, slot: Slot): PreviewMesh {
  return {
    id: slot.id,
    role: slot.kind,
    position: { x: slot.x, y: slot.height / 2 + level.elevation, z: slot.y },
    rotationY: slot.rotation,
    size: { x: slot.width, y: slot.height, z: slot.depth },
    color: slotColor(slot),
    roughness: 0.6,
    metalness: 0,
    roomId: slot.roomId,
    slotId: slot.id,
  };
}

export function buildPreviewModel(scene: Scene): PreviewModel {
  const levels = scene.levels ?? [];
  const ceilingHeight = levels[0]?.ceilingHeight ?? 0;
  const meshes: PreviewMesh[] = [];

  for (const level of levels) {
    for (const room of level.rooms ?? []) meshes.push(floorMesh(level, room, scene));
    for (const wall of level.walls ?? []) meshes.push(wallMesh(level, wall, scene));
    const walls = new Map((level.walls ?? []).map((wall) => [wall.id, wall]));
    for (const opening of level.openings ?? []) {
      const mesh = openingMesh(level, opening, walls);
      if (mesh) meshes.push(mesh);
    }
    for (const slot of level.slots ?? []) meshes.push(slotMesh(level, slot));
  }

  return { ceilingHeight, meshes };
}
