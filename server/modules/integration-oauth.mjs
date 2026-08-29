import crypto from "node:crypto";
import { currentSession, supa } from "./account-sync.mjs";

function env(name, fallback=""){ return String(process.env[name] || fallback).trim(); }
function json(res,status,data){
  res.statusCode=status;
  res.setHeader("content-type","application/json; charset=utf-8");
  res.setHeader("cache-control","no-store");
  res.end(JSON.stringify(data));
}
function origin(req){
  const proto=String(req.headers["x-forwarded-proto"]||"http").split(",")[0];
  const host=req.headers["x-forwarded-host"]||req.headers.host||"localhost:3000";
  return `${proto}://${host}`;
}
function safeReturnTo(raw,req){
  try{
    const base=env("LUKINTOSH_APP_ORIGIN",origin(req)).replace(/\/$/,"");
    const u=new URL(raw||base,base);
    return u.origin===new URL(base).origin ? u.href : `${base}/`;
  }catch{return `${origin(req)}/`;}
}
function b64url(v){return Buffer.from(v).toString("base64url")}
function random(n=32){return b64url(crypto.randomBytes(n))}
function sha256(v){return crypto.createHash("sha256").update(v).digest()}
function key(){
  const raw=env("INTEGRATIONS_ENCRYPTION_KEY") || env("LUKINTOSH_SESSION_SECRET");
  if(!raw) throw new Error("INTEGRATIONS_ENCRYPTION_KEY or LUKINTOSH_SESSION_SECRET is required.");
  return crypto.createHash("sha256").update(raw).digest();
}
function seal(obj){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
  const plain=Buffer.from(JSON.stringify(obj));
  const enc=Buffer.concat([cipher.update(plain),cipher.final()]);
  const tag=cipher.getAuthTag();
  return `${b64url(iv)}.${b64url(tag)}.${b64url(enc)}`;
}
function open(token){
  const [ivS,tagS,dataS]=String(token||"").split(".");
  if(!ivS||!tagS||!dataS) throw new Error("Invalid encrypted state");
  const iv=Buffer.from(ivS,"base64url"),tag=Buffer.from(tagS,"base64url"),data=Buffer.from(dataS,"base64url");
  const d=crypto.createDecipheriv("aes-256-gcm",key(),iv);d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data),d.final()]).toString("utf8"));
}

const PROVIDERS={
  google:{
    id:"google",
    clientId:"GOOGLE_OAUTH_CLIENT_ID",clientSecret:"GOOGLE_OAUTH_CLIENT_SECRET",
    authorize:"https://accounts.google.com/o/oauth2/v2/auth",
    token:"https://oauth2.googleapis.com/token",
    scopesEnv:"GOOGLE_OAUTH_SCOPES",
    defaultScopes:"openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly",
    authExtra:{access_type:"offline",prompt:"consent"},
    tokenAuth:"body",pkce:true
  },
  microsoft:{
    id:"microsoft",
    clientId:"MICROSOFT_CLIENT_ID",clientSecret:"MICROSOFT_CLIENT_SECRET",
    authorize:()=>`https://login.microsoftonline.com/${env("MICROSOFT_TENANT_ID","common")}/oauth2/v2.0/authorize`,
    token:()=>`https://login.microsoftonline.com/${env("MICROSOFT_TENANT_ID","common")}/oauth2/v2.0/token`,
    scopesEnv:"MICROSOFT_SCOPES",
    defaultScopes:"openid profile email offline_access User.Read Mail.Read Calendars.Read Files.Read",
    tokenAuth:"body",pkce:true
  },
  slack:{
    id:"slack",
    clientId:"SLACK_CLIENT_ID",clientSecret:"SLACK_CLIENT_SECRET",
    authorize:"https://slack.com/oauth/v2/authorize",
    token:"https://slack.com/api/oauth.v2.access",
    scopesEnv:"SLACK_SCOPES",
    defaultScopes:"channels:read,channels:history,groups:read,groups:history,im:history,mpim:history,users:read",
    scopeSeparator:",",tokenAuth:"body",pkce:false
  },
  zoom:{
    id:"zoom",
    clientId:"ZOOM_CLIENT_ID",clientSecret:"ZOOM_CLIENT_SECRET",
    authorize:"https://zoom.us/oauth/authorize",
    token:"https://zoom.us/oauth/token",
    scopesEnv:"ZOOM_SCOPES",defaultScopes:"",
    tokenAuth:"basic",pkce:true
  },
  spotify:{
    id:"spotify",
    clientId:"SPOTIFY_CLIENT_ID",clientSecret:"SPOTIFY_CLIENT_SECRET",
    authorize:"https://accounts.spotify.com/authorize",
    token:"https://accounts.spotify.com/api/token",
    scopesEnv:"SPOTIFY_SCOPES",
    defaultScopes:"user-read-email user-read-private user-library-read playlist-read-private playlist-modify-private playlist-modify-public user-read-playback-state user-modify-playback-state",
    tokenAuth:"basic",pkce:true
  },
  canva:{
    id:"canva",
    clientId:"CANVA_CLIENT_ID",clientSecret:"CANVA_CLIENT_SECRET",
    authorize:"https://www.canva.com/api/oauth/authorize",
    token:"https://api.canva.com/rest/v1/oauth/token",
    scopesEnv:"CANVA_SCOPES",defaultScopes:"",
    tokenAuth:"basic",pkce:true
  },
  adobe:{
    id:"adobe",
    clientId:"ADOBE_CLIENT_ID",clientSecret:"ADOBE_CLIENT_SECRET",
    authorize:()=>env("ADOBE_AUTHORIZE_URL","https://ims-na1.adobelogin.com/ims/authorize/v2"),
    token:()=>env("ADOBE_TOKEN_URL","https://ims-na1.adobelogin.com/ims/token/v3"),
    scopesEnv:"ADOBE_SCOPES",defaultScopes:"openid",
    tokenAuth:"body",pkce:true
  }
};

