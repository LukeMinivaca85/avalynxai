# Avalynx OAuth Account Connector

## 1. Rode a migration do Supabase

Execute `supabase/avalynx_integrations.sql` no SQL Editor do seu projeto Supabase.

## 2. Configure segredos

No ambiente do servidor, preencha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LUKINTOSH_SESSION_SECRET` e `INTEGRATIONS_ENCRYPTION_KEY`.
Nunca exponha esses valores no frontend.

## 3. Callbacks para cadastrar nos provedores

- Google: `https://ai.lukintosh.com/v1/integrations/google/callback`
- Microsoft: `https://ai.lukintosh.com/v1/integrations/microsoft/callback`
- Slack: `https://ai.lukintosh.com/v1/integrations/slack/callback`
- Zoom: `https://ai.lukintosh.com/v1/integrations/zoom/callback`
- Spotify: `https://ai.lukintosh.com/v1/integrations/spotify/callback`
- Canva: `https://ai.lukintosh.com/v1/integrations/canva/callback`
- Adobe: `https://ai.lukintosh.com/v1/integrations/adobe/callback`

Apple Music e ShazamKit não usam este mesmo callback OAuth web. Eles precisam de adapters específicos MusicKit/ShazamKit.

## 4. Endpoints da Avalynx

Para um usuário já logado na conta Lukintosh:

`GET /v1/integrations/spotify/connect?return_to=https://ai.lukintosh.com/`

redireciona para o consentimento do Spotify.

Status:

`GET /v1/integrations/spotify/status`

Desconectar:

`POST /v1/integrations/spotify/disconnect`

Troque `spotify` por `google`, `microsoft`, `slack`, `zoom`, `canva` ou `adobe`.

## 5. Segurança implementada

- OAuth state é criptografado com AES-256-GCM.
- PKCE S256 é usado nos provedores compatíveis.
- Access token e refresh token ficam criptografados antes de serem enviados ao Supabase.
- A tabela de tokens fica com RLS ligado e sem policy de cliente.
- O navegador nunca recebe Client Secret nem refresh token.

## 6. Observação sobre scopes

Os defaults do `.env.example` são conservadores. Ajuste scopes de escrita apenas quando a funcionalidade realmente exigir.
Zoom, Canva e Adobe variam bastante por produto/app; copie os scopes habilitados no console do próprio provedor para as variáveis `*_SCOPES`.
