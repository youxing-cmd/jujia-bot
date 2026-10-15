import type { Vec2 } from "@jujia/scene";

export type PreviewRole = "floor" | "wall" | "door" | "window" | "furniture" | "cabinet";

export interface PreviewMesh {
  id: string;
  role: PreviewRole;
  polygon?: Vec2[];
  position: { x: number; y: number; z: number };
  rotationY: number;
  size: { x: number; y: number; z: number };
  color: string;
  roughness: number;
  metalness: number;
  roomId?: string;
  slotId?: string;
  openingId?: string;
}

export interface PreviewModel {
  ceilingHeight: number;
  meshes: PreviewMesh[];
}
