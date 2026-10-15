import { z } from "zod";
import { SceneParseError } from "./types";
import type { Level, Opening, Scene, Slot, Vec2, Wall } from "./types";

const vec2Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const sceneSchema = z.object({
  version: z.literal("1.0.0", {
    errorMap: () => ({ message: "version 必须是 1.0.0" }),
  }),
  id: z.string(),
  name: z.string(),
  units: z.literal("m", {
    errorMap: () => ({ message: "units 必须是 m" }),
  }),
  status: z.enum(["draft", "plan_confirmed", "frozen"]),
  scale: z.object({
    method: z.enum(["authored_meters", "user_edge", "dimension_label"]),
    confirmed: z.boolean(),
    metersPerPixel: z.number().finite().optional(),
    reference: z
      .object({
        edgeId: z.string().optional(),
        label: z.string().optional(),
        lengthM: z.number().finite().optional(),
      })
      .optional(),
  }),
  source: z.object({
    kind: z.enum(["authored", "upload"]),
    fileName: z.string().optional(),
  }),
  materials: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.enum(["floor", "wall", "ceiling", "cabinet", "opening"]),
      color: z.string(),
      roughness: z.number().finite(),
      metalness: z.number().finite(),
    }),
  ),
  levels: z.array(
    z.object({
      id: z.string(),
      elevation: z.number().finite(),
      ceilingHeight: z.number().finite(),
      walls: z.array(
        z.object({
          id: z.string(),
          a: vec2Schema,
          b: vec2Schema,
          thickness: z.number().finite(),
          height: z.number().finite().optional(),
        }),
      ),
      openings: z.array(
        z.object({
          id: z.string(),
          wallId: z.string(),
          kind: z.enum(["door", "window"]),
          offset: z.number().finite(),
          width: z.number().finite(),
          height: z.number().finite(),
          sill: z.number().finite(),
          styleId: z.string().optional(),
        }),
      ),
      rooms: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          usage: z.enum([
            "living",
            "dining",
            "bedroom",
            "kitchen",
            "bath",
            "balcony",
            "corridor",
            "other",
          ]),
          polygon: z.array(vec2Schema).min(3, "房间多边形少于 3 个点"),
          floorMaterialId: z.string(),
          wallMaterialId: z.string(),
        }),
      ),
      slots: z.array(
        z.object({
          id: z.string(),
          roomId: z.string(),
          kind: z.enum(["furniture", "cabinet"]),
          x: z.number().finite(),
          y: z.number().finite(),
          rotation: z.number().finite(),
          width: z.number().finite(),
          depth: z.number().finite(),
          height: z.number().finite(),
          maxWidth: z.number().finite(),
          maxDepth: z.number().finite(),
          maxHeight: z.number().finite(),
          catalogItemId: z.string().optional(),
          capacity: z
            .object({
              volumeM3: z.number().finite(),
              shelves: z.number().finite(),
            })
            .optional(),
        }),
      ),
    }),
  ).min(1, "没有楼层"),
});

function fail(message: string): never {
  throw new SceneParseError(message);
}

function formatZod(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "场景无法解析";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

function signedArea(polygon: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  if (Math.abs(orient(a, b, p)) > 1e-8) return false;
  const minX = Math.min(a.x, b.x) - 1e-8;
  const maxX = Math.max(a.x, b.x) + 1e-8;
  const minY = Math.min(a.y, b.y) - 1e-8;
  const maxY = Math.max(a.y, b.y) + 1e-8;
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const sign = (value: number) => (Math.abs(value) <= 1e-8 ? 0 : Math.sign(value));
  const s1 = sign(orient(a, b, c));
  const s2 = sign(orient(a, b, d));
  const s3 = sign(orient(c, d, a));
  const s4 = sign(orient(c, d, b));
  if (s1 !== s2 && s3 !== s4) return true;
  if (s1 === 0 && pointOnSegment(a, b, c)) return true;
  if (s2 === 0 && pointOnSegment(a, b, d)) return true;
  if (s3 === 0 && pointOnSegment(c, d, a)) return true;
  if (s4 === 0 && pointOnSegment(c, d, b)) return true;
  return false;
}

function isSelfIntersecting(polygon: Vec2[]): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      const c = polygon[j];
      const d = polygon[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (pointOnSegment(a, b, point)) return true;
  }
  let inside = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const crosses = (a.y > point.y) !== (b.y > point.y);
    if (!crosses) continue;
    const xAtY = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < xAtY) inside = !inside;
  }
  return inside;
}

function wallLength(wall: Wall): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
}

function assertUnique(ids: string[], message: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(`${message}: ${id}`);
    seen.add(id);
  }
}

function cabinetCapacity(slot: Slot) {
  return {
    volumeM3: Math.round(slot.width * slot.depth * slot.height * 0.62 * 1000) / 1000,
    shelves: Math.max(1, Math.floor(slot.height / 0.4) - 1),
  };
}

function validatePolygons(level: Level) {
  for (const room of level.rooms) {
    if (room.polygon.length < 3) {
      fail(`房间 ${room.id} 的多边形少于 3 个点`);
    }
    const area = signedArea(room.polygon);
    if (area < 0) fail(`房间 ${room.id} 的多边形是顺时针`);
    if (isSelfIntersecting(room.polygon)) fail(`房间 ${room.id} 的多边形自交`);
    if (Math.abs(area) <= 1) fail(`房间 ${room.id} 的多边形鞋带面积绝对值不大于 1`);
  }
}

