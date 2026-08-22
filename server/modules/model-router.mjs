const CACHE_TTL = 5 * 60 * 1000;
let cache = { at: 0, models: [], providers: [] };

function env(name){ return process.env[name] || ""; }
function splitCsv(value){ return String(value||"").split(",").map(x=>x.trim()).filter(Boolean); }

function json(res,status,data){
  res.statusCode=status;
  res.setHeader("content-type","application/json; charset=utf-8");
  res.setHeader("cache-control","no-store");
  res.end(JSON.stringify(data));
}

function inferCaps(id="", meta={}){
  const text=`${id} ${meta.name||""} ${meta.description||""} ${(meta.pipeline_tag||"")}`.toLowerCase();
  const caps=new Set();

  if (/(embed|embedding)/.test(text)) caps.add("embeddings");
  if (/(imagen|flux|stable[- ]?diffusion|sdxl|image[- ]generation|text[- ]to[- ]image|photo[- ]generation)/.test(text)) caps.add("image");
  if (/(vision|vlm|multimodal|image[- ]understanding)/.test(text)) caps.add("vision");
  if (/(video|veo|wan|kling|ltx|hunyuan-video|mochi)/.test(text)) caps.add("video");
  if (/(music|audio|lyria|song|sound|tts|speech|voice)/.test(text)) caps.add("audio");
  if (/(music|lyria|song)/.test(text)) caps.add("music");
  if (/(code|coder|devstral|codestral|starcoder)/.test(text)) caps.add("code");
  if (/(reason|r1|thinking|nemotron|qwq)/.test(text)) caps.add("reasoning");

  if (!caps.has("image") && !caps.has("video") && !caps.has("music") && !caps.has("audio") && !caps.has("embeddings")) {
    caps.add("chat");
  }
  if (meta.tools || meta.supports_tools) caps.add("tools");
  if (meta.vision || meta.supports_vision) caps.add("vision");
  return [...caps];
}

function normalizeModel({
  id, provider, name, description="", capabilities=[], input_modalities=["text"],
  output_modalities=["text"], context_length=0, pricing=null, free=null,
  available=true, route=null, raw=null
}){
  const caps=capabilities.length?capabilities:inferCaps(id,{name,description});
  return {
    id:String(id),
    provider:String(provider),
    name:String(name||id),
    description:String(description||""),
    capabilities:caps,
    architecture:{input_modalities,output_modalities},
    context_length:Number(context_length||0),
    pricing:pricing||null,
    free:free===true?true:free===false?false:null,
    available:available!==false,
    route:route||null,
    raw:raw||undefined
  };
}

async function fetchJson(url, options={}, timeoutMs=12000){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...options,signal:ctrl.signal});
    const text=await r.text();
    let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
    if(!r.ok) throw new Error(`${r.status} ${data?.error?.message||data?.error||data?.message||text.slice(0,180)}`);
    return {data,headers:r.headers};
  } finally { clearTimeout(timer); }
}

async function discoverNvidia(){
  const key=env("NVIDIA_API_KEY"); if(!key)return {provider:null,models:[]};
  try{
    const {data}=await fetchJson("https://integrate.api.nvidia.com/v1/models",{headers:{authorization:`Bearer ${key}`}});
    const models=(Array.isArray(data?.data)?data.data:[]).map(m=>normalizeModel({
      id:m.id, provider:"nvidia", name:m.name||m.id, description:m.description||"",
      capabilities:inferCaps(m.id,{...m,tools:true}),
      context_length:m.context_length||m.max_model_len||0,
      free:null, route:{kind:"openai-chat",provider:"nvidia"}, raw:m
    }));
    return {provider:{id:"nvidia",name:"NVIDIA NIM",configured:true,discovery:"live"},models};
  }catch(error){
    return {provider:{id:"nvidia",name:"NVIDIA NIM",configured:true,error:String(error.message||error)},models:[]};
  }
}

