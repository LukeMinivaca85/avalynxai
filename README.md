# Ava I v4 — Universal AI Model Hub

Ava I agora funciona como um hub de modelos da OpenRouter.

## O que mudou

- Carrega dinamicamente os modelos permitidos pela sua conta usando `GET /api/v1/models/user`.
- Pesquisa por nome ou ID.
- Filtros: grátis, todos, reasoning, visão e tools.
- Filtro por provedor.
- Mostra contexto e preços de entrada/saída.
- **Proteção contra cobrança ativada por padrão**.
- Modelos pagos ficam bloqueados até você marcar “Permitir pagos”.
- Mantém fallback gratuito.
- Consulta `GET /api/v1/key` para mostrar informações da chave/uso quando disponíveis.
- Não depende de uma lista fixa de GPT, Claude, Gemini, Llama etc.

## Rodar

```bash
cd ava-i-pwa
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

No iPhone na mesma rede, abra `http://IP-DO-MAC:8080`.

> Para instalação PWA completa no iPhone, use HTTPS em produção.

## Configuração

1. Abra Configurações.
2. Cole sua OpenRouter API key.
3. Salve.
4. Toque no nome do modelo no topo.
5. O AI Model Hub carrega os modelos da sua conta.
6. Deixe o filtro **Grátis** para nunca selecionar pago sem querer.

## Segurança

A chave fica apenas em memória por padrão. Se “Lembrar a chave” for marcado, ela é salva no `localStorage` do navegador.

Não embuta uma chave privada no código de uma implantação pública.


## v4.1 — Truth First + Save Fix

- STRICT VERIFICATION MODE no Master System Prompt.
- Proibição explícita de reconstruir citações/capítulos/páginas prováveis.
- “Plausível” não pode ser tratado como “verdadeiro”.
- Ava Truth Audit para respostas factuais importantes.
- ENEM anti-hallucination reforçado.
- Botão Salvar mostra “Salvando…” e “Salvo ✓”.
- Salvamento local ocorre antes de qualquer atualização de rede.
- O salvamento usa o catálogo dinâmico do Model Hub, sem depender do seletor antigo.
- Cache PWA atualizado para v4.1.


## v4.2 — Auto Rename + Icon Actions

- O primeiro chat recebe um título automático depois da primeira resposta.
- Se o modelo atual for gratuito, a Ava I gera um título curto via IA.
- Se o modelo for pago, o app usa um título local para não gerar cobrança extra.
- Copiar, Editar e Regenerar agora usam ícones compactos.
- Os ícones continuam acessíveis com `aria-label` e tooltip.
- Cache PWA atualizado para v4.2.


## v4.3 — Web + Image

- Botão Web no composer.
- Usa o server tool atual `openrouter:web_search`.
- Pesquisa web é one-shot e o modelo decide quando pesquisar.
- Fontes retornadas pela API aparecem como chips clicáveis abaixo da resposta.
- Botão Imagem abre o Image Studio.
- O Image Studio carrega modelos dinamicamente de `GET /api/v1/images/models`.
- Geração usa `POST /api/v1/images`.
- Suporte a proporção e qualidade.
- Imagens geradas aparecem dentro da conversa e ficam salvas no histórico local.
- Busca web e imagem ficam bloqueadas por padrão para evitar cobrança surpresa.
- Nova opção “Permitir ferramentas com custo”.
- Auto-rename agora sempre capitaliza a primeira letra do título.
- Clique nos ícones Copiar / Editar / Regenerar corrigido para funcionar também ao tocar no SVG.
- Cache PWA atualizado para v4.3.


## v4.4 — Fresh Web

- O modo Web agora força pelo menos uma chamada ao `openrouter:web_search` com `tool_choice: "required"`.
- A data, hora e timezone locais do aparelho são injetados apenas na requisição Web.
- Perguntas com “hoje”, “latest”, “mais recente”, “agora”, “notícia” etc. recebem mais resultados e contexto de busca alto.
- A Ava I recebe instrução explícita para comparar datas de publicação antes de chamar uma notícia de “mais recente”.
- Perguntas atuais não devem mais ser respondidas somente da memória do modelo.
- Se a API não retornar fontes citáveis, a resposta ganha um aviso de que não deve ser tratada como atual confirmada.
- Cache PWA atualizado para v4.4.


