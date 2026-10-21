import { getItem } from "@jujia/catalog";
import type { Room, Scene, Slot } from "@jujia/scene";
import {
  CLUTTER_CATEGORIES,
  type ClutterCategory,
  type ClutterItem,
  type HostReport,
  type Placement,
  type SuggestResult,
  type UnplacedItem,
} from "./types";

type HostKind = "cabinet" | "nightstand" | "desk" | "shelf";

/**
 * 越靠前越优先。洗漱和厨具还要再按房间用途拦住，
 * 避免卫生间的东西因为「柜」这个类型跑进卧室衣柜。
 */
const PREFERENCE: Record<ClutterCategory, HostKind[]> = {
  clothes: ["cabinet"],
  bedding: ["cabinet"],
  shoes: ["cabinet"],
  books: ["shelf", "desk"],
  documents: ["desk", "shelf"],
  toys: ["shelf"],
  daily: ["nightstand", "shelf", "cabinet"],
  toiletries: ["cabinet", "nightstand"],
  kitchen: ["cabinet"],
};

const CATEGORY_SET = new Set<string>(CLUTTER_CATEGORIES);

interface Layer {
  /** 剩余容积，单位是毫升，避免 0.001 立方米在多次加减后漂掉。 */
  remaining: number;
  reserved: boolean;
  used: boolean;
  itemIds: string[];
}

interface Host {
  slotId: string;
  roomId: string;
  roomName: string;
  room: Room;
  hostName: string;
  kind: HostKind;
  layers: Layer[];
}

export function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function toMilli(value: number) {
  return Math.round(round3(value) * 1000);
}

