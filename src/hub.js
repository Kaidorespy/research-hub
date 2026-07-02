import fs from "node:fs/promises";
import path from "node:path";
import { ArtifactStore } from "./artifactStore.js";
import { ClaudeRunner } from "./claudeRunner.js";
import { safeJsonParse, slugify } from "./json.js";
import {
  clarifierPrompt,
  deanPrompt,
  inspectorPrompt,
  researcherPrompt,
  synthesizerPrompt
} from "./prompts.js";

export async function runResearchHub(config, request, options = {}) {
  const log = options.log || (() => {});
  const store = await new ArtifactStore(config).init();
  const runner = new ClaudeRunner(config, log);
  const dryRun = Boolean(options.dryRun);
  const signal = options.signal;

  await store.writeStatus({ status: "running", stage: "started" });
  await store.writeJson("request.json", request);
  await store.writeJson("config.snapshot.json", config);
  await store.writeText("CLAUDE.md", runClaudeMd(config, request));

  log(`run ${store.runId}: started`);

  let clarification = {
    needsClarification: false,
    questions: [],
    assumedAnswers: [],
    refinedTopic: request.topic
  };

  if (request.askClarifyingQuestions) {
    await store.writeStatus({ status: "running", stage: "clarifier" });
    throwIfCancelled(signal);
    const raw = await runner.callAgent("clarifier", clarifierPrompt(config, request), agentOptions(store, dryRun, signal));
    await store.writeText("raw-01-clarifier.txt", raw);
    clarification = await parseStage(raw, "clarifier");
    await store.writeJson("01-clarification.json", clarification);
    await store.writeText("clarifying_questions.md", clarifyingMarkdown(clarification));
  }

  await store.writeStatus({ status: "running", stage: "dean" });
  throwIfCancelled(signal);
  const deanRaw = await runner.callAgent("dean", deanPrompt(config, request, clarification), agentOptions(store, dryRun, signal));
  await store.writeText("raw-02-dean.txt", deanRaw);
  const plan = await parseStage(deanRaw, "dean");
  await store.writeJson("02-field-plan.json", plan);
  await store.writeText("field_plan.md", fieldPlanMarkdown(plan));

  const fieldReports = [];
  for (const field of plan.fields || []) {
    await store.writeStatus({ status: "running", stage: "researcher", field: field.name });
    throwIfCancelled(signal);
    log(`researcher: ${field.name}`);
    const raw = await runner.callAgent("researcher", researcherPrompt(config, request, plan, field), agentOptions(store, dryRun, signal));
    await store.writeText(`raw-03-researcher-${slugify(field.id || field.name)}.txt`, raw);
    const report = await parseStage(raw, `researcher/${field.name}`);
    fieldReports.push(report);
    await store.writeJson(`field-${slugify(field.id || field.name)}.json`, report);
    await store.writeText(`field-${slugify(field.id || field.name)}.md`, report.fieldReportMarkdown || "");
  }

  const inspections = [];
  const inspectorsPerField = Number(config.settings.inspectorsPerField[request.depth] ?? 1);
  if (inspectorsPerField > 0) {
    for (const report of fieldReports) {
      const suggestions = (report.suggestedInspectors || []).slice(0, inspectorsPerField);
      for (const inspector of suggestions) {
        await store.writeStatus({ status: "running", stage: "inspector", field: report.fieldName, question: inspector.question });
        throwIfCancelled(signal);
        log(`inspector: ${report.fieldName} / ${inspector.question}`);
        const raw = await runner.callAgent("inspector", inspectorPrompt(config, request, report, inspector), agentOptions(store, dryRun, signal));
        const name = `${slugify(report.fieldId || report.fieldName)}-${slugify(inspector.id || inspector.question)}`;
        await store.writeText(`raw-04-inspector-${name}.txt`, raw);
        const inspection = await parseStage(raw, `inspector/${inspector.question}`);
        inspections.push({ fieldId: report.fieldId, ...inspection });
        await store.writeJson(`inspection-${name}.json`, inspection);
        await store.writeText(`inspection-${name}.md`, inspection.findingsMarkdown || "");
      }
    }
  }

  await store.writeStatus({ status: "running", stage: "synthesizer" });
  throwIfCancelled(signal);
  log("synthesizer: assembling encyclopedia");
  const synthRaw = await runner.callAgent("synthesizer", synthesizerPrompt(config, request, plan, fieldReports, inspections), agentOptions(store, dryRun, signal));
  await store.writeText("raw-05-synthesizer.txt", synthRaw);
  const finalOutput = await parseStage(synthRaw, "synthesizer");
  await store.writeJson("05-final.json", finalOutput);
  await store.writeText("README.md", finalOutput.executiveBriefMarkdown || "# Research Hub Output");
  await store.writeText("encyclopedia.md", finalOutput.encyclopediaMarkdown || "");
  await store.writeText("open_questions.md", finalOutput.openQuestionsMarkdown || "");
  await store.writeText("practical_next_steps.md", finalOutput.practicalNextStepsMarkdown || "");
  await store.writeText("source_strategy.md", finalOutput.sourceStrategyMarkdown || "");
  await store.writeText("RUN_SUMMARY.md", runSummaryMarkdown(store, finalOutput, fieldReports, inspections));
  await store.writeStatus({
    status: "complete",
    stage: "complete",
    title: finalOutput.title,
    fields: fieldReports.map((report) => report.fieldName),
    inspections: inspections.length,
    outputDir: store.dir
  });

  log(`complete: ${store.dir}`);
  return {
    runId: store.runId,
    outputDir: store.dir,
    finalOutput
  };
}