## v4.5 — Authoritative Date

- Antes de uma busca Web, a Ava I consulta `openrouter:datetime`.
- Timezone fixado em `America/Sao_Paulo`.
- A data retornada pela ferramenta é injetada como fonte autoritativa para a pesquisa.
- O modelo recebe instrução explícita de que resultados de 2025 são históricos quando a data atual é 2026.
- Se não houver notícia do dia, a Ava I deve informar a data real da fonte mais recente em vez de chamá-la de “hoje”.
- Há fallback para a data do navegador em `America/Sao_Paulo` se a ferramenta datetime falhar.
- Web Search também recebe localização aproximada BR + timezone São Paulo.
- Cache PWA atualizado para v4.5.


## v4.6 — Rich Conversation

- Widgets nativos inline: callout, stats, list, key/value e progress.
- Blocos `ava-widget` são validados e removidos do texto antes de renderizar.
- JSON inválido é ignorado sem quebrar a conversa.
- Image Studio permite 1–4 imagens; múltiplas aparecem em um image group responsivo.
- Se o modelo não declarar suporte ao parâmetro `n`, a Ava I recua para uma imagem.
- Clique/tap nas imagens abre lightbox.
- Cache PWA atualizado para v4.6.


## v4.7 — Table Widget

- Novo widget nativo `table`.
- Comparações tabulares devem usar o widget em vez de tabela Markdown.
- Até 8 colunas e 30 linhas.
- Rolagem horizontal no celular.
- Células renderizadas com `textContent`.
- Cache PWA atualizado para v4.7.


## Ava I PWA iOS v1

Clone separado da v4.7, otimizado especificamente para iPhone/iPad e Home Screen Web Apps.

### Otimizações iOS
- `visualViewport` controla a altura útil durante abertura/fechamento do teclado.
- Composer deixa de ser overlay no iPhone e vira parte do layout flexível.
- Safe areas de notch/Dynamic Island/home indicator em topbar, sidebar e composer.
- Inputs e textareas em 16px no mobile para evitar zoom automático do Safari.
- Settings, Model Hub, Image Studio e guia de instalação viram bottom sheets.
- Sidebar abre com swipe da borda esquerda e fecha com swipe para a esquerda.
- Guia nativo de “Adicionar à Tela de Início”.
- Detecção de `navigator.standalone` / `display-mode: standalone`.
- Ícones 152, 167, 180, 192 e 512.
- Landscape compacto.
- Controles touch maiores.
- Image groups, widgets e tabela da v4.7 mantidos.
- Service Worker cache `ava-i-ios-v1`.

### Instalar no iPhone
No Safari:
Compartilhar → Adicionar à Tela de Início → abrir pelo ícone Ava I.

### Observação
Esta versão continua sendo uma PWA e não exige Xcode, IPA ou assinatura de aplicativo.


## Ava I PWA iOS v2 — Avalynx Voix

### ElevenLabs
- “Ler em voz alta” nas respostas da Ava I.
- Listagem de vozes via ElevenLabs `/v2/voices`.
- TTS neural via `/v1/text-to-speech/{voice_id}`.
- Modelo padrão: `eleven_flash_v2_5` para menor latência.
- Scribe v2 via `/v1/speech-to-text`.
- Chave ElevenLabs separada da OpenRouter.
- Uso ElevenLabs bloqueado por padrão até liberação explícita.

### Avalynx Voix
Modo de conversa por voz sem Xcode:
1. Microfone do navegador.
2. VAD local detecta fala e pausa.
3. ElevenLabs Scribe v2 transcreve.
4. Ava I responde pelo modelo OpenRouter atual.
5. ElevenLabs lê a resposta.
6. O microfone volta a ouvir automaticamente.

