import type { Scene } from "./types";
import { SceneParseError } from "./types";

export function parseScene(_input: unknown): Scene {
  throw new SceneParseError("NOT_IMPLEMENTED: parseScene");
}
