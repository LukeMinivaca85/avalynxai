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
  const key=env("NVIDIA_API_KEY");
  if(!key)return {provider:null,models:[]};

  const base=(env("NVIDIA_BASE_URL")||"https://integrate.api.nvidia.com/v1").replace(/\/$/,"");
  const configuredModel=env("NVIDIA_MODEL")||"nvidia/nemotron-3-ultra-550b-a55b";

  const fallbackModel=normalizeModel({
    id:configuredModel,
    provider:"nvidia",
    name:configuredModel.split("/").at(-1)||configuredModel,
    description:"Configured NVIDIA NIM model.",
    capabilities:["chat","reasoning","tools"],
    input_modalities:["text"],
    output_modalities:["text"],
    free:null,
    available:true,
    route:{
      kind:"openai-chat",
      provider:"nvidia",
      model:configuredModel
    }
  });

  try{
    const {data}=await fetchJson(`${base}/models`,{
      headers:{
        authorization:`Bearer ${key}`,
        accept:"application/json"
      }
    });

    const rows=Array.isArray(data?.data)?data.data:[];
    const models=rows.map(m=>{
      const exactId=String(m.id||"").trim();
      return normalizeModel({
        id:exactId,
        provider:"nvidia",
        name:m.name||exactId,
        description:m.description||"",
        capabilities:inferCaps(exactId,{...m,tools:true}),
        input_modalities:m.architecture?.input_modalities||["text"],
        output_modalities:m.architecture?.output_modalities||["text"],
        context_length:m.context_length||m.max_model_len||0,
        free:null,
        available:true,
        route:{
          kind:"openai-chat",
          provider:"nvidia",
          // CRITICAL: preserve the exact publisher/model identifier expected upstream.
          model:exactId
        },
        raw:m
      });
    }).filter(m=>m.id);

    const map=new Map(models.map(m=>[m.id,m]));
    if(!map.has(configuredModel))map.set(configuredModel,fallbackModel);

    return {
      provider:{
        id:"nvidia",
        name:"NVIDIA NIM",
        configured:true,
        discovery:"live",
        baseUrl:base
      },
      models:[...map.values()]
    };
  }catch(error){
    // Discovery failure must not disable a known configured NVIDIA model.
    return {
      provider:{
        id:"nvidia",
        name:"NVIDIA NIM",
        configured:true,
        discovery:"configured-fallback",
        baseUrl:base,
        warning:String(error.message||error)
      },
      models:[fallbackModel]
    };
  }
}

