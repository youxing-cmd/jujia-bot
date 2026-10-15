import type { Scene } from "@jujia/scene";
import type { Command, CommandResult } from "./types";

export function applyCommand(_scene: Scene, _command: Command): CommandResult {
  throw new Error("NOT_IMPLEMENTED: applyCommand");
}
