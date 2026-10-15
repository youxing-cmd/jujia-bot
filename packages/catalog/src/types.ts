export type CatalogMaterialCategory = "floor" | "wall" | "ceiling" | "cabinet" | "opening";
export type CatalogItemCategory = "sofa" | "cabinet" | "table" | "chair" | "bed" | "storage";
export type OpeningKind = "door" | "window";

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
  model: { kind: "procedural"; shape: "sofa" | "box" | "bed" } | { kind: "gltf"; url: string };
}

export interface OpeningStyle {
  id: string;
  name: string;
  kind: OpeningKind;
  color: string;
}

export interface Catalog {
  materials: CatalogMaterial[];
  items: CatalogItem[];
  openingStyles: OpeningStyle[];
}
