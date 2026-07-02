let config = null;
let activeRun = null;
let pollTimer = null;

const els = {
  status: document.querySelector("#status"),
  topic: document.querySelector("#topic"),
  context: document.querySelector("#context"),
  contextFile: document.querySelector("#contextFile"),
  clearContext: document.querySelector("#clearContext"),
  askClarifyingQuestions: document.querySelector("#askClarifyingQuestions"),
  researchStandards: document.querySelector("#researchStandards"),
  modelFields: document.querySelector("#modelFields"),
  saveButton: document.querySelector("#saveButton"),
  runButton: document.querySelector("#runButton"),
  cancelButton: document.querySelector("#cancelButton"),
  dryRun: document.querySelector("#dryRun"),
  reloadConfig: document.querySelector("#reloadConfig"),
  log: document.querySelector("#log"),
  result: document.querySelector("#result")
};

els.saveButton.addEventListener("click", saveConfigFromForm);
els.runButton.addEventListener("click", runResearch);
els.cancelButton.addEventListener("click", cancelRun);
els.reloadConfig.addEventListener("click", loadConfig);
els.clearContext.addEventListener("click", () => {
  els.context.value = "";
});
els.contextFile.addEventListener("change", appendContextFile);

loadConfig();

async function loadConfig() {
  config = await request("/api/config");
  renderConfig();
  appendLog("config loaded");
}

function renderConfig() {
  document.querySelectorAll("[name='depth']").forEach((input) => {
    input.checked = input.value === config.settings.depth;
  });
  els.askClarifyingQuestions.checked = config.settings.askClarifyingQuestions;
  els.researchStandards.value = config.settings.researchStandards;
  els.modelFields.innerHTML = "";
  for (const [id, model] of Object.entries(config.models)) {
    const row = document.createElement("label");
    row.className = "model-row";
    row.innerHTML = `<span>${escapeHtml(id)}</span><input data-model-id="${escapeHtml(id)}" value="${escapeHtml(model.model)}">`;
    els.modelFields.appendChild(row);
  }
}

async function saveConfigFromForm() {
  readSettings();
  await request("/api/config", {
    method: "POST",
    body: JSON.stringify(config)
  });
  appendLog("settings saved");
}

async function runResearch() {
  readSettings();
  await request("/api/config", {
    method: "POST",
    body: JSON.stringify(config)
  });

  const requestBody = {
    topic: els.topic.value.trim(),
    context: els.context.value.trim(),
    depth: selectedDepth(),
    askClarifyingQuestions: els.askClarifyingQuestions.checked
  };

  if (!requestBody.topic) {
    els.result.textContent = "Add a research topic first.";
    return;
  }

  els.log.textContent = "";
  els.result.textContent = "";
  setStatus("running", "Running");
  els.runButton.disabled = true;
  els.cancelButton.disabled = false;

  const started = await request("/api/run", {
    method: "POST",
    body: JSON.stringify({ dryRun: els.dryRun.checked, request: requestBody })
  });
  activeRun = started.id;
  appendLog(`run queued: ${activeRun}`);
  pollTimer = window.setInterval(pollRun, 1500);
  pollRun();
}

async function pollRun() {
  if (!activeRun) return;
  const state = await request(`/api/run/${activeRun}`);
  els.log.textContent = state.logs.map((entry) => `[${entry.at}] ${entry.line}`).join("\n");
  els.log.scrollTop = els.log.scrollHeight;

  if (state.status === "complete") {
    finishPolling();
    setStatus("complete", "Complete");
    els.result.innerHTML = `<strong>Output written:</strong><br>${escapeHtml(state.result.outputDir)}`;
  }

  if (state.status === "failed") {
    finishPolling();
    setStatus("failed", "Failed");
    els.result.textContent = state.error || "Run failed.";
  }
}

async function cancelRun() {
  if (!activeRun) return;
  await request(`/api/run/${activeRun}/cancel`, {
    method: "POST",
    body: JSON.stringify({})
  });
  appendLog("cancel requested");
  els.cancelButton.disabled = true;
}

function finishPolling() {
  window.clearInterval(pollTimer);
  pollTimer = null;
  activeRun = null;
  els.runButton.disabled = false;
  els.cancelButton.disabled = true;
}

function readSettings() {
  config.settings.depth = selectedDepth();
  config.settings.askClarifyingQuestions = els.askClarifyingQuestions.checked;
  config.settings.researchStandards = els.researchStandards.value;
  document.querySelectorAll("[data-model-id]").forEach((input) => {
    config.models[input.dataset.modelId].model = input.value.trim();
  });
}

function selectedDepth() {
  return document.querySelector("[name='depth']:checked")?.value || "medium";
}

async function appendContextFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const header = `\n\n# Context File: ${file.name}\n\n`;
  els.context.value = `${els.context.value.trim()}${header}${text.trim()}`.trim();
  event.target.value = "";
  appendLog(`context file added: ${file.name}`);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function setStatus(kind, text) {
  els.status.className = `status ${kind}`;
  els.status.textContent = text;
}

function appendLog(line) {
  const prefix = els.log.textContent ? "\n" : "";
  els.log.textContent += `${prefix}${line}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
