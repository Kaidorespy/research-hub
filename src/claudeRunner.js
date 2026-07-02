import { spawn } from "node:child_process";

export class ClaudeRunner {
  constructor(config, log = () => {}) {
    this.config = config;
    this.log = log;
  }

  async callAgent(agentId, prompt, options = {}) {
    const agent = this.config.agents[agentId];
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    const model = this.config.models[agent.model];
    if (!model) throw new Error(`Unknown model config: ${agent.model}`);

    if (options.dryRun || this.config.app.dryRun) {
      this.log(`dry-run: ${agentId} would call ${model.model}`);
      return dryRunResponse(agentId, prompt);
    }

    if (options.signal?.aborted) {
      throw new Error(`${agentId} was cancelled before it started.`);
    }

    const args = [
      "--print",
      "--model",
      model.model,
      "--system-prompt",
      agent.systemPrompt,
      "--input-format",
      "text",
      "--output-format",
      "text"
    ];

    const effort = options.effort ?? model.effort;
    if (effort) args.push("--effort", effort);
    for (const flag of model.flags || []) {
      if (!args.includes(flag)) args.push(flag);
    }

    this.log(`${agentId}: claude --model ${model.model}`);

    return new Promise((resolve, reject) => {
      let settled = false;
      const child = spawn(this.config.app.claudeCommand || "claude", args, {
        cwd: options.cwd || process.cwd(),
        shell: process.platform === "win32",
        windowsHide: true,
        env: { ...process.env }
      });

      let stdout = "";
      let stderr = "";

      const abort = () => {
        if (settled) return;
        settled = true;
        killProcessTree(child.pid);
        reject(new Error(`${agentId} was cancelled.`));
      };

      options.signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        reject(error);
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        if (code === 0) {
          resolve(stdout.trim());
          return;
        }
        reject(new Error(`${agentId} failed with exit ${code}: ${stderr || stdout}`));
      });
      child.stdin.end(prompt);
    });
  }
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    killer.on("error", () => {});
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already exited.
  }
}

function dryRunResponse(agentId) {
  if (agentId === "clarifier") {
    return JSON.stringify({
      needsClarification: true,
      questions: [
        "What outcome should this research support?",
        "Is this for practical decision-making, creative inspiration, or academic understanding?"
      ],
      assumedAnswers: [
        "Produce a useful research dossier.",
        "Balance practical use and conceptual depth."
      ],
      refinedTopic: "Dry-run research topic with assumed clarifications."
    }, null, 2);
  }

  if (agentId === "dean") {
    return JSON.stringify({
      researchTitle: "Dry-Run Research Dossier",
      fields: [
        {
          id: "field-1",
          name: "Core Concepts",
          rationale: "Establishes shared vocabulary.",
          subfields: ["definitions", "history"],
          keyQuestions: ["What matters most?", "What is contested?"],
          expectedDeliverable: "A concise field report."
        },
        {
          id: "field-2",
          name: "Practical Applications",
          rationale: "Connects theory to use.",
          subfields: ["methods", "examples"],
          keyQuestions: ["What works?", "What fails?"],
          expectedDeliverable: "A practice-oriented field report."
        }
      ]
    }, null, 2);
  }

  if (agentId === "researcher") {
    return JSON.stringify({
      fieldId: "field-1",
      fieldName: "Dry-Run Field",
      executiveFindings: ["Useful finding one", "Useful finding two"],
      fieldReportMarkdown: "# Field Report\n\nDry-run field findings.",
      suggestedInspectors: [
        { id: "inspect-1", question: "Probe one narrow uncertainty.", reason: "It affects confidence." }
      ],
      uncertainty: ["Dry-run uncertainty"],
      bibliographyLeads: ["Search primary sources if needed."]
    }, null, 2);
  }

  if (agentId === "inspector") {
    return JSON.stringify({
      inspectorId: "inspect-1",
      question: "Dry-run narrow question",
      findingsMarkdown: "# Inspector Findings\n\nNarrow dry-run findings.",
      implications: ["Implication one"],
      confidence: "medium"
    }, null, 2);
  }

  if (agentId === "synthesizer") {
    return JSON.stringify({
      title: "Dry-Run Research Dossier",
      executiveBriefMarkdown: "# Executive Brief\n\nDry-run synthesis.",
      encyclopediaMarkdown: "# Encyclopedia\n\nComprehensive dry-run collection.",
      openQuestionsMarkdown: "# Open Questions\n\n- What needs live source verification?",
      practicalNextStepsMarkdown: "# Practical Next Steps\n\n1. Pick a direction.\n2. Verify sources.",
      sourceStrategyMarkdown: "# Source Strategy\n\nUse primary sources and recent references where needed."
    }, null, 2);
  }

  return "{}";
}
