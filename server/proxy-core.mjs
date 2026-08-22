import { Readable } from "node:stream";

const OPENROUTER = "https://openrouter.ai/api/v1";
const ELEVEN = "https://api.elevenlabs.io";

function env(name) {
  return process.env[name] || "";
}

export function deploymentName() {
  if (process.env.VERCEL) return "vercel";
  if (process.env.RENDER) return "render";
  return "node";
}

export function publicConfig() {
  return {
    openrouter: Boolean(env("OPENROUTER_API_KEY")),
    elevenlabs: Boolean(env("ELEVENLABS_API_KEY")),
    deployment: deploymentName()
  };
}

function providerForPath(pathname) {
  if (pathname.startsWith("openrouter/")) return "openrouter";
  if (pathname.startsWith("eleven/")) return "eleven";
  return null;
}

function upstreamFor(pathname, search = "") {
  if (pathname === "openrouter/key") return `${OPENROUTER}/key${search}`;
  if (pathname === "openrouter/models/user") return `${OPENROUTER}/models/user${search}`;
  if (pathname === "openrouter/images/models") return `${OPENROUTER}/images/models${search}`;
  if (pathname === "openrouter/images") return `${OPENROUTER}/images${search}`;
  if (pathname === "openrouter/chat/completions") return `${OPENROUTER}/chat/completions${search}`;

  if (pathname === "eleven/voices") return `${ELEVEN}/v2/voices${search}`;
  if (pathname === "eleven/stt") return `${ELEVEN}/v1/speech-to-text${search}`;

  const tts = pathname.match(/^eleven\/tts\/([^/]+)$/);
  if (tts) {
    return `${ELEVEN}/v1/text-to-speech/${encodeURIComponent(decodeURIComponent(tts[1]))}/stream${search}`;
  }

  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function collectBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : null;
}

export async function proxyRequest({ pathname, search = "", method, headers, body }) {
  const provider = providerForPath(pathname);
  const upstream = upstreamFor(pathname, search);

  if (!provider || !upstream) {
    return {
      status: 404,
      headers: { "content-type": "application/json" },
      body: Buffer.from(JSON.stringify({ error: "Unknown API route." }))
    };
  }

  const openrouterKey = env("OPENROUTER_API_KEY");
  const elevenKey = env("ELEVENLABS_API_KEY");

  if (provider === "openrouter" && !openrouterKey) {
    return {
      status: 503,
      headers: { "content-type": "application/json" },
      body: Buffer.from(JSON.stringify({ error: "OPENROUTER_API_KEY is not configured on the server." }))
    };
  }

  if (provider === "eleven" && !elevenKey) {
    return {
      status: 503,
      headers: { "content-type": "application/json" },
      body: Buffer.from(JSON.stringify({ error: "ELEVENLABS_API_KEY is not configured on the server." }))
    };
  }

  const outgoingHeaders = new Headers();

  const incomingContentType = headers["content-type"] || headers.get?.("content-type");
  if (incomingContentType) outgoingHeaders.set("content-type", incomingContentType);

  const accept = headers["accept"] || headers.get?.("accept");
  if (accept) outgoingHeaders.set("accept", accept);

  if (provider === "openrouter") {
    outgoingHeaders.set("authorization", `Bearer ${openrouterKey}`);
    outgoingHeaders.set("http-referer", env("AVA_PUBLIC_URL") || "https://ava-i.app");
    outgoingHeaders.set("x-openrouter-title", env("OPENROUTER_APP_NAME") || "Ava I");
  } else {
    outgoingHeaders.set("xi-api-key", elevenKey);
  }

  const options = {
    method,
    headers: outgoingHeaders,
    body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
    redirect: "follow"
  };

  const retryable = pathname === "openrouter/chat/completions";
  const maxAttempts = retryable ? 3 : 1;

  let response = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    response = await fetch(upstream, options);

    if (![502, 503, 504].includes(response.status) || attempt === maxAttempts) {
      break;
    }

    try { await response.arrayBuffer(); } catch {}
    await sleep(attempt * 450);
  }

  const passthroughHeaders = {};
  for (const name of [
    "content-type",
    "content-length",
    "cache-control",
    "x-request-id",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "request-id"
  ]) {
    const value = response.headers.get(name);
    if (value) passthroughHeaders[name] = value;
  }

  passthroughHeaders["x-ava-proxy-provider"] = provider;
  passthroughHeaders["x-ava-proxy-route"] = pathname;

  return {
    status: response.status,
    headers: passthroughHeaders,
    response
  };
}

export async function pipeProxyResult(result, res) {
  res.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers || {})) {
    try { res.setHeader(key, value); } catch {}
  }

  if (result.body) {
    res.end(result.body);
    return;
  }

  if (!result.response?.body) {
    res.end();
    return;
  }

  Readable.fromWeb(result.response.body).pipe(res);
}
