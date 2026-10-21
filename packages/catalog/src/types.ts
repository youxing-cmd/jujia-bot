export type CatalogMaterialCategory = "floor" | "wall" | "ceiling" | "cabinet" | "opening";
export type CatalogItemCategory = "sofa" | "cabinet" | "table" | "chair" | "bed" | "storage";
export type OpeningKind = "door" | "window";
export type ModelAxis = "x" | "y" | "z";

export interface GltfModel {
  kind: "gltf";
  url: string;
  /** Which model axis becomes width (local X), height (local Y) and depth (local Z). */
  axes?: { width: ModelAxis; height: ModelAxis; depth: ModelAxis };
  /** contain keeps proportions inside the box. fill matches width and height; depth follows height. */
  fit?: "contain" | "fill";
  /** Extra yaw in degrees after the axis alignment, around the fitted center. */
  yaw?: number;
}

export type CatalogModel =
  | { kind: "procedural"; shape: "sofa" | "box" | "bed" }
  | GltfModel;

export interface CatalogMaterial {
  id: string;
  name: string;
  category: CatalogMaterialCategory;
  color: string;
  roughness: number;
  metalness: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogItemCategory;
  width: number;
  depth: number;
  height: number;
  color: string;
  model: CatalogModel;
}

export interface OpeningStyle {
  id: string;
  name: string;
  kind: OpeningKind;
  color: string;
  model?: GltfModel;
}

export interface Catalog {
  materials: CatalogMaterial[];
  items: CatalogItem[];
  openingStyles: OpeningStyle[];
}
