import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig, outputRootFor } from "./config.js";

const config = await loadConfig();
const root = outputRootFor(config);
const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
const rows = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const dir = path.join(root, entry.name);
  const summary = await classifyRun(entry.name, dir);
  rows.push(summary);
  await fs.writeFile(path.join(dir, "RUN_STATUS.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(dir, "RUN_SUMMARY.md"), summaryMarkdown(summary), "utf8");
}

rows.sort((a, b) => b.lastWrite.localeCompare(a.lastWrite));
console.table(rows.map((row) => ({
  run: row.runId,
  status: row.status,
  stage: row.stage,
  fields: row.fields
})));

async function classifyRun(runId, dir) {
  const names = new Set((await fs.readdir(dir).catch(() => [])).map(String));
  const stats = await fs.stat(dir);
  let status = "partial";
  let stage = "started only";

  if (names.has("05-final.json")) {
    status = "complete";
    stage = "complete";
  } else if ([...names].some((name) => name.startsWith("inspection-"))) {
    status = "failed";
    stage = "after inspector";
  } else if ([...names].some((name) => name.startsWith("field-"))) {
    status = "failed";
    stage = "after researcher";
  } else if (names.has("02-field-plan.json")) {
    status = "failed";
    stage = "after dean";
  } else if (names.has("01-clarification.json")) {
    status = "failed";
    stage = "after clarifier";
  }

  const fields = [...names].filter((name) => /^field-.*\.md$/.test(name)).length;
  return {
    runId,
    status,
    stage,
    outputDir: dir,
    lastWrite: stats.mtime.toISOString(),
    fields
  };
}

function summaryMarkdown(summary) {
  const start = summary.status === "complete"
    ? "Start with `README.md`, then read `encyclopedia.md` and `practical_next_steps.md`."
    : "This run did not finish. Inspect raw-*.txt and stage JSON/markdown files.";
  return `# Run ${summary.status.toUpperCase()}

Run: ${summary.runId}

Stage: ${summary.stage}

${start}

Useful files:

- README.md: executive brief, when present
- encyclopedia.md: full synthesis, when present
- field-*.md: field reports
- inspection-*.md: subfield inspection reports
- source_strategy.md: source verification plan
- raw-*.txt: raw model outputs for debugging
`;
}
