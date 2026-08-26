import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { collectBody, proxyRequest, pipeProxyResult, publicConfig } from "./server/proxy-core.mjs";
import { handleMcp } from "./server/modules/mcp-registry.mjs";
import { handleArtifacts } from "./server/modules/artifact-sandbox.mjs";
import { handleModelRouter } from "./server/modules/model-router.mjs";
import { handleCodeEngine } from "./server/modules/code-engine.mjs";
import { routeAndExecuteTools } from "./server/modules/runtime-tools.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const root = existsSync(join(projectRoot, "dist", "index.html"))
  ? join(projectRoot, "dist")
  : projectRoot;
const port = Number(process.env.PORT || 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJSON(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

async function handleAPI(req, res, url) {


  if (url.pathname === "/api/tools") {
    if (req.method !== "POST") { sendJSON(res, 405, {ok:false,error:"Method not allowed"}); return; }
    const raw = await collectBody(req);
    let body = {};
    try { body = raw?.length ? JSON.parse(Buffer.from(raw).toString("utf8")) : {}; } catch {}
    try {
      const result = await routeAndExecuteTools(body);
      sendJSON(res, 200, result);
    } catch (error) {
      sendJSON(res, 500, {ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if (url.pathname.startsWith("/api/code/")) {
    const raw = await collectBody(req);
    let body = {};
    try { body = raw?.length ? JSON.parse(Buffer.from(raw).toString("utf8")) : {}; } catch {}
    await handleCodeEngine(req, res, url, body);
    return;
  }

  if (url.pathname === "/api/models" || url.pathname === "/api/providers" || url.pathname.startsWith("/api/inference/")) {
    const raw = await collectBody(req);
    let body = {};
    try { body = raw?.length ? JSON.parse(Buffer.from(raw).toString("utf8")) : {}; } catch {}
    await handleModelRouter(req, res, url, body);
    return;
  }

  if (url.pathname.startsWith("/api/artifacts")) {
    const raw=await collectBody(req); let body={}; try{body=raw?.length?JSON.parse(Buffer.from(raw).toString("utf8")):{}}catch{}
    await handleArtifacts(req,res,url,body); return;
  }

  if (url.pathname.startsWith("/api/mcp")) {
    const raw = await collectBody(req);
    let body = {};
    try {
      body = raw?.length ? JSON.parse(Buffer.from(raw).toString("utf8")) : {};
    } catch {}
    await handleMcp(req, res, url, body);
    return;
  }

  if (url.pathname === "/api/config") {
    sendJSON(res, 200, publicConfig());
    return;
  }

  const pathname = url.pathname.replace(/^\/api\//, "");
  const body = await collectBody(req);
  const result = await proxyRequest({
    pathname,
    search: url.search,
    method: req.method,
    headers: req.headers,
    body
  });
  await pipeProxyResult(result, res);
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const cleaned = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(root, cleaned.replace(/^[/\\]+/, ""));

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }

  const ext = extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("content-type", MIME[ext] || "application/octet-stream");

  if (filePath.endsWith("sw.js")) {
    res.setHeader("cache-control", "no-cache");
  }

  createReadStream(filePath)
    .on("error", error => {
      console.error(error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    })
    .pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await handleAPI(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    console.error("Ava server error:", error);
    sendJSON(res, 502, {
      error: "Ava server failed.",
      code: "AVA_SERVER_ERROR",
      route: (() => { try { return new URL(req.url, "http://localhost").pathname; } catch { return ""; } })(),
      detail: String(error?.message || error)
    });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Ava I listening on 0.0.0.0:${port}`);
  console.log(`NVIDIA NIM configured: ${Boolean(process.env.NVIDIA_API_KEY)}`);
  console.log(`ElevenLabs configured: ${Boolean(process.env.ELEVENLABS_API_KEY)}`);
});