export async function writeRunFailureStatus(outputDir, error) {
  const status = {
    status: "failed",
    updatedAt: new Date().toISOString(),
    error: error.stack || error.message || String(error)
  };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "RUN_STATUS.json"), `${JSON.stringify(status, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outputDir, "RUN_SUMMARY.md"), `# Run Failed\n\n${status.error}\n`, "utf8");
}

function agentOptions(store, dryRun, signal) {
  return { dryRun, cwd: store.dir, signal };
}

async function parseStage(raw, stageName) {
  try {
    return safeJsonParse(raw);
  } catch (error) {
    throw new Error(`${stageName} returned invalid JSON. ${error.message}`);
  }
}

function throwIfCancelled(signal) {
  if (signal?.aborted) {
    throw new Error("Run was cancelled.");
  }
}

function runClaudeMd(config, request) {
  return `# Research Hub Run Context

## Topic

${request.topic}

## Depth

${request.depth}

## Extra Context

${request.context || "None"}

## Standards

${config.settings.researchStandards}
`;
}

function clarifyingMarkdown(clarification) {
  const questions = (clarification.questions || []).map((q) => `- ${q}`).join("\n") || "- None";
  const assumptions = (clarification.assumedAnswers || []).map((a) => `- ${a}`).join("\n") || "- None";
  return `# Clarification

Needs clarification: ${Boolean(clarification.needsClarification)}

## Questions

${questions}

## Assumptions Used

${assumptions}

## Refined Topic

${clarification.refinedTopic || ""}
`;
}

function fieldPlanMarkdown(plan) {
  const fields = (plan.fields || []).map((field) => `## ${field.name}

${field.rationale}

Questions:
${(field.keyQuestions || []).map((q) => `- ${q}`).join("\n")}
`).join("\n");
  return `# ${plan.researchTitle || "Research Plan"}

${fields}
`;
}

function runSummaryMarkdown(store, finalOutput, fieldReports, inspections) {
  return `# Run Complete

Run: ${store.runId}

Title: ${finalOutput.title}

Start here:

1. README.md
2. encyclopedia.md
3. practical_next_steps.md
4. source_strategy.md
5. field-*.md
6. inspection-*.md

Fields: ${fieldReports.length}

Inspections: ${inspections.length}
`;
}
