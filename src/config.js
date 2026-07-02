import fs from "node:fs/promises";
import path from "node:path";
import { defaultConfigPath, projectRoot } from "./paths.js";

export async function loadConfig(configPath = defaultConfigPath) {
  const raw = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(raw);
  validateConfig(config);
  return config;
}

export async function saveConfig(config, configPath = defaultConfigPath) {
  validateConfig(config);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function validateConfig(config) {
  for (const key of ["app", "models", "settings", "agents"]) {
    if (!config[key] || typeof config[key] !== "object") {
      throw new Error(`Config is missing object: ${key}`);
    }
  }

  for (const [id, agent] of Object.entries(config.agents)) {
    if (!agent.model || !config.models[agent.model]) {
      throw new Error(`Agent "${id}" references unknown model "${agent.model}"`);
    }
    if (!agent.systemPrompt) {
      throw new Error(`Agent "${id}" needs a systemPrompt`);
    }
  }
}

export function outputRootFor(config) {
  return path.resolve(projectRoot, config.app.outputRoot || "runs");
}
