import assert from "node:assert/strict";
import fs from "node:fs/promises";
const source=await fs.readFile(new URL("../server/modules/account-sync.mjs",import.meta.url),"utf8");
const sql=await fs.readFile(new URL("../supabase/avalynx_sync.sql",import.meta.url),"utf8");

assert.match(source,/https:\/\/myaccount\.lukintosh\.com/);
assert.match(source,/code_challenge_method","S256"/);
assert.match(source,/LUKINTOSH_SESSION_SECRET/);
assert.match(source,/timingSafeEqual/);
assert.match(source,/HttpOnly/);
assert.match(source,/SameSite=Lax/);
assert.match(source,/userinfo endpoint with a stable sub claim/);
assert.match(source,/SUPABASE_SERVICE_ROLE_KEY/);
assert.match(source,/LUKINTOSH_APP_ORIGIN/);
assert.match(source,/u\.origin===allowedOrigin/);
assert.match(sql,/avalynx_user_sync/);
assert.doesNotMatch(source,/localStorage/);
console.log("✓ OIDC PKCE + signed session + server-side sync regression");