É um loop conversacional turn-based. O Speech Engine full-duplex oficial da ElevenLabs exige um servidor para hospedar a lógica do LLM; esta PWA permanece estática.

### Arquivos
Agora aceita até 8 arquivos por mensagem e tenta interpretar:
- imagens;
- PDF;
- áudio;
- vídeo;
- TXT/Markdown/CSV/TSV/JSON/XML/HTML;
- código-fonte e arquivos de configuração;
- DOCX;
- XLSX;
- PPTX;
- ODT/ODS/ODP;
- EPUB;
- ZIP;
- RTF;
- EML/MBOX/ICS/VCF;
- formatos binários desconhecidos por inspeção best-effort.

DOCX/XLSX/PPTX/OpenDocument/EPUB/ZIP são abertos localmente no navegador usando um leitor ZIP implementado no próprio app, sem CDN externa.

Áudio e vídeo usam Scribe v2 quando ElevenLabs está configurada. Vídeo também pode ser enviado visualmente ao OpenRouter quando o modelo selecionado declara suporte a vídeo.

### Segurança
A ElevenLabs recomenda não expor API keys em código cliente. Esta versão é adequada para teste pessoal com a sua própria chave. Para produção, use backend + tokens temporários/credenciais de escopo reduzido.


## Ava I v4.8 — Universal

Esta build unifica a versão normal e a edição otimizada para iOS.

- Desktop continua com o layout normal.
- iPhone/iPad ativam automaticamente safe areas, visualViewport, bottom sheets e ajustes de teclado/touch.
- Avalynx Voix, ElevenLabs, anexos avançados, widgets, tabelas, geração de imagem e web funcionam na mesma build.

### Voz neural
- “Ler em voz alta” em respostas da Ava I.
- ElevenLabs TTS.
- Seleção de voz.
- Flash v2.5, Multilingual v2 e Eleven v3.
- Avalynx Voix com microfone → VAD → Scribe v2 → Ava I → voz → escuta novamente.

### Arquivos
Até 8 anexos por mensagem:
- imagens e PDF;
- áudio e vídeo;
- DOCX, XLSX, PPTX;
- ODT, ODS, ODP;
- EPUB, ZIP e RTF;
- TXT, Markdown, CSV, TSV, JSON, XML, HTML;
- código, configs, logs, legendas, EML, MBOX, ICS e VCF;
- binários desconhecidos com inspeção best-effort.

### Plataforma
O código específico de iOS só é ativado quando um iPhone/iPad é detectado. Em desktop, a experiência permanece a PWA normal.


## v4.8.1 — ElevenLabs permissions fix

- Erro `missing_permissions / voices_read` agora é explicado em linguagem clara.
- O app não trata `voices_read` ausente como “API key inválida”.
- Novo campo **Voice ID manual**.
- Uma chave restrita pode usar um Voice ID conhecido sem precisar listar vozes.
- Erros de TTS e Scribe agora tentam mostrar exatamente qual escopo ElevenLabs está faltando.
- Cache atualizado para `ava-i-shell-v4.8.1-voix-permissions`.

Para listar vozes automaticamente, a API key precisa permitir leitura de vozes (`voices_read`).


## v4.9 — Instant Voice + Attachment Cube

### Ler em voz alta
- TTS trocado para o endpoint ElevenLabs `/stream`.
- Em navegadores com MediaSource + `audio/mpeg`, a Ava começa a tocar assim que chegam os primeiros chunks.
- `audio.play()` é iniciado no próprio gesto do clique, antes da primeira espera de rede, reduzindo problemas de autoplay/latência em Safari.
- Fallback por Blob continua disponível quando MediaSource não puder ser usado.
- O botão mostra estado de carregamento imediatamente.

### Anexos no avatar
- Mensagens com anexos ganham um clipe no canto superior do avatar.
- Hover/foco gira o avatar como um cubo vertical e revela, atrás dele, nome, tipo e tamanho do arquivo.
- Em telas touch, tocar no avatar alterna a face do anexo.
- Múltiplos anexos mostram contador `+N`.