/** 整毫升均分。余数从底层开始，每层多 1 毫升。 */
function splitMilli(total: number, shelves: number) {
  const base = Math.floor(total / shelves);
  let remainder = total - base * shelves;
  return Array.from({ length: shelves }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

function classify(slot: Slot, blob: string, category: string | undefined): HostKind | null {
  if (slot.kind === "cabinet") return "cabinet";
  const lower = blob.toLowerCase();
  if (lower.includes("nightstand") || blob.includes("床头柜")) return "nightstand";
  if (lower.includes("desk") || blob.includes("书桌")) return "desk";
  if (category === "storage" || lower.includes("shelf") || blob.includes("书架") || blob.includes("层架")) return "shelf";
  return null;
}

function layersFor(slot: Slot, kind: HostKind): Layer[] | null {
  // 柜体只信场景里写好的 capacity。改宽深高却不改 capacity 时，以 capacity 为准。
  if (kind === "cabinet") {
    const capacity = slot.capacity;
    if (!capacity || !Number.isFinite(capacity.volumeM3) || capacity.volumeM3 <= 0) return null;
    const shelves = Math.floor(capacity.shelves);
    if (!Number.isFinite(shelves) || shelves < 1) return null;
    return splitMilli(toMilli(capacity.volumeM3), shelves).map((remaining) => ({
      remaining,
      reserved: false,
      used: false,
      itemIds: [],
    }));
  }
  const factor = kind === "shelf" ? 0.62 : kind === "desk" ? 0.25 : 0.35;
  const volume = round3(slot.width * slot.depth * slot.height * factor);
  if (volume <= 0) return null;
  const shelves = Math.max(1, Math.floor(slot.height / 0.4) - 1);
  return splitMilli(toMilli(volume), shelves).map((remaining) => ({
    remaining,
    reserved: false,
    used: false,
    itemIds: [],
  }));
}

function hostsIn(scene: Scene): Host[] {
  const hosts: Host[] = [];
  for (const level of scene.levels) {
    for (const slot of level.slots) {
      const room = level.rooms.find((item) => item.id === slot.roomId);
      if (!room) continue;
      const catalogItem = slot.catalogItemId ? getItem(slot.catalogItemId) : undefined;
      const hostName = catalogItem?.name ?? slot.catalogItemId ?? slot.id;
      const blob = `${slot.id} ${slot.catalogItemId ?? ""} ${hostName}`;
      const kind = classify(slot, blob, catalogItem?.category);
      if (!kind) continue;
      const layers = layersFor(slot, kind);
      if (!layers || layers.length === 0) continue;
      hosts.push({
        slotId: slot.id,
        roomId: room.id,
        roomName: room.name,
        room,
        hostName,
        kind,
        layers,
      });
    }
  }
  return hosts;
}

function isMaster(room: Room) {
  return room.usage === "bedroom" && (room.id.includes("master") || room.name.includes("主卧"));
}

function score(item: ClutterItem, host: Host, preferenceIndex: number) {
  let value = 100 - preferenceIndex * 15;
  const clothesLike = item.category === "clothes" || item.category === "bedding" || item.category === "shoes";
  if (clothesLike && isMaster(host.room)) value += 30;
  else if (clothesLike && host.room.usage === "bedroom") value += 20;
  if (item.category === "books" && host.room.usage === "living") value += 20;
  if (item.category === "documents" && host.room.id.includes("second")) value += 20;
  if (item.category === "toys") {
    if (host.room.id.includes("second")) value += 25;
    else if (host.room.usage === "living") value += 10;
  }
  if (item.category === "daily" && host.room.usage === "bedroom") value += 15;
  if (item.category === "toiletries" && host.room.usage === "bath") value += 40;
  if (item.category === "kitchen" && host.room.usage === "kitchen") value += 40;
  return value;
}

function allowed(item: ClutterItem, host: Host) {
  const preferenceIndex = PREFERENCE[item.category].indexOf(host.kind);
  if (preferenceIndex < 0) return false;
  if (item.category === "toiletries" && host.room.usage !== "bath") return false;
  if (item.category === "kitchen" && host.room.usage !== "kitchen") return false;
  return true;
}

function ranked(item: ClutterItem, hosts: Host[]) {
  return hosts
    .filter((host) => allowed(item, host))
    .map((host) => {
      const preferenceIndex = PREFERENCE[item.category].indexOf(host.kind);
      return { host, score: score(item, host, preferenceIndex) };
    })
    .sort((left, right) => right.score - left.score || (left.host.slotId < right.host.slotId ? -1 : 1));
}

/** 先找 1 层，再找连续多层。鞋子只能落在已经预留、还没被自己占掉的层上。 */
function findSpan(layers: Layer[], need: number, reserved: boolean) {
  for (let count = 1; count <= layers.length; count += 1) {
    for (let start = 0; start + count <= layers.length; start += 1) {
      const span = layers.slice(start, start + count);
      const blocked = reserved
        ? span.some((layer) => !layer.reserved || layer.used)
        : span.some((layer) => layer.reserved || layer.used);
      if (blocked) continue;
      const sum = span.reduce((total, layer) => total + layer.remaining, 0);
      if (sum >= need) return { start, count };
    }
  }
  return null;
}

function consume(layers: Layer[], start: number, count: number, need: number, itemId: string) {
  let left = need;
  for (let index = start; index < start + count; index += 1) {
    const take = Math.min(layers[index].remaining, left);
    layers[index].remaining -= take;
    left -= take;
    layers[index].itemIds.push(itemId);
  }
}

/**
 * 鞋子只预留得分最高的那一个柜，从底层往上留到够为止。
 * 这个柜装不下，也不改去更大的柜。
 */
function reserveShoes(host: Host, need: number) {
  let sum = 0;
  let count = 0;
  for (const layer of host.layers) {
    sum += layer.remaining;
    count += 1;
    if (sum >= need) {
      for (let index = 0; index < count; index += 1) host.layers[index].reserved = true;
      return true;
    }
  }
  return false;
}

function placementReason(host: Host, shelf: number, shelfCount: number) {
  if (shelfCount === 1) return `放在${host.roomName}的${host.hostName}，第 ${shelf} 层`;
  return `放在${host.roomName}的${host.hostName}，第 ${shelf} 层起共 ${shelfCount} 层`;
}

function unplacedReason(item: ClutterItem, hosts: Host[]): string {
  const qualified = hosts.some((host) => allowed(item, host));
  if (item.category === "toiletries" && !qualified) return "卫生间还没有柜或层架，不塞进卧室";
  if (item.category === "kitchen" && !qualified) return "这套房没有厨房柜";
  return "合适的位置已经满了";
}

function invalidList(items: readonly ClutterItem[]) {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || item.id.trim() === "") return true;
    if (seen.has(item.id)) return true;
    seen.add(item.id);
    if (typeof item.name !== "string" || item.name.trim() === "") return true;
    if (typeof item.category !== "string" || !CATEGORY_SET.has(item.category)) return true;
    if (typeof item.volumeM3 !== "number" || !Number.isFinite(item.volumeM3) || item.volumeM3 <= 0) return true;
  }
  return false;
}

