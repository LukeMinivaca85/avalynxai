import { Readable } from "node:stream";

const NVIDIA = "https://integrate.api.nvidia.com/v1";
const ELEVEN = "https://api.elevenlabs.io";

function env(name) { return process.env[name] || ""; }
export function deploymentName() {
  if (process.env.VERCEL) return "vercel";
  if (process.env.RENDER) return "render";
  return "node";
}
export function publicConfig() {
  return {
    nvidia: Boolean(env("NVIDIA_API_KEY")),
    elevenlabs: Boolean(env("ELEVENLABS_API_KEY")),
    deployment: deploymentName(),
    inferenceProvider: "nvidia-nim",
    model: env("NVIDIA_MODEL") || "nvidia/nemotron-3-ultra-550b-a55b"
  };
}
function providerForPath(pathname) {
  if (pathname.startsWith("nvidia/")) return "nvidia";
  if (pathname.startsWith("eleven/")) return "eleven";
  return null;
}
function upstreamFor(pathname, search="") {
  if (pathname === "nvidia/chat/completions") return `${NVIDIA}/chat/completions${search}`;
  if (pathname === "nvidia/models") return `${NVIDIA}/models${search}`;
  if (pathname === "eleven/voices") return `${ELEVEN}/v2/voices${search}`;
  if (pathname === "eleven/stt") return `${ELEVEN}/v1/speech-to-text${search}`;
  const tts=pathname.match(/^eleven\/tts\/([^/]+)$/);
  if (tts) return `${ELEVEN}/v1/text-to-speech/${encodeURIComponent(decodeURIComponent(tts[1]))}/stream${search}`;
  return null;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
export async function collectBody(req){
  if(req.method==="GET"||req.method==="HEAD") return null;
  const chunks=[]; for await(const c of req) chunks.push(Buffer.from(c));
  return chunks.length?Buffer.concat(chunks):null;
}
export async function proxyRequest({pathname,search="",method,headers,body}){
  const provider=providerForPath(pathname), upstream=upstreamFor(pathname,search);
  if(!provider||!upstream) return {status:404,headers:{"content-type":"application/json"},body:Buffer.from(JSON.stringify({error:"Unknown API route."}))};
  const nvidiaKey=env("NVIDIA_API_KEY"), elevenKey=env("ELEVENLABS_API_KEY");
  if(provider==="nvidia"&&!nvidiaKey) return {status:503,headers:{"content-type":"application/json"},body:Buffer.from(JSON.stringify({error:"NVIDIA_API_KEY is not configured on the server."}))};
  if(provider==="eleven"&&!elevenKey) return {status:503,headers:{"content-type":"application/json"},body:Buffer.from(JSON.stringify({error:"ELEVENLABS_API_KEY is not configured on the server."}))};
  const h=new Headers();
  const ct=headers["content-type"]||headers.get?.("content-type"); if(ct) h.set("content-type",ct);
  const ac=headers["accept"]||headers.get?.("accept"); if(ac) h.set("accept",ac);
  if(provider==="nvidia") h.set("authorization",`Bearer ${nvidiaKey}`); else h.set("xi-api-key",elevenKey);
  const options={method,headers:h,body:body&&method!=="GET"&&method!=="HEAD"?body:undefined,redirect:"follow"};
  const max=pathname==="nvidia/chat/completions"?3:1; let response;
  for(let i=1;i<=max;i++){
    response=await fetch(upstream,options);
    if(![502,503,504].includes(response.status)||i===max) break;
    try{await response.arrayBuffer();}catch{} await sleep(i*450);
  }
  const ph={}; for(const n of ["content-type","content-length","cache-control","x-request-id","request-id","retry-after"]){const v=response.headers.get(n); if(v) ph[n]=v;}
  ph["x-ava-proxy-provider"]=provider; ph["x-ava-proxy-route"]=pathname;
  return {status:response.status,headers:ph,body:response.body};
}
export async function pipeProxyResult(result,res){
  res.statusCode=result.status; for(const [n,v] of Object.entries(result.headers||{})){try{res.setHeader(n,v)}catch{}}
  if(Buffer.isBuffer(result.body)){res.end(result.body);return;} if(!result.body){res.end();return;} Readable.fromWeb(result.body).pipe(res);
}