### Imagens
- Imagens anexadas ganham thumbnail persistida e compactada no histórico.
- A mensagem exibe preview clicável da imagem.
- O preview abre no lightbox já existente.
- No composer, imagens já aparecem como miniatura antes do envio.

### Compatibilidade
- Metadados de anexos são novos em v4.9; conversas antigas continuam abrindo normalmente.


## v4.9.1 — TTS deadlock fix

Corrige um deadlock no streaming ElevenLabs da v4.9.

Antes:
- `audio.play()` era iniciado;
- o código aguardava `play()` resolver;
- alguns navegadores só resolvem `play()` depois de receber mídia;
- os chunks só eram enviados depois do `play()`;
- resultado: “Gerando teste…” podia ficar parado.

Agora:
- `play()` é iniciado no gesto do usuário;
- o stream ElevenLabs começa em paralelo;
- o MediaSource recebe os chunks imediatamente;
- ao primeiro chunk, a reprodução é acionada novamente sem bloquear;
- o teste mostra `Gerando teste…` → `Tocando…` → `Voz funcionando ✓`;
- timeout de 30 segundos gera erro explícito em vez de parecer travado.


## v4.9.2 — Multi-attachment / localStorage fix

Corrige o bug em que a Ava I podia “sumir” ou parar de responder ao enviar 2+ anexos.

### Causa
O `apiContent` da mensagem continha o arquivo completo em data URL/base64 (imagem, PDF, áudio, vídeo etc.) e era salvo junto com `state.chats` no `localStorage`.

Dois arquivos podiam exceder rapidamente a quota do navegador. `localStorage.setItem()` lançava `QuotaExceededError`, interrompendo `sendCurrent()` antes de `generateAssistant()`.

### Correção
- `apiContent` agora é uma propriedade **não enumerável e transitória**.
- O arquivo completo continua disponível para a chamada OpenRouter atual.
- `JSON.stringify(state.chats)` não inclui mais os bytes/base64 dos anexos.
- O histórico guarda apenas texto, metadados e thumbnails pequenas.
- Thumbnails foram reduzidas para um orçamento máximo.
- Se o histórico ficar grande, a persistência remove thumbnails antes de falhar.
- Se o localStorage estiver completamente cheio, o envio continua em memória em vez de abortar.
- `sendCurrent()` agora possui tratamento explícito de erro.
- Após reload, a Ava sabe que o anexo existia, mas não finge que ainda possui seus bytes.


## v4.9.3 — Attachment delivery fix

Corrige o fluxo em que anexos desapareciam do composer sem confirmação de que a OpenRouter havia aceitado o payload.

### Mudanças
- O payload multimodal atual é passado explicitamente para `generateAssistant()`.
- A requisição não depende mais de `apiContent` sobreviver em objetos de histórico.
- Os anexos só somem do composer após um HTTP 2xx da OpenRouter.
- Enquanto a requisição está sendo enviada, aparece `Enviando anexos…`.
- Em erro, os anexos ficam disponíveis para tentar novamente.
- Fotos grandes são redimensionadas/comprimidas apenas na cópia enviada ao modelo.
- A foto original do usuário não é alterada.
- Para imagens, se o modelo atual não aceitar visão, a Ava tenta `openrouter/free` primeiro.
- O Free Models Router é usado como fallback multimodal gratuito.
- Erros 400/413/415/422 em multimodalidade viram mensagens explícitas.
- Mensagens enviadas mostram `Você · N anexos` junto ao avatar.

### Por que
Fotos de celular em base64 podem gerar requests enormes. Além disso, um modelo específico pode não aceitar visão. A v4.9.3 trata ambos os casos antes de concluir que o anexo “sumiu”.


## v5.0 — Math + Writing + Code + Widgets
- KaTeX rendering for `\( \)`, `\[ \]` and `$$ $$`.
- EB Garamond styling for writing surfaces and compatible math text.
- `ava-writing` blocks with native copy action.
- Dedicated code cards with language label and copy button.
- Widget extraction rebuilt from every completed answer.
- Pretty table widget restored with sticky header and horizontal scrolling.
- Voix, TTS, web, image generation, image groups, and multi-attachment delivery preserved.


