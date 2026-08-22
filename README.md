# Ava I v6.5.3 — NVIDIA NIM Clean

Primary inference provider: NVIDIA NIM.

Model: `nvidia/nemotron-3-ultra-550b-a55b`

Required environment variable:
`NVIDIA_API_KEY`

Inference endpoint:
`https://integrate.api.nvidia.com/v1/chat/completions`

Ava Chat, Ava Code, auto-title and long-response continuation use NVIDIA NIM. MCP, KaTeX, widgets, chat rename/slug and downloadable artifacts remain enabled.

## v6.5.4 — NVIDIA model scope fix

Fixes `ReferenceError: NVIDIA_CHAT_MODEL is not defined`.

The Nemotron model identifier is now declared once at global scope, and critical inference requests also use the explicit model ID:
`nvidia/nemotron-3-ultra-550b-a55b`

No OpenRouter chat fallback is restored.

## v6.5.5 — Literal Nemotron model ID

Eliminates all runtime references to `NVIDIA_CHAT_MODEL`, `NVIDIA_CODE_MODEL`,
and `NVIDIA_CHAT_FALLBACK`.

Every inference path uses the literal model ID:
`nvidia/nemotron-3-ultra-550b-a55b`

Also filters repeated stray `svg svg svg` text artifacts from rendered assistant output.


## v6.6 — Safe links + Studio stores + MCP in Chat

- Third-party HTTP/HTTPS links open through an Ava-owned warning dialog before navigation.
- Avalynx Studio now contains an Ava Agents store and an MCP store.
- MCP catalog includes GitHub, Supabase, Cloudflare, Google Drive, Gmail, Slack, Zoom, Canva, Adobe, Vercel, Render, Stripe and Sentry.
- Marketplace MCP activation controls which tools normal Ava Chat exposes when no explicit `@provider` mention is used.
- Ava Chat can call MCP tools through NVIDIA Nemotron, not only Ava Code.
- API-key fields are `type=text` technical-secret fields with browser/password-manager ignore hints and CSS masking. They are explicitly marked as API credentials, not account passwords.

## v6.6.1 — Fresh Web / current date

- Injects the real current local date, time and timezone into Chat and Ava Code requests.
- Freshness-sensitive requests such as "hoje", "agora", "latest" and "this year" trigger live-search behavior.
- If a compatible MCP search/browse tool is connected, Ava restricts the tool set to web/search tools and requires a tool call.
- If no live search tool is available, Ava says so instead of pretending stale model knowledge is current.
