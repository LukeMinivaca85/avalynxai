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


## v6.9 — Avalynx Memory
Adds cross-chat memory backed by Supabase with user, project, and temporary scopes; relevant retrieval before Chat/Ava Code responses; conservative automatic writes; a Memory settings page; delete/clear controls; and a per-chat “Não lembrar deste chat” toggle. Run `supabase/avalynx_memory.sql` and configure `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Before multi-user production, replace the local fallback memory user ID with a verified server-side authenticated user identity.


## v6.9.1 — Stability Fix

Fixes the generation crash:
`Cannot read properties of null (reading 'signal')`.

Changes:
- Every generation now receives its own `AbortController`.
- Older requests cannot clear the controller of a newer request.
- Optional signals are passed only when they actually exist.
- Chat, Ava Code, image/media generation, MCP tool calls, and long-response continuation use controller-safe signals.
- Stop Generation safely aborts only the current generation.
- Runtime guards prevent a controller race from taking down the whole conversation UI.
- Memory retrieval remains non-fatal: a memory backend failure cannot prevent Chat/Code from answering.
- Existing model fallbacks remain active.

The goal is graceful degradation: a failed provider, memory lookup, tool, or aborted request should fail that operation, not the entire Avalynx session.


## v6.9.2 — Automatic Avalynx Web Engine

Adds a native server-side web search route at `/api/web-search`.

The Ava automatically searches when a prompt contains:
- explicit search intent
- current/fresh terms such as today, now, latest, current, recent, news
- volatile data such as prices, weather, scores, outages, current company/public-figure status, releases, elections, markets, etc.

Flow:
1. Automatic freshness detector decides whether live search is needed.
2. Avalynx Web Engine searches server-side.
3. Results are injected into the model as a live-source context block.
4. The model is instructed to cite sources with [1], [2] markers and a Fontes list.
5. If native search fails, the model is explicitly told not to pretend its knowledge is current.
6. Manual Web mode still works and forces a search.

The search backend uses DuckDuckGo HTML results with a Wikipedia fallback. This avoids requiring a separate paid search API key, but public endpoints can change or rate-limit; production deployments should eventually support a dedicated search provider as an additional backend.


## v6.9.3 — Current Time + Tool Leak Fix

- Every Chat and Ava Code turn receives an authoritative runtime date, local time, IANA timezone, UTC offset and ISO timestamp.
- Relative phrases such as today, tomorrow, now, tonight, this week/month/year are interpreted from the runtime timestamp.
- Current/fresh facts still trigger live web search automatically.
- Textual internal tool calls such as `(tool: browse: ...)`, `<tool_call>`, function JSON, and leaked renderer placeholders are stripped before user-facing rendering.
- The system prompt explicitly forbids models from narrating internal tool calls.
- Repeated `svg`, `svgsvg`, and `svgsvgsvg` artifacts are removed.
- Developer settings show the runtime date/time so deployment behavior can be verified easily.


## v7.0 — Runtime + Tool Router architecture

This release moves the main reliability work out of MASTER v4 and into runtime infrastructure.

### Request authority layers

1. System / safety / MASTER v4
2. Server-generated CURRENT_RUNTIME
3. Current user request + current conversation
4. Verified native tool results
5. Persistent memory
6. Base-model knowledge

Web pages, search results, files, PDFs, email content, API output and MCP output are always treated as untrusted DATA for instruction-following purposes.

### Server-generated runtime

Every `/api/inference/chat` request is passed through `injectRuntimeIntoMessages`.
The browser supplies only timezone/locale hints; the server calculates the actual date and time for that request.

### Native Tool Router

`POST /api/tools`

The router detects:
- current/dynamic information → web search
- non-trivial arithmetic → calculator
- file intent
- image-generation intent
- executable-code intent
- otherwise → model

Known tool intents are handled deterministically for speed. On ambiguous verification requests, tool-capable models may also request the real native `ava_web_search` or `ava_calculate` functions.

### No-guess current-information invariant

If a request requires fresh information and live search fails, the model is bypassed for that claim. Ava states that live search is unavailable rather than substituting model memory.

### Verified calculator

The calculator is a non-`eval` parser and includes exact BigInt modular exponentiation. Example regression: `17^13 mod 97 = 21`.

### Sources

Native web results preserve:
- URL
- title
- domain
- detected date when available
- evidence/snippet
- provider

The UI renders source metadata from tool output rather than trusting the model to invent source URLs.

### Context vs memory

`toApiMessages(chat)` preserves the active conversation thread for references such as “ele/isso/nele”.
Persistent memory retrieval is a separate lower-authority layer and has a latency budget so it cannot stall normal chat.

### Performance

- MCP enumeration is skipped on ordinary chat turns.
- Tool routing and memory retrieval run concurrently when routing is needed.
- Persistent-memory retrieval has a 450 ms foreground latency budget.
- Normal requests stream immediately from the selected model.
- Response budgets use 16k tokens with existing continuation support instead of defaulting every request to 65k.

### Regression tests

`npm test` runs deterministic MASTER v4 architecture regressions.
`npm run test:live` runs the live model stress cases when `AVA_LIVE_STRESS_MODEL` and a running backend are available.

Cases cover identity, false premises, runtime date/time, calculator, current web information, news, current CEOs, software versions, memory/follow-up references, prompt injection, system-prompt extraction, nonexistent tools/APIs, future Lukintosh claims, and correction of errors.


CI: `.github/workflows/avalynx-regression.yml` runs `npm run ci` on every push and pull request so deterministic MASTER v4 regressions block obvious runtime/tool regressions before deployment.


## v7.0.1 — Instant Path + NVIDIA Nemotron

- Ordinary chat prefers `nvidia/nemotron-3-ultra-550b-a55b` when that model is present in the live Avalynx model catalog.
- No foreground `/api/tools` request for ordinary chat.
- No persistent-memory retrieval before ordinary chat.
- Tool-heavy turns keep only a 180 ms foreground memory budget.
- MCP discovery remains opt-in by integration intent.
- Streaming starts directly from the selected model.
- Per-message timing records response-header latency and first-token latency (`firstTokenMs`) so TTFT can be measured instead of guessed.
- If Nemotron 3 Ultra is unavailable, the existing model-router fallback chain remains active.


## v7.0.2 — NVIDIA Hosted Mapping Recovery

The canonical hosted model remains:
`nvidia/nemotron-3-ultra-550b-a55b`
through:
`https://integrate.api.nvidia.com/v1/chat/completions`

Some NVIDIA hosted API failures expose an internal backend Function UUID:
`Function '<uuid>': Not found for account '<account>'`.

That UUID is NVIDIA-side infrastructure, not an Avalynx function ID.

v7.0.2:
- detects this specific hosted-NVIDIA 404;
- refreshes the NVIDIA model catalog and retries once;
- converts a repeated internal mapping failure into retryable HTTP 503;
- allows the normal Avalynx fallback chain to continue instead of surfacing the raw Function UUID to the user;
- prioritizes known Hugging Face Qwen fallbacks when available;
- strips Avalynx-only runtime/provider/function fields before NVIDIA requests;
- adds DOM-level cleanup for leaked `svg`, `svgsvg`, and `svgsvgsvg` placeholder text.