async function discoverGemini(){
  const key=env("GEMINI_API_KEY"); if(!key)return {provider:null,models:[]};
  try{
    const {data}=await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    const rows=Array.isArray(data?.models)?data.models:[];
    const models=rows.map(m=>{
      const rawId=String(m.name||"").replace(/^models\//,"");
      const lower=rawId.toLowerCase();
      const methods=m.supportedGenerationMethods||[];

      const caps=[];
      let input=["text"];
      let output=["text"];

      if (/lyria/.test(lower)) {
        caps.push("music","audio");
        input=["text","image"]; output=["audio","text"];
      } else if (/veo|video/.test(lower)) {
        caps.push("video");
        input=["text","image","video"]; output=["video"];
      } else if (/image|imagen|nano-banana/.test(lower)) {
        caps.push("image");
        input=["text","image","file"]; output=["image","text"];
        if (/gemini/.test(lower)) caps.push("reasoning");
      } else {
        if(methods.includes("generateContent")) caps.push("chat");
        if(/code|coder/.test(lower))caps.push("code");
        if(/embed/.test(lower))caps.push("embeddings");
        if(/flash|pro|gemini/.test(lower))caps.push("reasoning");
        input=["text","image","file","audio","video"];
        output=["text"];
      }

      return normalizeModel({
        id:`google/${rawId}`,
        provider:"google",
        name:m.displayName||rawId,
        description:m.description||"",
        capabilities:[...new Set(caps)],
        input_modalities:input,
        output_modalities:output,
        context_length:m.inputTokenLimit||0,
        free:null,
        route:{kind:"google",provider:"google",model:rawId},
        raw:m
      });
    });

    // Important media models may not appear in every list response/account view.
    const explicit=[
      normalizeModel({
        id:"google/gemini-3.1-flash-image",provider:"google",name:"Gemini 3.1 Flash Image",
        description:"Google image generation/editing model.",capabilities:["image","reasoning"],
        input_modalities:["text","image","file"],output_modalities:["image","text"],free:null,
        route:{kind:"google-image",provider:"google",model:"gemini-3.1-flash-image"}
      }),
      normalizeModel({
        id:"google/veo-3.1-generate-preview",provider:"google",name:"Veo 3.1",
        description:"Google video generation with native audio.",capabilities:["video"],
        input_modalities:["text","image","video"],output_modalities:["video"],free:null,
        route:{kind:"google-video",provider:"google",model:"veo-3.1-generate-preview"}
      }),
      normalizeModel({
        id:"google/veo-3.1-lite-generate-preview",provider:"google",name:"Veo 3.1 Lite",
        description:"Efficient Google video generation.",capabilities:["video"],
        input_modalities:["text","image"],output_modalities:["video"],free:null,
        route:{kind:"google-video",provider:"google",model:"veo-3.1-lite-generate-preview"}
      }),
      normalizeModel({
        id:"google/lyria-3-pro-preview",provider:"google",name:"Lyria 3 Pro",
        description:"Google full-song music generation.",capabilities:["music","audio"],
        input_modalities:["text","image"],output_modalities:["audio","text"],free:null,
        route:{kind:"google-music",provider:"google",model:"lyria-3-pro-preview"}
      }),
      normalizeModel({
        id:"google/lyria-3-clip-preview",provider:"google",name:"Lyria 3 Clip",
        description:"Google 30-second music clip generation.",capabilities:["music","audio"],
        input_modalities:["text","image"],output_modalities:["audio","text"],free:null,
        route:{kind:"google-music",provider:"google",model:"lyria-3-clip-preview"}
      })
    ];

    const map=new Map(models.map(m=>[m.id,m]));
    for(const x of explicit) if(!map.has(x.id)) map.set(x.id,x);

    return {provider:{id:"google",name:"Google AI Studio",configured:true,discovery:"live"},models:[...map.values()]};
  }catch(error){
    return {provider:{id:"google",name:"Google AI Studio",configured:true,error:String(error.message||error)},models:[]};
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

  const preferred=[
    normalizeModel({
      id:"huggingface/Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest",
      provider:"huggingface",
      name:"Qwen3 Coder 480B A35B Instruct",
      description:"Ava Code primary model via Hugging Face Inference Providers.",
      capabilities:["chat","code","tools","reasoning"],
      input_modalities:["text"],output_modalities:["text"],
      free:null,available:true,
      route:{kind:"hf-openai-chat",provider:"huggingface",model:"Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest"}
    }),
    normalizeModel({
      id:"huggingface/Qwen/Qwen2.5-Coder-32B-Instruct:fastest",
      provider:"huggingface",
      name:"Qwen2.5 Coder 32B Instruct",
      description:"Ava Code coding fallback via Hugging Face Inference Providers.",
      capabilities:["chat","code","tools"],
      input_modalities:["text"],output_modalities:["text"],
      free:null,available:true,
      route:{kind:"hf-openai-chat",provider:"huggingface",model:"Qwen/Qwen2.5-Coder-32B-Instruct:fastest"}
    }),
    normalizeModel({
      id:"huggingface/openai/gpt-oss-120b:fastest",
      provider:"huggingface",
      name:"GPT-OSS 120B",
      description:"Tool-capable fallback via Hugging Face Inference Providers.",
      capabilities:["chat","code","tools","reasoning"],
      input_modalities:["text"],output_modalities:["text"],
      free:null,available:true,
      route:{kind:"hf-openai-chat",provider:"huggingface",model:"openai/gpt-oss-120b:fastest"}
    })
  ];

  let liveModels=[];
  try{
    const {data}=await fetchJson("https://router.huggingface.co/v1/models",{
      headers:{authorization:`Bearer ${key}`}
    });

    const rows=Array.isArray(data?.data)?data.data:[];
    liveModels=rows.map(m=>{
      const id=m.id;
      const providers=Array.isArray(m.providers)?m.providers:[];
      const live=providers.filter(p=>String(p.status||"").toLowerCase()==="live");
      const supportsTools=live.some(p=>p.supports_tools===true) || /qwen.*coder|gpt-oss/i.test(id);
      const caps=inferCaps(id,m);

      if(!caps.includes("chat"))caps.push("chat");
      if(supportsTools&&!caps.includes("tools"))caps.push("tools");
      if(/coder|code/i.test(id)&&!caps.includes("code"))caps.push("code");

      const best=live[0]||providers[0]||{};
      return normalizeModel({
        id:`huggingface/${id}`,
        provider:"huggingface",
        name:id,
        description:"",
        capabilities:[...new Set(caps)],
        input_modalities:m.architecture?.input_modalities||["text"],
        output_modalities:m.architecture?.output_modalities||["text"],
        context_length:best.context_length||m.context_length||0,
        free:null,
        available:live.length>0||providers.length===0,
        route:{kind:"hf-openai-chat",provider:"huggingface",model:id},
        raw:{owned_by:m.owned_by,providers,supports_tools:supportsTools}
      });
    });
  }catch{}

  const map=new Map();
  for(const model of [...preferred,...liveModels]){
    if(!map.has(model.id))map.set(model.id,model);
  }

  return {
    provider:{
      id:"huggingface",
      name:"Hugging Face Inference Providers",
      configured:true,
      discovery:"openai-compatible"
    },
    models:[...map.values()]
  };
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
  if(id==="nvidia")return {
    kind:"openai-chat",
    baseUrl:(env("NVIDIA_BASE_URL")||"https://integrate.api.nvidia.com/v1").replace(/\/$/,""),
    chatPath:env("NVIDIA_CHAT_PATH")||"/chat/completions",
    key:env("NVIDIA_API_KEY")
  };
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
  const rawModel=model.route?.model || (
    ["nvidia","huggingface"].includes(model.provider)
      ? model.id.replace(/^huggingface\//,"")
      : model.id.split("/").slice(1).join("/")
  );

  if(model.provider==="nvidia"||cfg.kind==="openai-chat"){
    const base=(cfg.baseUrl||"https://integrate.api.nvidia.com/v1").replace(/\/$/,"");
    const chatPath=cfg.chatPath||"/chat/completions";
    const endpoint=`${base}${chatPath.startsWith("/")?chatPath:`/${chatPath}`}`;
    const headers={"content-type":"application/json","accept":"application/json"};
    if(cfg.key)headers[cfg.authHeader||"authorization"]=(cfg.authPrefix??"Bearer ")+cfg.key;

    const payload={...body,model:rawModel};
    const r=await fetch(endpoint,{
      method:"POST",
      headers,
      body:JSON.stringify(payload)
    });

    // Preserve upstream response but expose useful routing diagnostics.
    const outgoingHeaders=new Headers(r.headers);
    outgoingHeaders.set("x-avalynx-provider",model.provider);
    outgoingHeaders.set("x-avalynx-upstream-model",rawModel);

    return new Response(r.body,{
      status:r.status,
      statusText:r.statusText,
      headers:outgoingHeaders
    });
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
    if(!cfg.key)throw new Error("HF_TOKEN não configurado.");
    if(model.route?.kind!=="hf-openai-chat"){
      throw new Error("Este modelo do Hugging Face não possui rota de Inference Providers confirmada.");
    }
    const hfBody={...body,model:rawModel};
    return fetch("https://router.huggingface.co/v1/chat/completions",{
      method:"POST",
      headers:{
        authorization:`Bearer ${cfg.key}`,
        "content-type":"application/json"
      },
      body:JSON.stringify(hfBody)
    });
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


function extractGoogleInlineOutputs(data, wanted="image"){
  const outputs=[];
  const candidates=Array.isArray(data?.candidates)?data.candidates:[];
  for(const c of candidates){
    const parts=c?.content?.parts||[];
    for(const p of parts){
      const inline=p.inlineData||p.inline_data;
      if(inline?.data){
        const mime=inline.mimeType||inline.mime_type||(
          wanted==="image"?"image/png":wanted==="audio"?"audio/mpeg":"application/octet-stream"
        );
        outputs.push({
          data: inline.data,
          mime_type:mime,
          data_url:`data:${mime};base64,${inline.data}`
        });
      }
      if(p.fileData?.fileUri) outputs.push({url:p.fileData.fileUri,mime_type:p.fileData.mimeType||""});
    }
  }
  return outputs;
}

async function googleGenerateImage(modelId,input,key){
  const prompt=input.prompt||input.text||"Generate an image.";
  const body={
    contents:[{parts:[{text:prompt}]}],
    generationConfig:{
      responseModalities:["IMAGE","TEXT"]
    }
  };

  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,{
    method:"POST",
    headers:{"x-goog-api-key":key,"content-type":"application/json"},
    body:JSON.stringify(body)
  });

  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error?.message||`Google image ${r.status}`);

  const raw=extractGoogleInlineOutputs(data,"image");
  const outputs=raw.map(x=>x.data_url?{url:x.data_url,mime_type:x.mime_type}:x);
  return {provider:"google",model:`google/${modelId}`,status:"completed",outputs,raw:data};
}

async function googleGenerateMusic(modelId,input,key){
  const prompt=input.prompt||input.text||"Create a piece of music.";
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
    method:"POST",
    headers:{"x-goog-api-key":key,"content-type":"application/json"},
    body:JSON.stringify({
      model:modelId,
      input:prompt
    })
  });

  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error?.message||`Google music ${r.status}`);

  const outputs=[];
  const steps=Array.isArray(data?.steps)?data.steps:[];
  for(const step of steps){
    const content=Array.isArray(step?.content)?step.content:[];
    for(const block of content){
      if(block?.type==="audio"&&block?.data){
        const mime=block.mime_type||block.mimeType||"audio/mpeg";
        outputs.push({url:`data:${mime};base64,${block.data}`,mime_type:mime});
      }
    }
  }

  // Some Interaction API responses expose output_audio directly.
  const audio=data?.output_audio;
  if(audio?.data){
    const mime=audio.mime_type||audio.mimeType||"audio/mpeg";
    outputs.push({url:`data:${mime};base64,${audio.data}`,mime_type:mime});
  }

  return {provider:"google",model:`google/${modelId}`,status:"completed",outputs,raw:data};
}