async function discoverGemini(){
  const key=env("GEMINI_API_KEY"); if(!key)return {provider:null,models:[]};
  try{
    const {data}=await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    const models=(Array.isArray(data?.models)?data.models:[]).map(m=>{
      const id=String(m.name||"").replace(/^models\//,"");
      const methods=m.supportedGenerationMethods||[];
      const caps=inferCaps(id,{name:m.displayName,description:m.description});
      if(methods.includes("generateContent")&&!caps.includes("chat"))caps.push("chat");
      return normalizeModel({
        id:`google/${id}`, provider:"google", name:m.displayName||id, description:m.description||"",
        capabilities:caps, input_modalities:["text","image"], output_modalities:caps.includes("image")?["text","image"]:["text"],
        context_length:m.inputTokenLimit||0, free:null,
        route:{kind:"google-generate-content",provider:"google",model:id}, raw:m
      });
    });
    return {provider:{id:"google",name:"Google Gemini",configured:true,discovery:"live"},models};
  }catch(error){
    return {provider:{id:"google",name:"Google Gemini",configured:true,error:String(error.message||error)},models:[]};
  }
}

async function discoverEleven(){
  const key=env("ELEVENLABS_API_KEY"); if(!key)return {provider:null,models:[]};
  try{
    const {data}=await fetchJson("https://api.elevenlabs.io/v1/models",{headers:{"xi-api-key":key}});
    const list=Array.isArray(data)?data:Array.isArray(data?.models)?data.models:[];
    const models=list.map(m=>{
      const id=m.model_id||m.id;
      const text=`${id} ${m.name||""} ${m.description||""}`.toLowerCase();
      const caps=[];
      if(/music/.test(text))caps.push("music","audio");
      else caps.push("audio");
      return normalizeModel({
        id:`elevenlabs/${id}`,provider:"elevenlabs",name:m.name||id,description:m.description||"",
        capabilities:caps,input_modalities:["text"],output_modalities:["audio"],free:null,
        route:{kind:"elevenlabs",provider:"elevenlabs",model:id},raw:m
      });
    });
    return {provider:{id:"elevenlabs",name:"ElevenLabs",configured:true,discovery:"live"},models};
  }catch(error){
    return {provider:{id:"elevenlabs",name:"ElevenLabs",configured:true,error:String(error.message||error)},models:[]};
  }
}

async function discoverReplicate(){
  const key=env("REPLICATE_API_TOKEN"); if(!key)return {provider:null,models:[]};
  try{
    let url="https://api.replicate.com/v1/models";
    const rows=[];
    for(let page=0;page<4&&url;page++){
      const {data}=await fetchJson(url,{headers:{authorization:`Bearer ${key}`}});
      rows.push(...(Array.isArray(data?.results)?data.results:[]));
      url=data?.next||null;
    }
    const models=rows.map(m=>{
      const id=`${m.owner}/${m.name}`;
      return normalizeModel({
        id:`replicate/${id}`,provider:"replicate",name:m.name||id,description:m.description||"",
        capabilities:inferCaps(id,m),free:false,
        route:{kind:"replicate",provider:"replicate",model:id},raw:{owner:m.owner,name:m.name,url:m.url}
      });
    });
    return {provider:{id:"replicate",name:"Replicate",configured:true,discovery:"live"},models};
  }catch(error){
    return {provider:{id:"replicate",name:"Replicate",configured:true,error:String(error.message||error)},models:[]};
  }
}

async function discoverHuggingFace(){
  const key=env("HF_TOKEN")||env("HUGGINGFACE_API_KEY");
  if(!key)return {provider:null,models:[]};
  try{
    const {data}=await fetchJson("https://huggingface.co/api/models?limit=500&full=false",{headers:{authorization:`Bearer ${key}`}});
    const rows=Array.isArray(data)?data:[];
    const models=rows.map(m=>normalizeModel({
      id:`huggingface/${m.id}`,provider:"huggingface",name:m.id,description:"",
      capabilities:inferCaps(m.id,m),free:null,available:true,
      route:{kind:"hf-inference",provider:"huggingface",model:m.id},raw:{pipeline_tag:m.pipeline_tag}
    }));
    return {provider:{id:"huggingface",name:"Hugging Face",configured:true,discovery:"live-catalog"},models};
  }catch(error){
    return {provider:{id:"huggingface",name:"Hugging Face",configured:true,error:String(error.message||error)},models:[]};
  }
}

function customProviders(){
  let parsed=[];
  try{parsed=JSON.parse(env("AVA_MODEL_PROVIDERS_JSON")||"[]")}catch{}
  return Array.isArray(parsed)?parsed:[];
}

async function discoverCustom(provider){
  if(!provider?.id||!provider?.baseUrl)return {provider:null,models:[]};
  const key=provider.apiKeyEnv?env(provider.apiKeyEnv):"";
  if(provider.apiKeyEnv&&!key)return {provider:{id:provider.id,name:provider.name||provider.id,configured:false},models:[]};
  const headers={"accept":"application/json"};
  if(key) headers[provider.authHeader||"authorization"]=(provider.authPrefix??"Bearer ")+key;
  let rows=[];
  if(provider.modelsPath){
    try{
      const {data}=await fetchJson(new URL(provider.modelsPath,provider.baseUrl).href,{headers});
      rows=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.models)?data.models:[];
    }catch(error){
      return {provider:{id:provider.id,name:provider.name||provider.id,configured:true,error:String(error.message||error)},models:[]};
    }
  } else if(Array.isArray(provider.models)) rows=provider.models;
  const models=rows.map(m=>{
    const rawId=typeof m==="string"?m:(m.id||m.name);
    const id=`${provider.id}/${rawId}`;
    return normalizeModel({
      id,provider:provider.id,name:typeof m==="string"?m:(m.displayName||m.name||rawId),
      description:typeof m==="string"?"":m.description||"",
      capabilities:typeof m==="string"?inferCaps(rawId):m.capabilities||inferCaps(rawId,m),
      input_modalities:m.input_modalities||["text"],output_modalities:m.output_modalities||["text"],
      context_length:m.context_length||0,free:m.free??provider.free??null,
      route:{kind:provider.kind||"openai-chat",provider:provider.id,model:rawId},raw:m
    });
  });
  return {provider:{id:provider.id,name:provider.name||provider.id,configured:true,discovery:provider.modelsPath?"live":"configured"},models};
}


