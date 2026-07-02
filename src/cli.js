#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { runResearchHub } from "./hub.js";

const command = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (command !== "run") {
  console.log("Usage: node src/cli.js run [--dry-run] [topic...]");
  process.exit(command ? 1 : 0);
}

const topicArgs = process.argv.filter((arg, index) => index > 2 && arg !== "--dry-run");
const topic = topicArgs.join(" ") || "Dry-run topic: how to research a complex subject effectively.";

try {
  const config = await loadConfig();
  const result = await runResearchHub(config, {
    topic,
    context: "",
    depth: config.settings.depth,
    askClarifyingQuestions: config.settings.askClarifyingQuestions
  }, {
    dryRun,
    log: (line) => console.log(`[hub] ${line}`)
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
