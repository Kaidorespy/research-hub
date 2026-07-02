import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig, outputRootFor, saveConfig } from "./config.js";
import { runResearchHub, writeRunFailureStatus } from "./hub.js";
import { projectRoot } from "./paths.js";

const port = Number(process.env.PORT || 5181);
const publicDir = path.join(projectRoot, "public");
const runs = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, await loadConfig());
    }

    if (req.method === "POST" && url.pathname === "/api/config") {
      const body = await readJson(req);
      await saveConfig(body);
      return sendJson(res, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/run") {
      const body = await readJson(req);
      const config = await loadConfig();
      const dryRun = Boolean(body.dryRun);
      const id = new Date().toISOString().replace(/[:.]/g, "-");
      const controller = new AbortController();
      const state = { id, status: "running", logs: [], result: null, error: null, controller };
      runs.set(id, state);

      runResearchHub(config, body.request, {
        dryRun,
        signal: controller.signal,
        log: (line) => state.logs.push({ at: new Date().toISOString(), line })
      })
        .then((result) => {
          state.status = "complete";
          state.result = result;
        })
        .catch((error) => {
          state.status = "failed";
          state.error = error.stack || error.message;
          writeRunFailureStatus(path.join(outputRootFor(config), id), error).catch(() => {});
          state.logs.push({ at: new Date().toISOString(), line: `failed: ${error.message}` });
        });

      return sendJson(res, { id });
    }

    const cancelMatch = url.pathname.match(/^\/api\/run\/([^/]+)\/cancel$/);
    if (req.method === "POST" && cancelMatch) {
      const state = runs.get(cancelMatch[1]);
      if (!state) return sendJson(res, { error: "Run not found" }, 404);
      if (state.status === "running") {
        state.logs.push({ at: new Date().toISOString(), line: "cancel requested" });
        state.controller.abort();
      }
      return sendJson(res, { ok: true });
    }

    const runMatch = url.pathname.match(/^\/api\/run\/([^/]+)$/);
    if (req.method === "GET" && runMatch) {
      const state = runs.get(runMatch[1]);
      if (!state) return sendJson(res, { error: "Run not found" }, 404);
      return sendJson(res, state);
    }

    if (req.method === "GET" && url.pathname === "/api/runs") {
      return sendJson(res, Array.from(runs.values()).map((run) => ({
        id: run.id,
        status: run.status,
        result: run.result ? { outputDir: run.result.outputDir } : null,
        error: run.error
      })));
    }

    return serveStatic(res, url.pathname);
  } catch (error) {
    return sendJson(res, { error: error.stack || error.message }, 500);
  }
});

server.listen(port, () => {
  console.log(`Research Hub running at http://localhost:${port}`);
});

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

async function serveStatic(res, pathname) {
  const cleanPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(publicDir, cleanPath);
  if (!target.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(target);
    res.writeHead(200, { "content-type": contentType(target) });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
