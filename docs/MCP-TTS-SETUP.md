# Avalynx v7.3 — configuração de Ava Voice e MCPs

## Ava Voice
Qwen3-TTS self-hosted não precisa de API key. Rode `services/ava-voice` e configure `AVA_TTS_UPSTREAM_URL`. O endpoint público já é `POST /v1/chat/voice/tts`.

## Google Workspace
1. Entre no Google Cloud Console e crie/selecione um projeto.
2. Entre no Workspace Developer Preview se o MCP ainda estiver marcado como preview.
3. Para Gmail, habilite `gmail.googleapis.com` e `gmailmcp.googleapis.com`.
4. Configure Google Auth Platform > Branding / Audience / Data Access.
5. Crie um OAuth Client do tipo Web Application.
6. Copie Client ID e Client Secret para `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET`.
7. O Gmail MCP oficial já está em `https://gmailmcp.googleapis.com/mcp/v1`.
8. Cada usuário ainda precisa autorizar a própria conta via OAuth; client ID/secret não substituem o login do usuário.

## Microsoft 365
1. Microsoft Entra admin center > Identity > Applications > App registrations > New registration.
2. Copie Application (client) ID para `MICROSOFT_CLIENT_ID`.
3. Certificates & secrets > New client secret; copie o VALUE para `MICROSOFT_CLIENT_SECRET`.
4. Configure permissões Microsoft Graph mínimas.
5. Para o registry MCP atual, aponte `MCP_MICROSOFT_URL` para seu gateway MCP sobre Graph e use `MCP_MICROSOFT_TOKEN`.

## Slack
1. Slack API > Your Apps > Create New App > From scratch.
2. Basic Information: copie Client ID, Client Secret e Signing Secret.
3. Configure OAuth & Permissions e Redirect URL.
4. Preencha `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`.
5. O token obtido após instalar/autorizar o app é por workspace/usuário; para o registry, use seu MCP gateway em `MCP_SLACK_URL`.

## Zoom
1. Zoom App Marketplace/Developer > crie um OAuth app.
2. Configure Redirect URL, Client ID e Client Secret.
3. Preencha `ZOOM_CLIENT_ID` e `ZOOM_CLIENT_SECRET`.
4. O MCP oficial de Meetings já está como `https://zoom.us/mcp/meeting/streamable`.
5. Zoom MCP usa OAuth 2.1 + PKCE; o usuário precisa autorizar.

## Spotify
1. Spotify for Developers > Dashboard > Create app.
2. Configure Redirect URI.
3. Copie Client ID e Client Secret para `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`.
4. Para playlists/biblioteca/playback, use Authorization Code e tokens por usuário. Client Credentials não acessa recursos pessoais.
5. Aponte `MCP_SPOTIFY_URL` para seu adapter MCP sobre Spotify Web API.

## Apple Music
1. Apple Developer > Certificates, Identifiers & Profiles.
2. Crie a key usada pelo MusicKit/Apple Music e baixe o `.p8`.
3. Copie Team ID, Key ID e guarde o caminho do `.p8` em `APPLE_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY_PATH`.
4. O backend assina developer tokens ES256; biblioteca de assinante também exige autorização do usuário.

## Shazam
1. Apple Developer > Certificates, Identifiers & Profiles.
2. Ative ShazamKit no App ID quando aplicável.
3. Crie um Media Identifier e private key.
4. Preencha `SHAZAM_MEDIA_ID`, `SHAZAM_KEY_ID`, `SHAZAM_PRIVATE_KEY_PATH`.
5. Aponte `MCP_SHAZAM_URL` para o adapter MCP que encapsula ShazamKit.

## Canva
1. O MCP oficial remoto é `https://mcp.canva.com/mcp`.
2. Cada usuário precisa autenticar individualmente.
3. O método MCP recomendado é CIMD, que pode dispensar secret pré-registrado.
4. Se usar Canva Connect API, Developer Portal > crie Integration, gere Client ID/Secret, scopes e Redirect URL; preencha `CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET`.

## Adobe
1. Adobe Developer Console > Create Project.
2. Adicione a API Adobe específica que a Avalynx realmente usará.
3. Quando suportado, use OAuth Server-to-Server.
4. Copie Client ID, Client Secret e scopes para `ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET`, `ADOBE_SCOPES`.
5. Para expor tools no Ava Chat, aponte `MCP_ADOBE_URL` para o gateway/MCP do produto Adobe escolhido.

## Segurança
Nunca coloque client secrets, `.p8`, refresh tokens ou tokens MCP em `app.js`, `index.html`, localStorage ou variáveis públicas. Eles ficam no backend.