export function supportedIntegrationProviders(){return Object.keys(PROVIDERS)}
function provider(id){return PROVIDERS[String(id||"").toLowerCase()]||null}
function value(v){return typeof v==="function"?v():v}
function callbackUri(req,id){return `${env("AVA_PUBLIC_URL",origin(req)).replace(/\/$/,"")}/v1/integrations/${id}/callback`}
function configured(p){return Boolean(env(p.clientId)&&env(p.clientSecret))}

async function saveConnection(userSub,id,tok){
  const now=Date.now();
  const expiresAt=tok.expires_in ? new Date(now+Number(tok.expires_in)*1000).toISOString() : null;
  const payload={
    user_sub:userSub,provider:id,
    access_token_enc:seal({v:String(tok.access_token||"")}),
    refresh_token_enc:tok.refresh_token?seal({v:String(tok.refresh_token)}):null,
    token_type:String(tok.token_type||"Bearer"),
    scope:String(tok.scope||""),
    expires_at:expiresAt,
    metadata:tok.team?{team:tok.team}:tok.authed_user?{authed_user:tok.authed_user}: {},
    updated_at:new Date().toISOString()
  };
  await supa("avalynx_integration_connections?on_conflict=user_sub,provider",{
    method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(payload)
  });
}

async function rowFor(userSub,id){
  const rows=await supa(`avalynx_integration_connections?user_sub=eq.${encodeURIComponent(userSub)}&provider=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return Array.isArray(rows)&&rows[0]?rows[0]:null;
}

async function tokenRequest(p,params){
  const body=new URLSearchParams(params);
  const headers={"content-type":"application/x-www-form-urlencoded",accept:"application/json"};
  if(p.tokenAuth==="basic") headers.authorization=`Basic ${Buffer.from(`${env(p.clientId)}:${env(p.clientSecret)}`).toString("base64")}`;
  else {body.set("client_id",env(p.clientId));body.set("client_secret",env(p.clientSecret));}
  const r=await fetch(value(p.token),{method:"POST",headers,body,signal:AbortSignal.timeout(12000)});
  const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={raw}}
  if(!r.ok||data.error||!data.access_token) throw new Error(data.error_description||data.message||data.error||`Token HTTP ${r.status}`);
  return data;
}

async function refreshIfNeeded(userSub,id,row){
  if(!row) return null;
  const access=open(row.access_token_enc).v;
  const expiry=row.expires_at?Date.parse(row.expires_at):0;
  if(!expiry||expiry>Date.now()+60_000) return {accessToken:access,row};
  if(!row.refresh_token_enc) return {accessToken:access,row,expired:true};
  const p=provider(id);if(!p)return null;
  const refresh=open(row.refresh_token_enc).v;
  const params={grant_type:"refresh_token",refresh_token:refresh};
  const scopes=env(p.scopesEnv,p.defaultScopes);if(scopes)params.scope=scopes;
  const tok=await tokenRequest(p,params);
  if(!tok.refresh_token)tok.refresh_token=refresh;
  await saveConnection(userSub,id,tok);
  const fresh=await rowFor(userSub,id);
  return {accessToken:open(fresh.access_token_enc).v,row:fresh};
}

export async function getIntegrationAccessToken(req,id){
  const session=await currentSession(req);if(!session)return null;
  const row=await rowFor(session.sub,id);if(!row)return null;
  try{return (await refreshIfNeeded(session.sub,id,row))?.accessToken||null}catch{return null}
}

export async function handleIntegrationOAuth(req,res,url){
  const m=url.pathname.match(/^\/v1\/integrations\/([a-z0-9-]+)\/(connect|callback|status|disconnect)$/i);
  if(!m)return false;
  const id=m[1].toLowerCase(),action=m[2].toLowerCase(),p=provider(id);
  if(!p)return json(res,404,{ok:false,error:"Unknown integration provider",provider:id});

  if(action==="callback"){
    const stateToken=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"",oauthError=url.searchParams.get("error")||"";
    let state;try{state=open(stateToken)}catch{return json(res,400,{ok:false,error:"Invalid OAuth state"})}
    if(state.provider!==id||state.exp<Date.now())return json(res,400,{ok:false,error:"Expired or mismatched OAuth state"});
    if(oauthError)return json(res,400,{ok:false,error:oauthError,detail:url.searchParams.get("error_description")||""});
    if(!code)return json(res,400,{ok:false,error:"Missing authorization code"});
    try{
      const params={grant_type:"authorization_code",code,redirect_uri:callbackUri(req,id)};
      if(p.pkce&&state.verifier)params.code_verifier=state.verifier;
      const tok=await tokenRequest(p,params);
      await saveConnection(state.userSub,id,tok);
      res.statusCode=302;res.setHeader("location",state.returnTo||`${origin(req)}/`);res.end();return;
    }catch(error){return json(res,502,{ok:false,error:`${id} OAuth callback failed`,detail:String(error.message||error)})}
  }

  const session=await currentSession(req);
  if(!session)return json(res,401,{ok:false,error:"Sign in to Avalynx before connecting integrations."});

  if(action==="connect"){
    if(req.method!=="GET")return json(res,405,{ok:false,error:"Method not allowed"});
    if(!configured(p))return json(res,503,{ok:false,error:`${p.clientId} / ${p.clientSecret} are not configured.`});
    const verifier=p.pkce?random(48):"";
    const state=seal({provider:id,userSub:session.sub,verifier,returnTo:safeReturnTo(url.searchParams.get("return_to"),req),exp:Date.now()+10*60*1000});
    const auth=new URL(value(p.authorize));
    auth.searchParams.set("response_type","code");auth.searchParams.set("client_id",env(p.clientId));auth.searchParams.set("redirect_uri",callbackUri(req,id));auth.searchParams.set("state",state);
    const scopes=env(p.scopesEnv,p.defaultScopes);if(scopes)auth.searchParams.set("scope",scopes);
    if(p.pkce){auth.searchParams.set("code_challenge",b64url(sha256(verifier)));auth.searchParams.set("code_challenge_method","S256");}
    for(const [k,v] of Object.entries(p.authExtra||{}))auth.searchParams.set(k,v);
    res.statusCode=302;res.setHeader("location",auth.href);res.end();return;
  }

  if(action==="status"&&req.method==="GET"){
    let row=null;try{row=await rowFor(session.sub,id)}catch(error){return json(res,503,{ok:false,error:error.message})}
    return json(res,200,{ok:true,provider:id,configured:configured(p),connected:Boolean(row),scope:row?.scope||"",expires_at:row?.expires_at||null,callback_url:callbackUri(req,id)});
  }

  if(action==="disconnect"&&req.method==="POST"){
    try{await supa(`avalynx_integration_connections?user_sub=eq.${encodeURIComponent(session.sub)}&provider=eq.${encodeURIComponent(id)}`,{method:"DELETE"});return json(res,200,{ok:true,provider:id,connected:false})}
    catch(error){return json(res,503,{ok:false,error:error.message})}
  }

  return json(res,405,{ok:false,error:"Method not allowed"});
}
