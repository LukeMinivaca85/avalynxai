import { getIntegrationAccessToken } from "./integration-oauth.mjs";
import crypto from "node:crypto";

const sessions = new Map();

const PRESETS = [
  ["lukintosh", "Lukintosh MCP", "MCP_LUKINTOSH_URL", "MCP_LUKINTOSH_TOKEN"],
  ["github", "GitHub", "MCP_GITHUB_URL", "MCP_GITHUB_TOKEN"],
  ["supabase", "Supabase", "MCP_SUPABASE_URL", "MCP_SUPABASE_TOKEN"],
  ["cloudflare", "Cloudflare", "MCP_CLOUDFLARE_URL", "MCP_CLOUDFLARE_TOKEN"],
  ["google-drive", "Google Drive", "MCP_GOOGLE_DRIVE_URL", "MCP_GOOGLE_DRIVE_TOKEN"],
  ["gmail", "Gmail", "MCP_GMAIL_URL", "MCP_GMAIL_TOKEN"],
  ["google-calendar", "Google Calendar", "MCP_GOOGLE_CALENDAR_URL", "MCP_GOOGLE_CALENDAR_TOKEN"],
  ["microsoft", "Microsoft 365", "MCP_MICROSOFT_URL", "MCP_MICROSOFT_TOKEN"],
  ["slack", "Slack", "MCP_SLACK_URL", "MCP_SLACK_TOKEN"],
  ["zoom", "Zoom", "MCP_ZOOM_URL", "MCP_ZOOM_TOKEN"],
  ["spotify", "Spotify", "MCP_SPOTIFY_URL", "MCP_SPOTIFY_TOKEN"],
  ["apple-music", "Apple Music", "MCP_APPLE_MUSIC_URL", "MCP_APPLE_MUSIC_TOKEN"],
  ["shazam", "Shazam", "MCP_SHAZAM_URL", "MCP_SHAZAM_TOKEN"],
  ["canva", "Canva", "MCP_CANVA_URL", "MCP_CANVA_TOKEN"],
  ["adobe", "Adobe", "MCP_ADOBE_URL", "MCP_ADOBE_TOKEN"],
  ["vercel", "Vercel", "MCP_VERCEL_URL", "MCP_VERCEL_TOKEN"],
  ["render", "Render", "MCP_RENDER_URL", "MCP_RENDER_TOKEN"],
  ["stripe", "Stripe", "MCP_STRIPE_URL", "MCP_STRIPE_TOKEN"],
  ["sentry", "Sentry", "MCP_SENTRY_URL", "MCP_SENTRY_TOKEN"]
];

function safeId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

async function loadRegistry(req) {
  const servers = [];

  for (const [id, name, urlEnv, tokenEnv] of PRESETS) {
    let url = process.env[urlEnv] || "";
    let token = process.env[tokenEnv] || "";

    const oauthProvider = ({"google-drive":"google","gmail":"google","google-calendar":"google"})[id] || (["microsoft","slack","zoom","spotify","canva","adobe"].includes(id) ? id : null);
    if (!token && oauthProvider && req) {
      try { token = await getIntegrationAccessToken(req, oauthProvider) || ""; } catch {}
    }

    if (id === "gmail") url = url || "https://gmailmcp.googleapis.com/mcp/v1";
    if (id === "zoom") url = url || "https://zoom.us/mcp/meeting/streamable";
    if (id === "canva") url = url || "https://mcp.canva.com/mcp";

    if (id === "lukintosh") {
      url = url || "https://mcp.lukintosh.com/mcp";
      token = token || process.env.AVA_MCP_GATEWAY_TOKEN || "";
    }

    if (url && (id !== "lukintosh" || token)) {
      servers.push({
        id,
        name,
        url,
        token,
        headers: {},
        preset: true
      });
    }
  }

  const raw = process.env.MCP_SERVERS_JSON;
  if (raw) {
    try {
      const custom = JSON.parse(raw);
      for (const item of Array.isArray(custom) ? custom : []) {
        if (!item?.url) continue;
        const id = safeId(item.id || item.name || `custom-${servers.length + 1}`);
        servers.push({
          id,
          name: String(item.name || id),
          url: String(item.url),
          token: String(item.token || ""),
          headers: item.headers && typeof item.headers === "object" ? item.headers : {},
          preset: false
        });
      }
    } catch (error) {
      console.warn("Invalid MCP_SERVERS_JSON:", error.message);
    }
  }

  const dedupe = new Map();
  for (const server of servers) dedupe.set(server.id, server);
  return [...dedupe.values()];
}

function publicServer(server) {
  let origin = "";
  try { origin = new URL(server.url).origin; } catch {}
  return {
    id: server.id,
    name: server.name,
    configured: true,
    origin,
    preset: !!server.preset
  };
}

function parseMcpResponse(text) {
  const clean = String(text || "").trim();
  if (!clean) return null;
  try { return JSON.parse(clean); } catch {}

  const events = [];
  for (const line of clean.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try { events.push(JSON.parse(payload)); } catch {}
  }
  return events.at(-1) || null;
}

