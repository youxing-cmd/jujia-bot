/** 侧栏的初始 11 件。改清单只影响建议，不写回场景。 */
import type { ClutterItem } from "./types";

export const demoClutter: ClutterItem[] = [
  { id: "winter_coats", name: "冬衣", category: "clothes", volumeM3: 0.18 },
  { id: "shirts", name: "衬衫", category: "clothes", volumeM3: 0.12 },
  { id: "quilt", name: "被子", category: "bedding", volumeM3: 0.2 },
  { id: "shoes", name: "鞋子", category: "shoes", volumeM3: 0.08 },
  { id: "novels", name: "小说", category: "books", volumeM3: 0.06 },
  { id: "magazines", name: "杂志", category: "books", volumeM3: 0.03 },
  { id: "tax_docs", name: "税单", category: "documents", volumeM3: 0.02 },
  { id: "blocks", name: "积木", category: "toys", volumeM3: 0.05 },
  { id: "charger", name: "充电器", category: "daily", volumeM3: 0.01 },
  { id: "toiletries", name: "洗漱用品", category: "toiletries", volumeM3: 0.02 },
  { id: "pans", name: "锅具", category: "kitchen", volumeM3: 0.08 },
];