function report(host: Host): HostReport {
  const remaining = host.layers.reduce((total, layer) => total + layer.remaining, 0);
  return {
    slotId: host.slotId,
    roomId: host.roomId,
    roomName: host.roomName,
    hostName: host.hostName,
    kind: host.kind,
    shelfCount: host.layers.length,
    remainingM3: round3(remaining / 1000),
    layers: host.layers.map((layer, index) => ({
      shelf: index + 1,
      remainingM3: round3(layer.remaining / 1000),
      itemIds: [...layer.itemIds],
    })),
  };
}

export function suggestPlacements(scene: Scene, items: readonly ClutterItem[]): SuggestResult {
  if (scene.status === "draft") {
    return { ok: false, code: "not_confirmed", message: "平面还没确认，先不定杂物放哪。" };
  }
  if (!scene.scale.confirmed) {
    return { ok: false, code: "not_confirmed", message: "比例还没确认，先不定杂物放哪。" };
  }
  if (invalidList(items)) {
    return { ok: false, code: "invalid_item", message: "杂物清单不合法。" };
  }

  const hosts = hostsIn(scene);
  if (items.length === 0) return { ok: true, placements: [], unplaced: [], hosts: hosts.map(report) };

  const shoes = items.filter((item) => item.category === "shoes");
  if (shoes.length > 0) {
    const probe = shoes[0];
    const cabinet = ranked(probe, hosts).find((entry) => entry.host.kind === "cabinet")?.host;
    const need = shoes.reduce((total, item) => total + toMilli(item.volumeM3), 0);
    if (cabinet) reserveShoes(cabinet, need);
  }

  const ordered = [...items].sort((left, right) => {
    if (right.volumeM3 !== left.volumeM3) return right.volumeM3 - left.volumeM3;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  const placements: Placement[] = [];
  const unplaced: UnplacedItem[] = [];
  for (const item of ordered) {
    const need = toMilli(item.volumeM3);
    const choices = ranked(item, hosts);
    let placed = false;
    for (const { host } of choices) {
      if (item.category === "shoes" && !host.layers.some((layer) => layer.reserved)) continue;
      const span = findSpan(host.layers, need, item.category === "shoes");
      if (!span) continue;
      if (item.category === "shoes") consume(host.layers, span.start, span.count, need, item.id);
      else {
        for (let index = span.start; index < span.start + span.count; index += 1) {
          host.layers[index].used = true;
          host.layers[index].remaining = 0;
          host.layers[index].itemIds.push(item.id);
        }
      }
      const shelf = span.start + 1;
      placements.push({
        itemId: item.id,
        slotId: host.slotId,
        roomId: host.roomId,
        roomName: host.roomName,
        hostName: host.hostName,
        shelf,
        shelfCount: span.count,
        reason: placementReason(host, shelf, span.count),
      });
      placed = true;
      break;
    }
    if (!placed) unplaced.push({ itemId: item.id, reason: unplacedReason(item, hosts) });
  }

  return { ok: true, placements, unplaced, hosts: hosts.map(report) };
}
