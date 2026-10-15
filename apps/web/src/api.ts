import { applyCommand as applyCommandPackage, type Command, type CommandResult } from "@jujia/commands";
import { buildPreviewModel as buildPreviewPackage, type PreviewModel } from "@jujia/preview-3d";
import { parseScene as parseScenePackage, type Scene } from "@jujia/scene";
import * as fallback from "./fallback";

function unimplemented(error: unknown) {
  return error instanceof Error && error.message.includes("NOT_IMPLEMENTED");
}

export function parseScene(input: unknown): Scene {
  try {
    return parseScenePackage(input);
  } catch (error) {
    if (unimplemented(error)) return fallback.parseScene(input);
    throw error;
  }
}

export function buildPreviewModel(scene: Scene): PreviewModel {
  try {
    return buildPreviewPackage(scene);
  } catch (error) {
    if (unimplemented(error)) return fallback.buildPreviewModel(scene);
    throw error;
  }
}

export function applyCommand(scene: Scene, command: Command): CommandResult {
  try {
    return applyCommandPackage(scene, command);
  } catch (error) {
    if (unimplemented(error)) return fallback.applyCommand(scene, command);
    throw error;
  }
}
