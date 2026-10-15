export type Vec2 = { x: number; y: number };

export type SceneStatus = "draft" | "plan_confirmed" | "frozen";
export type ScaleMethod = "authored_meters" | "user_edge" | "dimension_label";
export type MaterialCategory = "floor" | "wall" | "ceiling" | "cabinet" | "opening";
export type OpeningKind = "door" | "window";
export type RoomUsage =
  | "living"
  | "dining"
  | "bedroom"
  | "kitchen"
  | "bath"
  | "balcony"
  | "corridor"
  | "other";
export type SlotKind = "furniture" | "cabinet";

export interface SceneScale {
  method: ScaleMethod;
  confirmed: boolean;
  metersPerPixel?: number;
  reference?: {
    edgeId?: string;
    label?: string;
    lengthM?: number;
  };
}

export interface SceneMaterial {
  id: string;
  name: string;
  category: MaterialCategory;
  color: string;
  roughness: number;
  metalness: number;
}

export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  thickness: number;
  height?: number;
}

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  offset: number;
  width: number;
  height: number;
  sill: number;
  styleId?: string;
}

export interface Room {
  id: string;
  name: string;
  usage: RoomUsage;
  polygon: Vec2[];
  floorMaterialId: string;
  wallMaterialId: string;
}

export interface SlotCapacity {
  volumeM3: number;
  shelves: number;
}

export interface Slot {
  id: string;
  roomId: string;
  kind: SlotKind;
  x: number;
  y: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;
  maxWidth: number;
  maxDepth: number;
  maxHeight: number;
  catalogItemId?: string;
  capacity?: SlotCapacity;
}

export interface Level {
  id: string;
  elevation: number;
  ceilingHeight: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  slots: Slot[];
}

export interface Scene {
  version: "1.0.0";
  id: string;
  name: string;
  units: "m";
  status: SceneStatus;
  scale: SceneScale;
  source: {
    kind: "authored" | "upload";
    fileName?: string;
  };
  materials: SceneMaterial[];
  levels: Level[];
}

export class SceneParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SceneParseError";
  }
}
