import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { projectRoot } from "./paths.js";

const srcDir = path.join(projectRoot, "src");
const files = (await fs.readdir(srcDir))
  .filter((file) => file.endsWith(".js"))
  .map((file) => path.join(srcDir, file));

for (const file of files) {
  await check(file);
}

function check(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], {
      stdio: "inherit",
      windowsHide: true
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Syntax check failed: ${file}`));
    });
  });
}
