import catalogJson from "../../../fixtures/catalog.json" with { type: "json" };
import type { Catalog, CatalogItem, CatalogMaterial, OpeningStyle } from "./types";

export type { Catalog, CatalogItem, CatalogMaterial, OpeningStyle } from "./types";

export const catalog = catalogJson as Catalog;

export function listMaterials(): CatalogMaterial[] {
  return catalog.materials;
}

export function getMaterial(id: string): CatalogMaterial | undefined {
  return catalog.materials.find((item) => item.id === id);
}

export function listItems(): CatalogItem[] {
  return catalog.items;
}

export function getItem(id: string): CatalogItem | undefined {
  return catalog.items.find((item) => item.id === id);
}

export function listOpeningStyles(): OpeningStyle[] {
  return catalog.openingStyles;
}

export function getOpeningStyle(id: string): OpeningStyle | undefined {
  return catalog.openingStyles.find((item) => item.id === id);
}