async function googleGenerateVideo(modelId,input,key){
  const prompt=input.prompt||input.text||"Generate a video.";
  const start=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:predictLongRunning`,{
    method:"POST",
    headers:{"x-goog-api-key":key,"content-type":"application/json"},
    body:JSON.stringify({
      instances:[{prompt}],
      parameters:{
        numberOfVideos:1,
        aspectRatio:input.aspect_ratio||"16:9",
        resolution:input.resolution||"720p"
      }
    })
  });

  const started=await start.json().catch(()=>({}));
  if(!start.ok)throw new Error(started?.error?.message||`Google video ${start.status}`);
  if(!started?.name)throw new Error("Google Veo não retornou o nome da operação.");

  const deadline=Date.now()+10*60*1000;
  let done=null;

  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,5000));
    const poll=await fetch(`https://generativelanguage.googleapis.com/v1beta/${started.name}`,{
      headers:{"x-goog-api-key":key}
    });
    const data=await poll.json().catch(()=>({}));
    if(!poll.ok)throw new Error(data?.error?.message||`Google operation ${poll.status}`);
    if(data.done){done=data;break;}
  }

  if(!done)throw new Error("Tempo limite aguardando o Veo terminar.");

  const samples=
    done?.response?.generateVideoResponse?.generatedSamples ||
    done?.response?.generatedVideos ||
    [];

  const outputs=[];
  for(const sample of samples){
    const video=sample?.video||sample;
    const uri=video?.uri||video?.fileUri;
    if(uri){
      // Return a same-backend download URL so browsers don't need to expose the API key.
      outputs.push({
        url:`/api/inference/google-file?uri=${encodeURIComponent(uri)}`,
        mime_type:"video/mp4"
      });
    }
    if(video?.videoBytes){
      outputs.push({url:`data:video/mp4;base64,${video.videoBytes}`,mime_type:"video/mp4"});
    }
  }

  return {provider:"google",model:`google/${modelId}`,status:"completed",outputs,raw:done};
}