function configuredFalModels(){
  const key=env("FAL_KEY")||env("FAL_API_KEY");
  if(!key)return [];
  let rows=[];
  try{rows=JSON.parse(env("FAL_MODELS_JSON")||"[]")}catch{}
  if(!Array.isArray(rows))return [];
  return rows.map(item=>{
    const raw=typeof item==="string"?{id:item}:item;
    const id=raw.id||raw.model;
    return normalizeModel({
      id:`fal/${id}`,provider:"fal",name:raw.name||id,description:raw.description||"",
      capabilities:raw.capabilities||inferCaps(id,raw),input_modalities:raw.input_modalities||["text"],
      output_modalities:raw.output_modalities||[],free:raw.free??null,
      route:{kind:"fal",provider:"fal",model:id},raw
    });
  });
}

function configuredCatalog(){
  let rows=[];
  try{rows=JSON.parse(env("AVA_MODEL_CATALOG_JSON")||"[]")}catch{}
  if(!Array.isArray(rows))return [];
  return rows.map(m=>normalizeModel(m));
}

export async function getCatalog(force=false){
  if(!force&&cache.models.length&&Date.now()-cache.at<CACHE_TTL)return cache;
  const jobs=[discoverNvidia(),discoverGemini(),discoverEleven(),discoverReplicate(),discoverHuggingFace(),...customProviders().map(discoverCustom)];
  const settled=await Promise.all(jobs);
  const providers=settled.map(x=>x.provider).filter(Boolean);
  const falModels=configuredFalModels();
  if(falModels.length)providers.push({id:"fal",name:"fal.ai",configured:true,discovery:"configured"});
  const models=[...settled.flatMap(x=>x.models),...falModels,...configuredCatalog()];
  const dedup=new Map();
  for(const m of models) if(m?.id&&!dedup.has(m.id))dedup.set(m.id,m);
  cache={at:Date.now(),models:[...dedup.values()],providers};
  return cache;
}