async function postRpc(server, method, params = {}, sessionId = null) {
  const headers = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
    ...server.headers
  };
  if (server.token) headers.authorization = `Bearer ${server.token}`;
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const id = crypto.randomUUID();
  const response = await fetch(server.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    redirect: "follow"
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${server.name} MCP ${response.status}: ${text.slice(0, 500)}`);
  }

  const parsed = parseMcpResponse(text);
  if (parsed?.error) {
    throw new Error(parsed.error.message || JSON.stringify(parsed.error));
  }

  return {
    result: parsed?.result,
    sessionId: response.headers.get("mcp-session-id") || sessionId
  };
}

async function ensureSession(server) {
  const cached = sessions.get(server.id);
  if (cached?.sessionId || cached?.initialized) return cached;

  const init = await postRpc(server, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: {
      name: "Ava Code",
      version: "6.2.0"
    }
  });

  const session = {
    sessionId: init.sessionId || null,
    initialized: true,
    serverInfo: init.result?.serverInfo || null
  };
  sessions.set(server.id, session);

  // Notification is best-effort because some servers don't require it.
  try {
    const headers = {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      ...server.headers
    };
    if (server.token) headers.authorization = `Bearer ${server.token}`;
    if (session.sessionId) headers["mcp-session-id"] = session.sessionId;
    await fetch(server.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized"
      })
    });
  } catch {}

  return session;
}

function riskForTool(name, description = "") {
  const text = `${name} ${description}`.toLowerCase();

  if (/\b(delete|remove|destroy|drop|truncate|revoke|disable|purge|terminate)\b/.test(text)) return "danger";
  if (/\b(write|create|update|edit|patch|deploy|publish|push|merge|commit|execute|run|sql|mutation|upload|move|rename|dns|secret|invite|insert|upsert)\b/.test(text)) return "write";
  return "read";
}

function functionName(serverId, toolName) {
  return `mcp__${safeId(serverId).replace(/-/g, "_")}__${String(toolName).replace(/[^a-zA-Z0-9_]+/g, "_").slice(0, 48)}`;
}

async function toolsForServer(server) {
  const session = await ensureSession(server);
  const response = await postRpc(server, "tools/list", {}, session.sessionId);
  if (response.sessionId && response.sessionId !== session.sessionId) {
    session.sessionId = response.sessionId;
    sessions.set(server.id, session);
  }

  return (response.result?.tools || []).map(tool => ({
    server: server.id,
    serverName: server.name,
    name: tool.name,
    functionName: functionName(server.id, tool.name),
    description: tool.description || "",
    inputSchema: tool.inputSchema || { type: "object", properties: {} },
    risk: riskForTool(tool.name, tool.description)
  }));
}

function findByFunctionName(registry, fn) {
  for (const server of registry) {
    const prefix = `mcp__${safeId(server.id).replace(/-/g, "_")}__`;
    if (!fn.startsWith(prefix)) continue;
    return { server, encodedTool: fn.slice(prefix.length) };
  }
  return null;
}

async function resolveRealToolName(server, encoded) {
  const tools = await toolsForServer(server);
  return tools.find(tool => tool.functionName.endsWith(`__${encoded}`) || tool.functionName === `mcp__${safeId(server.id).replace(/-/g, "_")}__${encoded}`) || null;
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

export async function handleMcp(req, res, url, body = {}) {
  const registry = await loadRegistry(req);
  const path = url.pathname.replace(/^\/api\/mcp/, "") || "/servers";

  if (path === "/servers" && req.method === "GET") {
    const configured = new Map(registry.map(server => [server.id, publicServer(server)]));
    const all = PRESETS.map(([id, name]) => configured.get(id) || ({
      id,
      name,
      configured: false,
      origin: id === "lukintosh" ? "https://mcp.lukintosh.com" : "",
      preset: true,
      needsToken: id === "lukintosh"
    }));
    for (const server of registry.filter(s => !s.preset)) all.push(publicServer(server));
    return send(res, 200, { servers: all });
  }

  if (path === "/tools" && req.method === "GET") {
    const tools = [];
    const errors = [];

    for (const server of registry) {
      try {
        tools.push(...await toolsForServer(server));
      } catch (error) {
        errors.push({ server: server.id, error: String(error.message || error) });
      }
    }

    return send(res, 200, { tools, errors });
  }

  if (path === "/call" && req.method === "POST") {
    const fn = String(body.functionName || "");
    const match = findByFunctionName(registry, fn);
    if (!match) return send(res, 404, { error: "Ferramenta MCP não encontrada.", code: "MCP_TOOL_NOT_FOUND" });

    try {
      const tool = await resolveRealToolName(match.server, match.encodedTool);
      if (!tool) return send(res, 404, { error: "Ferramenta MCP não encontrada no servidor.", code: "MCP_TOOL_NOT_FOUND" });

      if (tool.risk !== "read" && body.approved !== true) {
        return send(res, 409, {
          approvalRequired: true,
          risk: tool.risk,
          server: match.server.name,
          tool: tool.name,
          message: `${match.server.name} · ${tool.name} pode alterar dados ou executar uma ação.`
        });
      }

      const session = await ensureSession(match.server);
      const result = await postRpc(match.server, "tools/call", {
        name: tool.name,
        arguments: body.arguments && typeof body.arguments === "object" ? body.arguments : {}
      }, session.sessionId);

      return send(res, 200, {
        ok: true,
        server: match.server.name,
        tool: tool.name,
        result: result.result
      });
    } catch (error) {
      console.error("Ava MCP tool call failed", {
        server: match.server.id,
        functionName: fn,
        error: String(error?.message || error)
      });
      return send(res, 502, {
        error: "MCP tool call failed.",
        code: "MCP_UPSTREAM_ERROR",
        server: match.server.name,
        detail: String(error?.message || error)
      });
    }
  }

  return send(res, 404, { error: "Rota MCP não encontrada." });
}