async function media(model,input,capability){
  const cfg=providerConfig(model.provider);
  const rawModel=model.route?.model || (
    ["nvidia","huggingface"].includes(model.provider)
      ? model.id.replace(/^huggingface\//,"")
      : model.id.split("/").slice(1).join("/")
  );

  if(model.provider==="google"){
    if(!cfg?.key)throw new Error("GEMINI_API_KEY não configurada.");
    if(capability==="image")return googleGenerateImage(rawModel,input,cfg.key);
    if(capability==="video")return googleGenerateVideo(rawModel,input,cfg.key);
    if(capability==="music"||capability==="audio")return googleGenerateMusic(rawModel,input,cfg.key);
  }

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

  if(url.pathname==="/api/inference/nvidia-test"&&req.method==="GET"){
    const cfg=providerConfig("nvidia");
    const model=env("NVIDIA_MODEL")||"nvidia/nemotron-3-ultra-550b-a55b";

    if(!cfg?.key){
      return json(res,503,{
        ok:false,
        provider:"nvidia",
        error:"NVIDIA_API_KEY is not configured."
      });
    }

    const endpoint=`${cfg.baseUrl}${cfg.chatPath||"/chat/completions"}`;
    try{
      const upstream=await fetch(endpoint,{
        method:"POST",
        headers:{
          authorization:`Bearer ${cfg.key}`,
          "content-type":"application/json",
          accept:"application/json"
        },
        body:JSON.stringify({
          model,
          messages:[{role:"user",content:"Reply with exactly: NVIDIA_OK"}],
          max_tokens:16,
          temperature:0
        })
      });

      const text=await upstream.text();
      let payload={};
      try{payload=text?JSON.parse(text):{}}catch{payload={raw:text.slice(0,1000)}}

      return json(res,upstream.ok?200:502,{
        ok:upstream.ok,
        provider:"nvidia",
        endpoint,
        model,
        upstreamStatus:upstream.status,
        response:payload
      });
    }catch(error){
      return json(res,502,{
        ok:false,
        provider:"nvidia",
        endpoint,
        model,
        error:String(error.message||error)
      });
    }
  }

  if(url.pathname==="/api/inference/google-file"&&req.method==="GET"){
    const key=env("GEMINI_API_KEY");
    const uri=url.searchParams.get("uri");
    if(!key||!uri)return json(res,400,{error:"Google file proxy missing key or URI."});
    if(!/^https:\/\/generativelanguage\.googleapis\.com\//.test(uri)&&!/^https:\/\/[^/]*googleapis\.com\//.test(uri)){
      return json(res,400,{error:"Invalid Google file URI."});
    }
    try{
      const upstream=await fetch(uri,{headers:{"x-goog-api-key":key},redirect:"follow"});
      res.statusCode=upstream.status;
      const ct=upstream.headers.get("content-type");
      if(ct)res.setHeader("content-type",ct);
      res.setHeader("cache-control","private, max-age=300");
      if(upstream.body){for await(const chunk of upstream.body)res.write(Buffer.from(chunk));}
      return res.end();
    }catch(error){
      return json(res,502,{error:String(error.message||error)});
    }
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
