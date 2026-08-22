import { handleMcp } from "../server/modules/mcp-registry.mjs";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const routedPath = String(url.searchParams.get("path") || "");
    if (routedPath) {
      url.pathname = `/api/mcp/${routedPath}`.replace(/\/+$/, "");
      url.searchParams.delete("path");
    }

    let body = {};
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (chunks.length) {
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
      }
    }

    await handleMcp(req, res, url, body);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: String(error.message || error) }));
  }
}
