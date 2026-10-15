import { describe, expect, it } from "vitest";
import fixture from "../../../fixtures/two-bedroom.json";
import { parseScene, SceneParseError } from "./index";
import type { Scene } from "./types";

function loadScene(): Scene {
  return structuredClone(fixture) as Scene;
}

function expectReject(mutate: (scene: Scene) => void, pattern: RegExp) {
  const scene = loadScene();
  mutate(scene);
  expect(() => parseScene(scene)).toThrowError(SceneParseError);
  try {
    parseScene(scene);
    throw new Error("应该拒绝");
  } catch (error) {
    expect(error).toBeInstanceOf(SceneParseError);
    expect((error as Error).name).toBe("SceneParseError");
    expect((error as Error).message).toMatch(pattern);
  }
}

describe("parseScene", () => {
  it("解析示例场景，并且不与输入共享引用", () => {
    const input = loadScene();
    const parsed = parseScene(input);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(parsed.levels).not.toBe(input.levels);
    expect(parsed.levels[0]).not.toBe(input.levels[0]);
    expect(parsed.levels[0].rooms[0].polygon).not.toBe(input.levels[0].rooms[0].polygon);
    expect(parsed.levels[0].rooms[0].polygon[0]).not.toBe(input.levels[0].rooms[0].polygon[0]);
    expect(parsed.materials[0]).not.toBe(input.materials[0]);
    parsed.name = "改过";
    parsed.levels[0].rooms[0].name = "改过";
    expect(input.name).toBe("两室一厅示例");
    expect(input.levels[0].rooms[0].name).toBe("客厅");
  });

  it("边界上的槽位中心算在房间内", () => {
    const scene = loadScene();
    const sofa = scene.levels[0].slots[0];
    sofa.x = 0.2;
    sofa.y = 0.2;
    expect(parseScene(scene).levels[0].slots[0]).toMatchObject({ x: 0.2, y: 0.2 });
  });

  it("authored_meters 可以没有 metersPerPixel", () => {
    const scene = loadScene();
    scene.scale.method = "authored_meters";
    scene.scale.confirmed = true;
    delete scene.scale.metersPerPixel;
    expect(parseScene(scene).scale.metersPerPixel).toBeUndefined();
  });

  it("未确认的 user_edge 可以没有 metersPerPixel", () => {
    const scene = loadScene();
    scene.scale.method = "user_edge";
    scene.scale.confirmed = false;
    delete scene.scale.metersPerPixel;
    expect(parseScene(scene).scale.confirmed).toBe(false);
  });

  it("层高端点 2.2 和 4.0 允许", () => {
    const low = loadScene();
    low.levels[0].ceilingHeight = 2.2;
    for (const opening of low.levels[0].openings) {
      opening.sill = 0;
      opening.height = 2.1;
    }
    expect(parseScene(low).levels[0].ceilingHeight).toBe(2.2);

    const high = loadScene();
    high.levels[0].ceilingHeight = 4;
    expect(parseScene(high).levels[0].ceilingHeight).toBe(4);
  });

  it("拒绝 version 不是 1.0.0", () => {
    expectReject((scene) => {
      (scene as { version: string }).version = "1.0.1";
    }, /version/);
  });

  it("拒绝 units 不是 m", () => {
    expectReject((scene) => {
      (scene as { units: string }).units = "cm";
    }, /units/);
  });

  it("拒绝没有楼层", () => {
    expectReject((scene) => {
      scene.levels = [];
    }, /没有楼层/);
  });

  it("拒绝房间多边形少于 3 个点", () => {
    expectReject((scene) => {
      scene.levels[0].rooms[0].polygon = [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ];
    }, /少于 3/);
  });

  it("拒绝顺时针多边形", () => {
    expectReject((scene) => {
      scene.levels[0].rooms[0].polygon.reverse();
    }, /顺时针/);
  });

  it("拒绝自交多边形", () => {
    expectReject((scene) => {
      scene.levels[0].rooms[0].polygon = [
        { x: 0, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
        { x: 3, y: 0 },
      ];
    }, /自交/);
  });

  it("拒绝鞋带面积绝对值不大于 1", () => {
    expectReject((scene) => {
      scene.levels[0].rooms[0].polygon = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
    }, /鞋带面积/);
  });

  it("拒绝本层房间 id 重复", () => {
    expectReject((scene) => {
      scene.levels[0].rooms[1].id = scene.levels[0].rooms[0].id;
    }, /房间 id 重复/);
  });

  it("拒绝本层墙 id 重复", () => {
    expectReject((scene) => {
      scene.levels[0].walls[1].id = scene.levels[0].walls[0].id;
      for (const opening of scene.levels[0].openings) {
        if (opening.wallId === "w_ext_n") opening.wallId = "w_ext_s";
      }
    }, /墙 id 重复/);
  });

  it("拒绝本层门窗 id 重复", () => {
    expectReject((scene) => {
      scene.levels[0].openings[1].id = scene.levels[0].openings[0].id;
    }, /门窗 id 重复/);
  });

  it("拒绝本层槽位 id 重复", () => {
    expectReject((scene) => {
      scene.levels[0].slots[1].id = scene.levels[0].slots[0].id;
    }, /槽位 id 重复/);
  });

  it("拒绝楼层 id 重复", () => {
    expectReject((scene) => {
      scene.levels.push(structuredClone(scene.levels[0]));
    }, /楼层 id 重复/);
  });

  it("拒绝门窗 wallId 不存在", () => {
    expectReject((scene) => {
      scene.levels[0].openings[0].wallId = "missing_wall";
    }, /wallId 不存在/);
  });

  it("拒绝门窗 offset 小于 0", () => {
    expectReject((scene) => {
      scene.levels[0].openings[0].offset = -0.01;
    }, /offset 小于 0/);
  });

  it("拒绝门窗超出墙长", () => {
    expectReject((scene) => {
      scene.levels[0].openings[0].offset = 8;
      scene.levels[0].openings[0].width = 2;
    }, /墙长加 1e-6/);
  });

  it("拒绝墙长小于 1e-6", () => {
    expectReject((scene) => {
      const wall = scene.levels[0].walls.find((item) => item.id === "w_kitchen_bed");
      if (!wall) throw new Error("缺少墙");
      wall.b = { x: wall.a.x, y: wall.a.y };
    }, /1e-6/);
  });

  it("拒绝槽位 roomId 不存在", () => {
    expectReject((scene) => {
      scene.levels[0].slots[0].roomId = "missing_room";
    }, /roomId 不存在/);
  });

  it("拒绝槽位中心在房间外", () => {
    expectReject((scene) => {
      scene.levels[0].slots[0].x = 100;
      scene.levels[0].slots[0].y = 100;
    }, /不在房间多边形内/);
  });

  it("拒绝房间材质不在 scene.materials 中", () => {
    expectReject((scene) => {
      scene.levels[0].rooms[0].floorMaterialId = "missing_material";
    }, /scene\.materials/);
  });

  it("拒绝材质 id 重复", () => {
    expectReject((scene) => {
      scene.materials[1].id = scene.materials[0].id;
      for (const room of scene.levels[0].rooms) {
        if (room.floorMaterialId === "floor_tile") room.floorMaterialId = "floor_oak";
      }
    }, /材质 id 重复/);
  });

  it("拒绝颜色不是 # 加 6 位十六进制", () => {
    expectReject((scene) => {
      scene.materials[0].color = "#FFF";
    }, /6 位十六进制/);
  });

  it("拒绝柜体槽位缺少 capacity", () => {
    expectReject((scene) => {
      delete scene.levels[0].slots[1].capacity;
    }, /缺少 capacity/);
  });

  it("拒绝柜体容积与公式不一致", () => {
    expectReject((scene) => {
      const capacity = scene.levels[0].slots[1].capacity;
      if (!capacity) throw new Error("缺少 capacity");
      capacity.volumeM3 = 0.1;
    }, /公式不一致/);
  });

  it("拒绝柜体层数与公式不一致", () => {
    expectReject((scene) => {
      const capacity = scene.levels[0].slots[1].capacity;
      if (!capacity) throw new Error("缺少 capacity");
      capacity.shelves = 1;
    }, /公式不一致/);
  });

  it("拒绝家具槽位带 capacity", () => {
    expectReject((scene) => {
      scene.levels[0].slots[0].capacity = { volumeM3: 0.9, shelves: 4 };
    }, /不能带 capacity/);
  });

  it("拒绝已确认的 user_edge 没有大于 0 的 metersPerPixel", () => {
    expectReject((scene) => {
      scene.scale.method = "user_edge";
      scene.scale.confirmed = true;
      delete scene.scale.metersPerPixel;
    }, /metersPerPixel/);
  });

  it("拒绝已确认的 dimension_label 的 metersPerPixel 不大于 0", () => {
    expectReject((scene) => {
      scene.scale.method = "dimension_label";
      scene.scale.confirmed = true;
      scene.scale.metersPerPixel = 0;
    }, /metersPerPixel/);
  });

  it("拒绝 ceilingHeight 小于 2.2", () => {
    expectReject((scene) => {
      scene.levels[0].ceilingHeight = 2.19;
    }, /ceilingHeight/);
  });

  it("拒绝 ceilingHeight 大于 4.0", () => {
    expectReject((scene) => {
      scene.levels[0].ceilingHeight = 4.01;
    }, /ceilingHeight/);
  });

  it("拒绝门窗 sill + height 大于层高", () => {
    expectReject((scene) => {
      scene.levels[0].openings[0].sill = 1;
      scene.levels[0].openings[0].height = 2;
    }, /sill \+ height/);
  });
});
