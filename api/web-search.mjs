function send(res,status,payload){
  res.statusCode=status;
  res.setHeader("content-type","application/json; charset=utf-8");
  res.setHeader("cache-control","no-store");
  res.end(JSON.stringify(payload));
}
function clean(s){return String(s||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function decodeEntities(s){
  return String(s||"")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function safeUrl(raw){
  try{
    let u=new URL(raw);
    // DuckDuckGo redirects external results through uddg.
    if(u.hostname.endsWith("duckduckgo.com") && u.searchParams.get("uddg")){
      u=new URL(decodeURIComponent(u.searchParams.get("uddg")));
    }
    if(!["http:","https:"].includes(u.protocol))return "";
    return u.href;
  }catch{return ""}
}
async function ddgSearch(query,limit=6){
  const url=`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const r=await fetch(url,{
    headers:{
      "user-agent":"Mozilla/5.0 (compatible; AvalynxWeb/1.0; +https://ai.lukintosh.com)",
      "accept":"text/html,application/xhtml+xml"
    }
  });
  if(!r.ok)throw new Error(`DuckDuckGo ${r.status}`);
  const html=await r.text();
  const results=[];
  const blocks=html.split(/class="result results_links/i).slice(1);
  for(const block of blocks){
    const hrefMatch=block.match(/class="result__a"[^>]*href="([^"]+)"/i);
    const titleMatch=block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch=block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    const url=safeUrl(decodeEntities(hrefMatch?.[1]||""));
    if(!url)continue;
    results.push({
      title:clean(decodeEntities(titleMatch?.[1]||url)),
      url,
      snippet:clean(decodeEntities(snippetMatch?.[1]||"")),
      source:"DuckDuckGo"
    });
    if(results.length>=limit)break;
  }
  return results;
}
async function wikipediaFallback(query,limit=5){
  const url=`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`;
  const r=await fetch(url,{headers:{"user-agent":"AvalynxWeb/1.0"}});
  if(!r.ok)throw new Error(`Wikipedia ${r.status}`);
  const data=await r.json();
  return (data?.query?.search||[]).map(x=>({
    title:x.title,
    url:`https://en.wikipedia.org/wiki/${encodeURIComponent(String(x.title).replace(/ /g,"_"))}`,
    snippet:clean(x.snippet),
    source:"Wikipedia"
  }));
}
async function readBody(req){
  if(req.body&&typeof req.body==="object")return req.body;
  let raw=""; for await(const c of req)raw+=c;
  try{return raw?JSON.parse(raw):{}}catch{return {}}
}
export default async function handler(req,res){
  if(!["GET","POST"].includes(req.method))return send(res,405,{ok:false,error:"Method not allowed"});
  const body=req.method==="POST"?await readBody(req):{};
  const u=new URL(req.url,"http://localhost");
  const query=String(body.q||u.searchParams.get("q")||"").trim().slice(0,500);
  const limit=Math.min(8,Math.max(1,Number(body.limit||u.searchParams.get("limit")||6)));
  if(!query)return send(res,400,{ok:false,error:"q is required"});

  let results=[],errors=[];
  try{results=await ddgSearch(query,limit)}catch(e){errors.push(String(e.message||e))}
  if(!results.length){
    try{results=await wikipediaFallback(query,limit)}catch(e){errors.push(String(e.message||e))}
  }
  return send(res,results.length?200:502,{
    ok:results.length>0,
    query,
    results,
    errors,
    searchedAt:new Date().toISOString()
  });
}
