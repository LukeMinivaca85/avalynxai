import {
  collectBody,
  proxyRequest,
  pipeProxyResult,
  publicConfig
} from "../server/proxy-core.mjs";

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");

    const path = String(
      url.searchParams.get("path") || ""
    ).replace(/^\/+/, "");

    if (path === "config") {
      res.statusCode = 200;

      res.setHeader(
        "content-type",
        "application/json; charset=utf-8"
      );

      res.setHeader(
        "cache-control",
        "no-store"
      );

      res.end(
        JSON.stringify(publicConfig())
      );

      return;
    }

    const body = await collectBody(req);

    const search = (() => {
      const clone = new URLSearchParams(
        url.searchParams
      );

      clone.delete("path");
      clone.delete("query");

      const explicit =
        url.searchParams.get("query");

      if (explicit) {
        return explicit.startsWith("?")
          ? explicit
          : `?${explicit}`;
      }

      const remaining = clone.toString();

      return remaining
        ? `?${remaining}`
        : "";
    })();

    const result = await proxyRequest({
      pathname: path,
      search,
      method: req.method,
      headers: req.headers,
      body
    });

    await pipeProxyResult(
      result,
      res
    );
  } catch (error) {
    console.error(
      "Ava proxy error:",
      error
    );

    res.statusCode = 502;

    res.setHeader(
      "content-type",
      "application/json; charset=utf-8"
    );

    res.end(
      JSON.stringify({
        error: "Ava proxy failed.",
        detail: String(
          error?.message || error
        )
      })
    );
  }
}
