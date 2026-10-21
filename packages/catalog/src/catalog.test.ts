import { describe, expect, it } from "vitest";
import { getItem, getMaterial, getOpeningStyle, listItems, listMaterials, listOpeningStyles } from "./index";

describe("catalog", () => {
  it("exposes the locked ids", () => {
    expect(listMaterials().map((item) => item.id)).toEqual([
      "floor_oak",
      "floor_tile",
      "wall_white",
      "wall_warm",
    ]);
    expect(listItems().map((item) => item.id)).toEqual([
      "sofa_210",
      "sofa_160",
      "table_coffee",
      "table_tea",
      "table_side",
      "shelf_wall",
      "bed_gothic",
      "table_nightstand",
      "bed_day",
      "desk_school",
      "cabinet_120",
    ]);
    expect(listOpeningStyles().map((item) => item.id)).toEqual([
      "door_flat",
      "door_glass",
      "window_sliding",
      "window_casement",
    ]);
  });

  it("returns undefined for unknown ids", () => {
    expect(getMaterial("missing")).toBeUndefined();
    expect(getItem("missing")).toBeUndefined();
    expect(getOpeningStyle("missing")).toBeUndefined();
  });

  it("keeps the two-seat sofa smaller than the three-seat sofa", () => {
    const large = getItem("sofa_210");
    const small = getItem("sofa_160");
    expect(large).toBeDefined();
    expect(small).toBeDefined();
    expect(small?.width).toBeLessThan(large?.width ?? 0);
  });
});