function providerConfig(id){
  if(id==="nvidia")return {kind:"openai-chat",baseUrl:"https://integrate.api.nvidia.com/v1",key:env("NVIDIA_API_KEY")};
  if(id==="google")return {kind:"google",key:env("GEMINI_API_KEY")};
  if(id==="replicate")return {kind:"replicate",key:env("REPLICATE_API_TOKEN")};
  if(id==="huggingface")return {kind:"huggingface",key:env("HF_TOKEN")||env("HUGGINGFACE_API_KEY")};
  if(id==="elevenlabs")return {kind:"elevenlabs",key:env("ELEVENLABS_API_KEY")};
  if(id==="fal")return {kind:"fal",key:env("FAL_KEY")||env("FAL_API_KEY")};
  const p=customProviders().find(x=>x.id===id);
  if(p)return {...p,key:p.apiKeyEnv?env(p.apiKeyEnv):""};
  return null;
}

async function resolveModel(id){
  const catalog=await getCatalog(false);
  return catalog.models.find(m=>m.id===id)||null;
}

function openAiMessagesToGemini(messages=[]){
  const system=[];
  const contents=[];
  for(const m of messages){
    if(m.role==="system"){system.push(String(m.content||""));continue;}
    const role=m.role==="assistant"?"model":"user";
    const text=typeof m.content==="string"?m.content:JSON.stringify(m.content);
    contents.push({role,parts:[{text}]});
  }
  return {system_instruction:system.length?{parts:[{text:system.join("\n\n")}]}:undefined,contents};
}

async function chat(model,body){
  const cfg=providerConfig(model.provider);
  if(!cfg)throw new Error(`Provider ${model.provider} não configurado.`);
  const rawModel=model.route?.model||model.id.split("/").slice(1).join("/");

  if(model.provider==="nvidia"||cfg.kind==="openai-chat"){
    const base=(cfg.baseUrl||"https://integrate.api.nvidia.com/v1").replace(/\/$/,"");
    const path=cfg.chatPath||"/chat/completions";
    const headers={"content-type":"application/json"};
    if(cfg.key) headers[cfg.authHeader||"authorization"]=(cfg.authPrefix??"Bearer ")+cfg.key;
    const r=await fetch(`${base}${path}`,{method:"POST",headers,body:JSON.stringify({...body,model:rawModel})});
    return r;
  }

  if(model.provider==="google"){
    const payload=openAiMessagesToGemini(body.messages||[]);
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(rawModel)}:generateContent?key=${encodeURIComponent(cfg.key)}`,{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return new Response(JSON.stringify(data),{status:r.status,headers:{"content-type":"application/json"}});
    const text=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
    return new Response(JSON.stringify({id:"ava-google",model:model.id,choices:[{index:0,message:{role:"assistant",content:text},finish_reason:"stop"}]}),{status:200,headers:{"content-type":"application/json"}});
  }

  if(model.provider==="huggingface"){
    const r=await fetch(`https://router.huggingface.co/hf-inference/models/${rawModel}`,{
      method:"POST",
      headers:{authorization:`Bearer ${cfg.key}`,"content-type":"application/json"},
      body:JSON.stringify({inputs:(body.messages||[]).map(m=>`${m.role}: ${typeof m.content==="string"?m.content:JSON.stringify(m.content)}`).join("\n")})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return new Response(JSON.stringify(data),{status:r.status,headers:{"content-type":"application/json"}});
    const text=Array.isArray(data)?(data[0]?.generated_text||JSON.stringify(data)):data.generated_text||JSON.stringify(data);
    return new Response(JSON.stringify({id:"ava-hf",model:model.id,choices:[{index:0,message:{role:"assistant",content:text},finish_reason:"stop"}]}),{status:200,headers:{"content-type":"application/json"}});
  }

  throw new Error(`Chat ainda não implementado para ${model.provider}.`);
}

async function pollJson(url,headers,deadline=120000){
  const start=Date.now();
  while(Date.now()-start<deadline){
    const {data}=await fetchJson(url,{headers},15000);
    const status=String(data.status||"").toLowerCase();
    if(["succeeded","completed","complete"].includes(status))return data;
    if(["failed","canceled","cancelled"].includes(status))throw new Error(data.error||`Job ${status}`);
    await new Promise(r=>setTimeout(r,1500));
  }
  throw new Error("Tempo limite aguardando geração.");
}

function outputsFrom(data){
  const out=[];
  const visit=v=>{
    if(!v)return;
    if(typeof v==="string"&&/^https?:/.test(v))out.push({url:v});
    else if(Array.isArray(v))v.forEach(visit);
    else if(typeof v==="object"){
      for(const k of ["url","uri","image","video","audio","output","outputs","images","videos","audios","data"]) if(k in v)visit(v[k]);
    }
  };
  visit(data);
  return out;
}

