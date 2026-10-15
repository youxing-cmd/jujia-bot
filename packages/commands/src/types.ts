import type { Scene } from "@jujia/scene";

export interface ChangeMaterialCommand {
  type: "change_material";
  roomId: string;
  surface: "floor" | "wall";
  materialId: string;
}

export interface ChangeOpeningStyleCommand {
  type: "change_opening_style";
  openingId: string;
  styleId: string;
}

export interface ReplaceFurnitureCommand {
  type: "replace_furniture";
  slotId: string;
  catalogItemId: string;
}

export interface ResizeCabinetCommand {
  type: "resize_cabinet";
  slotId: string;
  width: number;
  depth: number;
  height: number;
}

export type Command =
  | ChangeMaterialCommand
  | ChangeOpeningStyleCommand
  | ReplaceFurnitureCommand
  | ResizeCabinetCommand;

export type CommandErrorCode =
  | "invalid_command"
  | "not_confirmed"
  | "frozen"
  | "unknown_target"
  | "unknown_material"
  | "unknown_item"
  | "unknown_style"
  | "category_mismatch"
  | "footprint_exceeds_slot"
  | "wrong_slot_kind"
  | "missing_field";

export type CommandResult =
  | { ok: true; scene: Scene }
  | { ok: false; code: CommandErrorCode; message: string };