## v5.0.1 — KaTeX deterministic rendering fix

Causas corrigidas:
1. `app.js` executava antes dos scripts `defer` do KaTeX.
2. Markdown transformava quebras de linha em `<br>` antes do auto-render, quebrando `\[ ... \]`.

Agora:
- `app.js` também usa `defer`, respeitando a ordem KaTeX → auto-render → Ava.
- LaTeX é protegido antes da conversão Markdown.
- `\( ... \)`, `\[ ... \]` e `$$ ... $$` viram placeholders `.ava-math`.
- A Ava chama `katex.render()` diretamente em cada placeholder.
- Se o KaTeX ainda não estiver pronto, tenta novamente por até 2 segundos.
- No evento `window.load`, matemática de mensagens já renderizadas é processada novamente.
- Matemática dentro de writing blocks usa o mesmo pipeline.


## v5.1 — Avalynx Studio + semantic auto rename

### Auto Rename
- Chats remain `Novo chat` while the first answer is being generated.
- The title is generated only after the first completed assistant response.
- Auto Rename uses `openrouter/free`, regardless of the model currently selected.
- It reads the first conversation exchange instead of copying the first user message.
- Prompt explicitly prohibits literal copying of the first message.
- If the AI title fails, a local keyword-based fallback summarizes the topic.
- A fallback title may be upgraded once after the second exchange.

### Avalynx Studio
- Create, edit, save and delete local agents.
- Agent fields: name, symbol, description, instructions, model.
- Per-agent capabilities: Web, Images, Files and Avalynx Voix.
- Activate an agent for the current conversation.
- New chats inherit the currently selected Studio agent.
- Each chat persists its `agentId`.
- Agent instructions are appended to the Ava I system prompt.
- Agents can override the OpenRouter model for their chats.
- Studio data is stored locally in `avai_agents`.


## v5.2 — Vercel + Render server deployment

The frontend no longer needs provider secrets when a server is configured.

### Environment variables

Server-only:

- `OPENROUTER_API_KEY`
- `ELEVENLABS_API_KEY`
- `AVA_PUBLIC_URL`
- `OPENROUTER_APP_NAME`

Never place provider secrets in `app.js`, `manifest.webmanifest`, or variables exposed to browser builds.

### Vercel

1. Push this folder to a Git repository.
2. Import the repository into Vercel.
3. Add `OPENROUTER_API_KEY` and `ELEVENLABS_API_KEY` in Project Settings → Environment Variables.
4. Add `AVA_PUBLIC_URL` after the project has a production URL/domain.
5. Deploy.

`vercel.json` routes `/api/openrouter/*` and `/api/eleven/*` through the server-side function `api/proxy.mjs`.

### Render

Option A: Blueprint using `render.yaml`.
Option B: Create a Node Web Service manually.

- Build command: `npm run check`
- Start command: `npm start`
- Environment variables: same as above.

Render provides `PORT`; `server.mjs` binds to `0.0.0.0` and uses it automatically.

### 502 handling

The server proxy retries OpenRouter chat-completion responses with status `502`, `503`, or `504` up to two additional times with a short backoff. Provider errors are still returned to the Ava UI instead of being silently hidden.

### Security

The browser calls only same-origin `/api/*` routes. Provider credentials are injected server-side from environment variables.


## v5.2.1 — Vercel `document is not defined` fix

### Root cause

Vercel was invoking the browser-side `app.js` inside the Node.js runtime. Since that file immediately accesses `document`, the function crashed with:

`ReferenceError: document is not defined`

### Fix

- Added an explicit static build step.
- Browser assets are copied to `dist/`.
- `vercel.json` sets `outputDirectory` to `dist`.
- Only files under `/api` are server-side functions.
- Non-API routes rewrite to `/index.html`.
- Node is pinned to `22.x`.
- Render remains supported through `server.mjs`.
