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
