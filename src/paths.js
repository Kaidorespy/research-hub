import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const defaultConfigPath = path.join(projectRoot, "config", "hub.config.json");

export function resolveFromRoot(...parts) {
  return path.resolve(projectRoot, ...parts);
}
