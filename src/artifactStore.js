import fs from "node:fs/promises";
import path from "node:path";
import { outputRootFor } from "./config.js";

export class ArtifactStore {
  constructor(config) {
    this.runId = new Date().toISOString().replace(/[:.]/g, "-");
    this.dir = path.join(outputRootFor(config), this.runId);
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    return this;
  }

  async writeJson(name, data) {
    await fs.writeFile(path.join(this.dir, name), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async writeText(name, text) {
    await fs.writeFile(path.join(this.dir, name), `${String(text || "").trim()}\n`, "utf8");
  }

  async writeStatus(status) {
    await this.writeJson("RUN_STATUS.json", {
      runId: this.runId,
      updatedAt: new Date().toISOString(),
      ...status
    });
  }
}