async function media(model,input,capability){
  const cfg=providerConfig(model.provider);
  const rawModel=model.route?.model||model.id.split("/").slice(1).join("/");

  if(model.provider==="replicate"){
    const headers={authorization:`Bearer ${cfg.key}`,"content-type":"application/json","prefer":"wait=60"};
    const r=await fetch(`https://api.replicate.com/v1/models/${rawModel}/predictions`,{method:"POST",headers,body:JSON.stringify({input})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.detail||data.error||`Replicate ${r.status}`);
    let final=data;
    if(data.urls?.get&&!["succeeded","failed"].includes(data.status)) final=await pollJson(data.urls.get,headers);
    return {provider:"replicate",model:model.id,status:final.status||"completed",outputs:outputsFrom(final.output||final)};
  }

  if(cfg?.kind==="fal"){
    const headers={authorization:`Key ${cfg.key}`,"content-type":"application/json"};
    const r=await fetch(`https://queue.fal.run/${rawModel}`,{method:"POST",headers,body:JSON.stringify(input)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.detail||data.error||`fal ${r.status}`);
    let final=data;
    if(data.status_url) final=await pollJson(data.status_url,headers);
    if(final.response_url){ const got=await fetchJson(final.response_url,{headers}); final=got.data; }
    return {provider:model.provider,model:model.id,status:"completed",outputs:outputsFrom(final)};
  }

  if(cfg?.mediaPaths?.[capability]){
    const headers={"content-type":"application/json"};
    if(cfg.key)headers[cfg.authHeader||"authorization"]=(cfg.authPrefix??"Bearer ")+cfg.key;
    const url=new URL(cfg.mediaPaths[capability].replace("{model}",encodeURIComponent(rawModel)),cfg.baseUrl).href;
    const {data}=await fetchJson(url,{method:"POST",headers,body:JSON.stringify(input)},120000);
    return {provider:model.provider,model:model.id,status:"completed",outputs:outputsFrom(data),raw:data};
  }

  throw new Error(`${model.provider}/${capability} está no catálogo, mas este provider ainda não possui adaptador de execução configurado.`);
}

export async function handleModelRouter(req,res,url,body={}){
  if(url.pathname==="/api/models"&&req.method==="GET"){
    const c=await getCatalog(url.searchParams.get("refresh")==="1");
    return json(res,200,{data:c.models,providers:c.providers,updatedAt:new Date(c.at).toISOString()});
  }

  if(url.pathname==="/api/providers"&&req.method==="GET"){
    const c=await getCatalog(false);
    return json(res,200,{data:c.providers});
  }

  if(url.pathname==="/api/inference/chat"&&req.method==="POST"){
    const model=await resolveModel(body.model);
    if(!model)return json(res,404,{error:"Modelo não encontrado no Avalynx Model Router."});
    try{
      const upstream=await chat(model,body);
      res.statusCode=upstream.status;
      upstream.headers.forEach((v,k)=>{if(["content-type","retry-after"].includes(k.toLowerCase()))res.setHeader(k,v)});
      if(upstream.body){ for await(const chunk of upstream.body)res.write(Buffer.from(chunk)); }
      return res.end();
    }catch(error){return json(res,502,{error:String(error.message||error),provider:model.provider,model:model.id});}
  }

  const mediaMatch=url.pathname.match(/^\/api\/inference\/(image|video|music|audio)$/);
  if(mediaMatch&&req.method==="POST"){
    const capability=mediaMatch[1];
    const model=await resolveModel(body.model);
    if(!model)return json(res,404,{error:"Modelo não encontrado no Avalynx Model Router."});
    if(!model.capabilities.includes(capability))return json(res,400,{error:`O modelo selecionado não declara suporte a ${capability}.`});
    try{
      const result=await media(model,body.input||body,capability);
      return json(res,200,result);
    }catch(error){return json(res,502,{error:String(error.message||error),provider:model.provider,model:model.id});}
  }

  return json(res,404,{error:"Avalynx Model Router route not found."});
}
