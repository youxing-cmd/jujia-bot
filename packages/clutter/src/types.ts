/** 杂物只按类别和体积归位，不识别照片，也不生成新家具。 */
export const CLUTTER_CATEGORIES = [
  "clothes",
  "bedding",
  "shoes",
  "books",
  "documents",
  "toys",
  "daily",
  "toiletries",
  "kitchen",
] as const;

export type ClutterCategory = (typeof CLUTTER_CATEGORIES)[number];

export interface ClutterItem {
  id: string;
  name: string;
  category: ClutterCategory;
  volumeM3: number;
}

/** shelf 从 1 开始，底层是第 1 层。shelfCount 是这一件连续占用的层数。 */
export interface Placement {
  itemId: string;
  slotId: string;
  roomId: string;
  roomName: string;
  hostName: string;
  shelf: number;
  shelfCount: number;
  reason: string;
}

export interface UnplacedItem {
  itemId: string;
  reason: string;
}

export interface HostLayerReport {
  shelf: number;
  remainingM3: number;
  itemIds: string[];
}

/** 只读快照。remainingM3 是各层剩余毫升再折回立方米，不是重新用尺寸估算。 */
export interface HostReport {
  slotId: string;
  roomId: string;
  roomName: string;
  hostName: string;
  kind: "cabinet" | "nightstand" | "desk" | "shelf";
  shelfCount: number;
  remainingM3: number;
  layers: HostLayerReport[];
}

export type SuggestResult =
  | { ok: true; placements: Placement[]; unplaced: UnplacedItem[]; hosts: HostReport[] }
  | { ok: false; code: "not_confirmed" | "invalid_item"; message: string };
