import crypto from "node:crypto";
import path from "node:path";
const store=new Map(),TTL=30*60*1000,MAX=2*1024*1024;
const EXT=new Set([".txt",".md",".json",".js",".mjs",".cjs",".ts",".tsx",".jsx",".css",".html",".xml",".yaml",".yml",".toml",".ini",".csv",".sql",".py",".java",".kt",".swift",".go",".rs",".c",".h",".cpp",".hpp",".sh",".ps1",".rb",".php",".vue",".svelte"]);
function nameOf(v="artifact.txt"){let n=path.basename(String(v)).normalize("NFKC").replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,"-").replace(/^\.+/,"").slice(0,120)||"artifact.txt";return EXT.has(path.extname(n).toLowerCase())?n:n+".txt"}
function sweep(){let n=Date.now();for(const[id,a]of store)if(n-a.at>TTL)store.delete(id);while(store.size>100)store.delete(store.keys().next().value)}
setInterval(sweep,60000).unref?.();
function json(res,s,d){res.statusCode=s;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");res.end(JSON.stringify(d))}
export async function handleArtifacts(req,res,url,body={}){
 sweep();
 if(url.pathname==="/api/artifacts/create"&&req.method==="POST"){
  if(typeof body.content!=="string")return json(res,400,{error:"Text content required"});
  const bytes=Buffer.byteLength(body.content,"utf8");if(bytes>MAX)return json(res,413,{error:"2 MB sandbox limit"});
  const id=crypto.randomUUID(),name=nameOf(body.name);store.set(id,{id,name,content:body.content,bytes,at:Date.now()});
  return json(res,201,{id,name,bytes,expiresInSeconds:1800,downloadUrl:`/api/artifacts/${id}/download`});
 }
 const m=url.pathname.match(/^\/api\/artifacts\/([0-9a-f-]+)\/download$/i);
 if(m&&req.method==="GET"){const a=store.get(m[1]);if(!a){res.statusCode=404;return res.end("Expired or missing")}
  res.statusCode=200;res.setHeader("content-type","text/plain; charset=utf-8");res.setHeader("content-disposition",`attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`);res.setHeader("cache-control","private, no-store");res.setHeader("x-content-type-options","nosniff");res.setHeader("content-security-policy","default-src 'none'; sandbox");return res.end(a.content)}
 return json(res,404,{error:"Not found"});
}
