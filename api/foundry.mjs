const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};

function send(res,status,payload){
  res.statusCode=status;
  Object.entries(JSON_HEADERS).forEach(([k,v])=>res.setHeader(k,v));
  res.end(JSON.stringify(payload));
}
async function body(req){
  if(req.body && typeof req.body==="object")return req.body;
  let raw=""; for await(const c of req)raw+=c;
  return raw?JSON.parse(raw):{};
}
function cfg(){
  return {
    endpoint:String(process.env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT||"").replace(/\/$/,""),
    token:process.env.AZURE_AI_FOUNDRY_ACCESS_TOKEN||"",
    key:process.env.AZURE_AI_FOUNDRY_API_KEY||"",
    apiVersion:process.env.AZURE_AI_FOUNDRY_API_VERSION||"v1"
  };
}
function headers(c,features){
  const h={"content-type":"application/json","accept":"application/json"};
  if(c.token)h.authorization=`Bearer ${c.token}`;
  else if(c.key)h["api-key"]=c.key;
  if(features)h["Foundry-Features"]=features;
  return h;
}
function configured(c){return Boolean(c.endpoint&&(c.token||c.key));}
function safeName(value){
  return String(value||"ava-agent").toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,63)||"ava-agent";
}

export default async function handler(req,res){
  const c=cfg();
  if(req.method==="GET"){
    if(!configured(c))return send(res,503,{ok:false,configured:false,error:"Microsoft Foundry is not configured on the Avalynx backend."});
    try{
      const r=await fetch(`${c.endpoint}/agents?api-version=${encodeURIComponent(c.apiVersion)}&limit=1`,{headers:headers(c)});
      const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text.slice(0,1000)}}
      return send(res,r.ok?200:502,{ok:r.ok,configured:true,upstreamStatus:r.status,endpoint:c.endpoint,apiVersion:c.apiVersion,response:data});
    }catch(error){return send(res,502,{ok:false,configured:true,error:String(error?.message||error)})}
  }

  if(req.method!=="POST")return send(res,405,{ok:false,error:"Method not allowed"});
  if(!configured(c))return send(res,503,{ok:false,error:"Configure AZURE_AI_FOUNDRY_PROJECT_ENDPOINT and backend authentication first."});

  try{
    const input=await body(req);
    const name=safeName(input.name);
    const kind=input.kind==="hosted"?"hosted":"prompt";
    const model=String(input.model||"").trim();
    const instructions=String(input.instructions||"").trim();
    if(!model)return send(res,400,{ok:false,error:"A Foundry deployment/model name is required."});

    let definition;
    let features="";
    if(kind==="hosted"){
      // Hosted agents need code/container configuration; don't fake a deploy.
      return send(res,400,{ok:false,error:"Hosted Agent requires a code/container deployment definition. Use Prompt Agent here, or configure hosted-agent deployment separately."});
    }else{
      definition={kind:"prompt",model,instructions};
    }

    const payload={name,definition,metadata:{created_by:"avalynx-studio",engine:"microsoft-foundry"}};
    const r=await fetch(`${c.endpoint}/agents?api-version=${encodeURIComponent(c.apiVersion)}`,{
      method:"POST",headers:headers(c,features),body:JSON.stringify(payload)
    });
    const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text.slice(0,2000)}}
    return send(res,r.ok?200:502,{ok:r.ok,upstreamStatus:r.status,agent:data});
  }catch(error){
    return send(res,500,{ok:false,error:String(error?.message||error)});
  }
}
