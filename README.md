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

No legacy aggregator fallback is restored.

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


## v6.7 — Avalynx Model Router

Ava no longer treats one inference provider as the entire model universe.

The backend now exposes a unified dynamic catalog:

- `GET /api/models`
- `GET /api/providers`
- `POST /api/inference/chat`
- `POST /api/inference/image`
- `POST /api/inference/video`
- `POST /api/inference/music`
- `POST /api/inference/audio`

Built-in direct provider discovery supports:

- NVIDIA NIM
- Google Gemini / AI Studio
- Hugging Face catalog
- Replicate
- ElevenLabs
- fal.ai models configured through `FAL_MODELS_JSON`
- additional providers through `AVA_MODEL_PROVIDERS_JSON`
- models that cannot be enumerated through `AVA_MODEL_CATALOG_JSON`

The Model Hub is now capability-aware with Chat, Code, Image, Video, Music, Audio,
Embeddings, Reasoning and Tools filters.

Chat uses the selected compatible model and can fall back across directly-connected
providers. Ava Code chooses a connected tool-capable model. Image, video and music
generation route through capability-specific backend endpoints.

The catalog only exposes models discovered from or explicitly configured for providers
that the deployment can access. A provider's presence in the catalog does not imply
that its upstream usage is free; billing and quotas remain controlled by that provider.


## v6.7.1 — Google AI Studio media priority

Media routing now prioritizes Google AI Studio when `GEMINI_API_KEY` is configured.

Direct Google adapters:
- Image: `gemini-3.1-flash-image` via `generateContent`
- Video: `veo-3.1-generate-preview` / `veo-3.1-lite-generate-preview` via `predictLongRunning` + operation polling
- Music: `lyria-3-pro-preview` / `lyria-3-clip-preview` via Interactions API

Veo file downloads are proxied server-side so the browser never receives the Gemini API key.
Hugging Face media-only catalog entries are no longer considered executable by default unless an adapter is configured.
Repeated stray `svgsvgsvg` text artifacts are cleaned from assistant rendering.


## v6.7.2 — Ava Code prefers Qwen Coder via Hugging Face

Ava Code now prioritizes Hugging Face Inference Providers for coding/tool workflows.

Priority:
1. `Qwen/Qwen3-Coder-480B-A35B-Instruct` through Hugging Face when live
2. other Qwen Coder models through Hugging Face
3. other Hugging Face code + tool-capable models
4. other Hugging Face tool-capable chat models
5. tool-capable coding/chat models from other connected providers

Hugging Face chat inference now uses the official OpenAI-compatible endpoint:
`https://router.huggingface.co/v1/chat/completions`

This preserves OpenAI-style tool calling and streaming semantics needed by Ava Code + MCP.


## v6.7.2 — Ava Code Qwen Coder + Google media execution

Ava Code now prioritizes Hugging Face Inference Providers:
1. `Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest`
2. `Qwen/Qwen2.5-Coder-32B-Instruct:fastest`
3. `openai/gpt-oss-120b:fastest`
4. other executable coding/tool-capable models

Hugging Face chat/tool calls use the official OpenAI-compatible endpoint:
`https://router.huggingface.co/v1/chat/completions`

An upstream model 404 no longer gets misclassified as a missing Avalynx backend route; Ava Code can continue to its next coding fallback.

Media routing prioritizes Google AI Studio:
- Image: `gemini-3.1-flash-image`
- Video: Veo 3.1 family
- Music: Lyria 3 Pro / Clip

The Google adapters are real execution adapters rather than catalog-only placeholders.
Replicate is no longer preferred over an available Google media model.
Stray repeated `svgsvgsvg` text is removed from assistant rendering.


## v6.8 — Codex CLI engine + media widgets

- Ava Code can use Codex CLI as the direct file-editing engine, without MCP in the file-edit path.
- `/api/code/status` reports engine availability.
- `/api/code/run` creates an isolated temporary workspace, runs `codex exec --sandbox workspace-write`, captures changed files, and returns downloadable artifacts.
- Qwen Coder via Hugging Face remains Ava Code's conversational/coding model when the Codex engine is not used or unavailable.
- Image, video and music generation now render as rich Avalynx media cards with generating state, preview/player, model/provider metadata, open/download actions, and image edit affordance.
- Google AI Studio remains the first-choice media provider when an applicable Google model is available.


## v6.8.1 — Codex CLI diagnostics

Codex failures now expose structured diagnostics instead of a bare HTTP 502.

`GET /api/code/status` includes binary path, sandbox, timeout, auth-env presence, platform, architecture and Node version.

`POST /api/code/run` failures include exitCode, classified cause (`auth`, `sandbox`, `path`, `timeout`, `quota`, `runtime`), sanitized stderr/stdout, and command metadata.

Ava Code renders these details directly in the conversation. Common API-key patterns are redacted before diagnostics are returned.

## v6.8.2 — Context-aware safety layer

- Keyword mentions alone do not trigger the support card.
- Tests, quotations, hypothetical examples, definitions and academic discussion are treated as contextual mentions.
- Genuine first-person self-harm/suicide intent can display a support card.
- Brazilian locale support uses CVV 188 and the official CVV web chat.
- Trusted contacts are optional, local-only, and never contacted automatically.


## v6.8.3 — NVIDIA Model Router fix

Fixes a critical NVIDIA model-ID routing bug.

Previously, a discovered NVIDIA model such as:
`nvidia/nemotron-3-ultra-550b-a55b`

could reach the upstream request as:
`nemotron-3-ultra-550b-a55b`

because the generic provider mapper removed the first path segment.

The NVIDIA adapter now preserves the exact upstream model ID returned by `/v1/models`.
Discovery also always retains the explicitly configured `NVIDIA_MODEL`, even if the model-list request temporarily fails.

New environment overrides:
- `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1`
- `NVIDIA_CHAT_PATH=/chat/completions`
- `NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b`

New diagnostic endpoint:
`GET /api/inference/nvidia-test`

It makes a tiny real chat request and reports the upstream status/model without exposing the API key.


## v6.8.4 — Settings + safer external actions
Adds expanded settings sections and confirmation before tel:, mailto:, app schemes and external web links. The CVV 188 action now offers Cancel, Copy 188, or Continue before opening a phone app.


## v6.8.5 — Settings Redesign
Replaces the accordion-style settings UI with a native-feeling sidebar, searchable categories, one settings page at a time, clean row controls, responsive mobile navigation, and dedicated pages for models, Ava Code, MCPs, media, security, trusted contact, privacy and developer diagnostics.


## v6.8.6 — Studio Dock + Représentants
Settings groups can sit side-by-side on wide screens. Avalynx Studio now uses a compact chevron and opens a fixed dock with created Ava Agents. Adds Avalynx Représentants as the MCP/integration store surface.


## v6.8.7 — Microsoft Foundry Ava Agents

Avalynx Studio can now select Microsoft Foundry as an Ava Agent engine.

Backend configuration:
- `AZURE_AI_FOUNDRY_PROJECT_ENDPOINT`
- `AZURE_AI_FOUNDRY_ACCESS_TOKEN` (Microsoft Entra bearer token), or `AZURE_AI_FOUNDRY_API_KEY` where the selected Foundry API/resource supports key authentication
- `AZURE_AI_FOUNDRY_API_VERSION=v1`

The browser never receives these credentials. `/api/foundry` performs connection tests and creates Prompt Agents server-side.
Hosted Agent is shown as a future/advanced option but is deliberately not fake-deployed: Microsoft Foundry hosted agents require a code/container deployment definition.
