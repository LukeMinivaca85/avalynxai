const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
function send(res,status,payload){res.statusCode=status;Object.entries(JSON_HEADERS).forEach(([k,v])=>res.setHeader(k,v));res.setHeader("cache-control","no-store");res.end(JSON.stringify(payload));}
async function readBody(req){if(req.body&&typeof req.body==="object")return req.body;let raw="";for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{return {}}}
function cfg(){return {url:String(process.env.SUPABASE_URL||"").replace(/\/$/,""),key:process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||""}}
function configured(c){return Boolean(c.url&&c.key)}
function headers(c){return {apikey:c.key,authorization:`Bearer ${c.key}`,"content-type":"application/json",accept:"application/json"}}
function safeUserId(req,body={}){return String(body.user_id||req.headers["x-avalynx-user-id"]||"local-user").slice(0,160)}
function tokenize(text){return [...new Set(String(text||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9]+/).filter(x=>x.length>=3))]}
function scoreMemory(memory,queryTokens){const mt=tokenize(`${memory.content||""} ${memory.tags?.join?.(" ")||""}`);if(!mt.length||!queryTokens.length)return Number(memory.importance||0);const set=new Set(mt);return queryTokens.filter(t=>set.has(t)).length*5+Number(memory.importance||0)+(memory.scope==="user"?1:0)}
async function supa(c,path,options={}){const r=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{...headers(c),...(options.headers||{})}});const text=await r.text();let data;try{data=text?JSON.parse(text):null}catch{data={raw:text}}if(!r.ok)throw Object.assign(new Error(data?.message||data?.error||text||`Supabase ${r.status}`),{status:r.status});return data}
function sanitizeContent(text){return String(text||"").trim().replace(/\b(sk-[A-Za-z0-9_-]{12,}|hf_[A-Za-z0-9]{12,}|nvapi-[A-Za-z0-9_-]{12,})\b/g,"[REDACTED_SECRET]").slice(0,4000)}
export default async function handler(req,res){
 const c=cfg();if(!configured(c))return send(res,503,{ok:false,configured:false,error:"Supabase memory backend is not configured."});
 const url=new URL(req.url,"http://localhost");const body=req.method==="GET"?{}:await readBody(req);const userId=safeUserId(req,body);
 try{
  if(req.method==="GET"){
   const q=String(url.searchParams.get("q")||"").slice(0,1000);const scope=String(url.searchParams.get("scope")||"").slice(0,32);const limit=Math.min(40,Math.max(1,Number(url.searchParams.get("limit")||12)));const now=new Date().toISOString();
   let path=`avalynx_memories?user_id=eq.${encodeURIComponent(userId)}&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(now)})&order=importance.desc,updated_at.desc&limit=80`;if(scope)path+=`&scope=eq.${encodeURIComponent(scope)}`;
   const rows=await supa(c,path);const tokens=tokenize(q);const ranked=(Array.isArray(rows)?rows:[]).map(m=>({...m,_score:scoreMemory(m,tokens)})).sort((a,b)=>b._score-a._score).slice(0,limit).map(({_score,...m})=>m);return send(res,200,{ok:true,data:ranked});
  }
  if(req.method==="POST"){
   const action=String(body.action||"create");
   if(action==="create"){
    const content=sanitizeContent(body.content);if(!content||content==="[REDACTED_SECRET]")return send(res,400,{ok:false,error:"Nothing safe to store."});
    const scope=["user","project","temporary"].includes(body.scope)?body.scope:"user";const expiresAt=scope==="temporary"?(body.expires_at||new Date(Date.now()+7*86400000).toISOString()):(body.expires_at||null);
    const row={user_id:userId,scope,project_id:body.project_id||null,content,tags:Array.isArray(body.tags)?body.tags.slice(0,16):[],importance:Math.max(0,Math.min(10,Number(body.importance??5))),source_chat_id:body.source_chat_id||null,expires_at:expiresAt};
    const created=await supa(c,"avalynx_memories",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(row)});return send(res,200,{ok:true,data:Array.isArray(created)?created[0]:created});
   }
   if(action==="delete"){const id=String(body.id||"");if(!id)return send(res,400,{ok:false,error:"id required"});await supa(c,`avalynx_memories?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,{method:"DELETE"});return send(res,200,{ok:true})}
   if(action==="clear"){await supa(c,`avalynx_memories?user_id=eq.${encodeURIComponent(userId)}`,{method:"DELETE"});return send(res,200,{ok:true})}
   return send(res,400,{ok:false,error:"Unknown action"});
  }
  return send(res,405,{ok:false,error:"Method not allowed"});
 }catch(error){return send(res,error.status||500,{ok:false,error:String(error.message||error)})}
}
