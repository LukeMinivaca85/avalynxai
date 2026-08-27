import crypto from "node:crypto";

const pending=new Map();
const SESSION_TTL_MS=7*24*60*60*1000;

function env(name,fallback=""){return String(process.env[name]||fallback).trim()}
function json(res,status,data){
  res.statusCode=status;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");
  res.end(JSON.stringify(data));
}
function cookie(req,name){
  const raw=String(req.headers.cookie||"");
  for(const part of raw.split(";")){
    const [k,...v]=part.trim().split("=");
    if(k===name)return decodeURIComponent(v.join("="));
  }
  return "";
}
function setCookie(res,value,maxAge=SESSION_TTL_MS){
  const secure=env("NODE_ENV")==="production" ? "; Secure" : "";
  res.setHeader("set-cookie",`ava_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge/1000)}${secure}`);
}
function clearCookie(res){res.setHeader("set-cookie","ava_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")}
function b64url(buf){return Buffer.from(buf).toString("base64url")}
function sha256(value){return crypto.createHash("sha256").update(value).digest()}
function random(n=32){return b64url(crypto.randomBytes(n))}
function signSession(profile){
  const c=config();
  if(!c.sessionSecret)throw new Error("LUKINTOSH_SESSION_SECRET is not configured.");
  const payload=b64url(Buffer.from(JSON.stringify({
    sub:String(profile.sub),
    name:String(profile.name||""),
    email:String(profile.email||""),
    picture:String(profile.picture||""),
    exp:Date.now()+SESSION_TTL_MS
  })));
  const sig=crypto.createHmac("sha256",c.sessionSecret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifySession(token){
  try{
    const c=config();if(!c.sessionSecret)return null;
    const [payload,sig]=String(token||"").split(".");
    if(!payload||!sig)return null;
    const expected=crypto.createHmac("sha256",c.sessionSecret).update(payload).digest("base64url");
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if(!data.sub||Number(data.exp||0)<Date.now())return null;
    return data;
  }catch{return null}
}
function config(){
  return {
    issuer:env("LUKINTOSH_OIDC_ISSUER","https://myaccount.lukintosh.com").replace(/\/$/,""),
    clientId:env("LUKINTOSH_OIDC_CLIENT_ID"),
    clientSecret:env("LUKINTOSH_OIDC_CLIENT_SECRET"),
    sessionSecret:env("LUKINTOSH_SESSION_SECRET"),
    redirectUri:env("LUKINTOSH_OIDC_REDIRECT_URI"),
    scope:env("LUKINTOSH_OIDC_SCOPE","openid profile email")
  };
}
let discoveryCache={at:0,data:null};
async function discovery(){
  const c=config();
  if(discoveryCache.data&&Date.now()-discoveryCache.at<3600000)return discoveryCache.data;
  const r=await fetch(`${c.issuer}/.well-known/openid-configuration`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new Error(`OIDC discovery HTTP ${r.status}`);
  const data=await r.json();
  discoveryCache={at:Date.now(),data};
  return data;
}
function publicOrigin(req){
  const proto=String(req.headers["x-forwarded-proto"]||"http").split(",")[0];
  const host=req.headers["x-forwarded-host"]||req.headers.host||"localhost:3000";
  return `${proto}://${host}`;
}
function redirectUri(req){
  const c=config();
  return c.redirectUri||`${publicOrigin(req)}/api/auth/callback`;
}
function validReturnTo(value,req){
  try{
    const u=new URL(value,publicOrigin(req));
    const allowedOrigin=env("LUKINTOSH_APP_ORIGIN",publicOrigin(req)).replace(/\/$/,"");
    return u.origin===allowedOrigin ? u.href : `${allowedOrigin}/`;
  }catch{return `${publicOrigin(req)}/`}
}
async function currentSession(req){
  const data=verifySession(cookie(req,"ava_session"));
  if(!data)return null;
  return {sub:String(data.sub),profile:{sub:data.sub,name:data.name||"",email:data.email||"",picture:data.picture||""},expiresAt:Number(data.exp)};
}
function syncConfig(){
  return {
    url:env("SUPABASE_URL").replace(/\/$/,""),
    key:env("SUPABASE_SERVICE_ROLE_KEY")
  };
}
async function supa(path,options={}){
  const c=syncConfig();
  if(!c.url||!c.key)throw new Error("Supabase sync backend is not configured.");
  const r=await fetch(`${c.url}/rest/v1/${path}`,{
    ...options,
    headers:{
      apikey:c.key,authorization:`Bearer ${c.key}`,"content-type":"application/json",accept:"application/json",
      ...(options.headers||{})
    }
  });
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data={raw:text}}
  if(!r.ok)throw new Error(data?.message||data?.error||`Supabase ${r.status}`);
  return data;
}

export async function handleAccountSync(req,res,url){
  if(url.pathname==="/api/auth/config"&&req.method==="GET"){
    const c=config();
    const ready=Boolean(c.clientId&&c.sessionSecret);
    let discovered=false;
    if(ready){try{await discovery();discovered=true}catch{}}
    return json(res,200,{issuer:c.issuer,configured:ready,discovery:discovered,login_url:"/api/auth/login"});
  }

  if(url.pathname==="/api/auth/login"&&req.method==="GET"){
    const c=config();
    if(!c.clientId)return json(res,503,{ok:false,error:"LUKINTOSH_OIDC_CLIENT_ID is not configured."});
    let d;try{d=await discovery()}catch(error){return json(res,502,{ok:false,error:`myaccount.lukintosh.com OIDC indisponível: ${error.message}`})}
    const state=random(24),verifier=random(48),nonce=random(24);
    const returnTo=validReturnTo(url.searchParams.get("return_to")||publicOrigin(req),req);
    pending.set(state,{verifier,nonce,returnTo,expiresAt:Date.now()+10*60*1000});
    const auth=new URL(d.authorization_endpoint);
    auth.searchParams.set("response_type","code");
    auth.searchParams.set("client_id",c.clientId);
    auth.searchParams.set("redirect_uri",redirectUri(req));
    auth.searchParams.set("scope",c.scope);
    auth.searchParams.set("state",state);
    auth.searchParams.set("nonce",nonce);
    auth.searchParams.set("code_challenge",b64url(sha256(verifier)));
    auth.searchParams.set("code_challenge_method","S256");
    res.statusCode=302;res.setHeader("location",auth.href);res.end();return;
  }

  if(url.pathname==="/api/auth/callback"&&req.method==="GET"){
    const c=config();const state=url.searchParams.get("state")||"";const code=url.searchParams.get("code")||"";
    const p=pending.get(state);pending.delete(state);
    if(!p||p.expiresAt<Date.now()||!code)return json(res,400,{ok:false,error:"Invalid or expired login callback."});
    try{
      const d=await discovery();
      const form=new URLSearchParams({
        grant_type:"authorization_code",code,redirect_uri:redirectUri(req),
        client_id:c.clientId,code_verifier:p.verifier
      });
      if(c.clientSecret)form.set("client_secret",c.clientSecret);
      const tr=await fetch(d.token_endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form,signal:AbortSignal.timeout(8000)});
      const tok=await tr.json().catch(()=>({}));
      if(!tr.ok||!tok.access_token)throw new Error(tok.error_description||tok.error||`token HTTP ${tr.status}`);
      let profile={};
      if(d.userinfo_endpoint){
        const ur=await fetch(d.userinfo_endpoint,{headers:{authorization:`Bearer ${tok.access_token}`,accept:"application/json"},signal:AbortSignal.timeout(5000)});
        if(ur.ok)profile=await ur.json();
      }
      if(!profile.sub)throw new Error("OIDC provider must expose a userinfo endpoint with a stable sub claim.");
      const safeProfile={sub:String(profile.sub),name:profile.name||profile.preferred_username||"",email:profile.email||"",picture:profile.picture||""};
      setCookie(res,signSession(safeProfile));
      res.statusCode=302;res.setHeader("location",p.returnTo);res.end();return;
    }catch(error){return json(res,502,{ok:false,error:`Login failed: ${error.message}`})}
  }

  if(url.pathname==="/api/auth/me"&&req.method==="GET"){
    const s=await currentSession(req);
    return json(res,200,s?{authenticated:true,user:s.profile}:{authenticated:false,user:null});
  }

  if(url.pathname==="/api/auth/logout"&&req.method==="POST"){
    clearCookie(res);return json(res,200,{ok:true});
  }

  if(url.pathname==="/api/sync"&&req.method==="GET"){
    const s=await currentSession(req);if(!s)return json(res,401,{ok:false,error:"Not authenticated"});
    try{
      const rows=await supa(`avalynx_user_sync?user_sub=eq.${encodeURIComponent(s.sub)}&select=payload,updated_at&limit=1`);
      return json(res,200,{ok:true,data:Array.isArray(rows)&&rows[0]?rows[0]:null});
    }catch(error){return json(res,503,{ok:false,error:error.message})}
  }

  if(url.pathname==="/api/sync"&&req.method==="PUT"){
    const s=await currentSession(req);if(!s)return json(res,401,{ok:false,error:"Not authenticated"});
    let raw="";for await(const chunk of req)raw+=chunk;
    let body={};try{body=raw?JSON.parse(raw):{}}catch{return json(res,400,{ok:false,error:"Invalid JSON"})}
    const payload=body.payload;
    if(!payload||typeof payload!=="object")return json(res,400,{ok:false,error:"payload required"});
    const size=Buffer.byteLength(JSON.stringify(payload));
    if(size>4_000_000)return json(res,413,{ok:false,error:"Sync payload too large"});
    try{
      const row={user_sub:s.sub,payload,updated_at:new Date().toISOString()};
      const data=await supa("avalynx_user_sync?on_conflict=user_sub",{
        method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(row)
      });
      return json(res,200,{ok:true,data:Array.isArray(data)?data[0]:data});
    }catch(error){return json(res,503,{ok:false,error:error.message})}
  }

  return false;
}