function validateIds(scene: Scene) {
  const levelIds = new Set<string>();
  for (const level of scene.levels) {
    assertUnique(
      level.rooms.map((room) => room.id),
      `楼层 ${level.id} 的房间 id 重复`,
    );
    assertUnique(
      level.walls.map((wall) => wall.id),
      `楼层 ${level.id} 的墙 id 重复`,
    );
    assertUnique(
      level.openings.map((opening) => opening.id),
      `楼层 ${level.id} 的门窗 id 重复`,
    );
    assertUnique(
      level.slots.map((slot) => slot.id),
      `楼层 ${level.id} 的槽位 id 重复`,
    );
    if (levelIds.has(level.id)) fail(`楼层 id 重复: ${level.id}`);
    levelIds.add(level.id);
  }
}

function validateOpenings(level: Level) {
  for (const opening of level.openings) {
    const wall = level.walls.find((item) => item.id === opening.wallId);
    if (!wall) fail(`门窗 ${opening.id} 的 wallId 不存在`);
    if (opening.offset < 0) fail(`门窗 ${opening.id} 的 offset 小于 0`);
    const length = wallLength(wall);
    if (opening.offset + opening.width > length + 1e-6) {
      fail(`门窗 ${opening.id} 的 offset + width 大于墙长加 1e-6`);
    }
  }
}

function validateWallLengths(level: Level) {
  for (const wall of level.walls) {
    if (wallLength(wall) < 1e-6) fail(`墙 ${wall.id} 的长度小于 1e-6`);
  }
}

function validateSlots(level: Level) {
  for (const slot of level.slots) {
    const room = level.rooms.find((item) => item.id === slot.roomId);
    if (!room) fail(`槽位 ${slot.id} 的 roomId 不存在`);
    if (!pointInPolygon({ x: slot.x, y: slot.y }, room.polygon)) {
      fail(`槽位 ${slot.id} 的中心不在房间多边形内`);
    }
  }
}

function validateMaterials(scene: Scene) {
  const materialIds = new Set(scene.materials.map((material) => material.id));
  for (const level of scene.levels) {
    for (const room of level.rooms) {
      if (!materialIds.has(room.floorMaterialId) || !materialIds.has(room.wallMaterialId)) {
        const missing = !materialIds.has(room.floorMaterialId)
          ? room.floorMaterialId
          : room.wallMaterialId;
        fail(`房间 ${room.id} 引用的材质 ${missing} 不在 scene.materials 中`);
      }
    }
  }
  const seen = new Set<string>();
  for (const material of scene.materials) {
    if (seen.has(material.id)) fail(`材质 id 重复: ${material.id}`);
    seen.add(material.id);
    if (!/^#[0-9A-Fa-f]{6}$/.test(material.color)) {
      fail(`材质 ${material.id} 的颜色不是 # 加 6 位十六进制`);
    }
  }
}

function validateCapacity(level: Level) {
  for (const slot of level.slots) {
    if (slot.kind === "cabinet") {
      if (!slot.capacity) fail(`柜体槽位 ${slot.id} 缺少 capacity`);
      const expected = cabinetCapacity(slot);
      if (
        slot.capacity.volumeM3 !== expected.volumeM3 ||
        slot.capacity.shelves !== expected.shelves
      ) {
        fail(`柜体槽位 ${slot.id} 的容积或层数与公式不一致`);
      }
    } else if (slot.capacity !== undefined) {
      fail(`家具槽位 ${slot.id} 不能带 capacity`);
    }
  }
}

function validateOpeningHeight(level: Level, opening: Opening) {
  if (opening.sill + opening.height > level.ceilingHeight) {
    fail(`门窗 ${opening.id} 的 sill + height 大于所在楼层的 ceilingHeight`);
  }
}

function validateScene(scene: Scene) {
  if (scene.levels.length === 0) fail("没有楼层");
  for (const level of scene.levels) validatePolygons(level);
  validateIds(scene);
  for (const level of scene.levels) validateOpenings(level);
  for (const level of scene.levels) validateWallLengths(level);
  for (const level of scene.levels) validateSlots(level);
  validateMaterials(scene);
  for (const level of scene.levels) validateCapacity(level);
  const { scale } = scene;
  if (
    scale.confirmed &&
    (scale.method === "user_edge" || scale.method === "dimension_label") &&
    !(typeof scale.metersPerPixel === "number" && scale.metersPerPixel > 0)
  ) {
    fail("scale 已确认但没有大于 0 的 metersPerPixel");
  }
  for (const level of scene.levels) {
    if (level.ceilingHeight < 2.2 || level.ceilingHeight > 4) {
      fail(`楼层 ${level.id} 的 ceilingHeight 不在 2.2 到 4.0 之间`);
    }
  }
  for (const level of scene.levels) {
    for (const opening of level.openings) validateOpeningHeight(level, opening);
  }
}

export function parseScene(input: unknown): Scene {
  const parsed = sceneSchema.safeParse(input);
  if (!parsed.success) fail(formatZod(parsed.error));
  validateScene(parsed.data);
  return structuredClone(input) as Scene;
}
