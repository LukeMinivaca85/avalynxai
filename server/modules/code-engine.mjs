import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.join(os.tmpdir(), "avalynx-codex-workspaces");
const MAX_FILES = 64;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const RUN_TIMEOUT_MS = Number(process.env.CODEX_ENGINE_TIMEOUT_MS || 180000);

function json(res,status,data){
  res.statusCode=status;
  res.setHeader("content-type","application/json; charset=utf-8");
  res.setHeader("cache-control","no-store");
  res.end(JSON.stringify(data));
}

function safeRel(input){
  const raw=String(input||"file.txt").replace(/\\/g,"/");
  const normalized=path.posix.normalize(raw).replace(/^(\.\.\/)+/,"").replace(/^\/+/,"");
  if(!normalized || normalized==="." || normalized.startsWith("../")) throw new Error("Invalid workspace path");
  if(normalized.split("/").includes("node_modules")) throw new Error("node_modules is not accepted in uploaded workspaces");
  return normalized.slice(0,240);
}

async function ensureRoot(){ await fs.mkdir(ROOT,{recursive:true,mode:0o700}); }

async function commandExists(bin){
  return new Promise(resolve=>{
    const p=spawn(bin,["--version"],{stdio:["ignore","pipe","pipe"]});
    let done=false;
    const finish=v=>{if(done)return;done=true;resolve(v)};
    p.on("error",()=>finish(false));
    p.on("exit",code=>finish(code===0));
    setTimeout(()=>{try{p.kill("SIGKILL")}catch{};finish(false)},3000);
  });
}

function codexBin(){ return process.env.CODEX_CLI_PATH || "codex"; }

async function writeWorkspace(dir, files=[]){
  let total=0,count=0;
  for(const item of Array.isArray(files)?files:[]){
    if(count>=MAX_FILES) break;
    const rel=safeRel(item?.path||item?.name);
    const content=String(item?.content??"");
    const bytes=Buffer.byteLength(content,"utf8");
    if(bytes>MAX_FILE_BYTES) throw new Error(`${rel} exceeds the 1 MB file limit`);
    total+=bytes;
    if(total>MAX_TOTAL_BYTES) throw new Error("Workspace exceeds the 8 MB upload limit");
    const target=path.join(dir,rel);
    const resolved=path.resolve(target);
    if(!resolved.startsWith(path.resolve(dir)+path.sep)) throw new Error("Workspace escape blocked");
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,content,{encoding:"utf8",mode:0o600});
    count++;
  }
}

async function snapshot(dir){
  const map=new Map();
  async function walk(current,rel=""){
    const entries=await fs.readdir(current,{withFileTypes:true});
    for(const e of entries){
      if(e.name===".git"||e.name==="node_modules") continue;
      const r=rel?`${rel}/${e.name}`:e.name;
      const full=path.join(current,e.name);
      if(e.isSymbolicLink()) continue;
      if(e.isDirectory()){await walk(full,r);continue;}
      const st=await fs.stat(full);
      if(st.size>MAX_FILE_BYTES) continue;
      const buf=await fs.readFile(full);
      map.set(r,{hash:crypto.createHash("sha256").update(buf).digest("hex"),size:buf.length,buf});
    }
  }
  await walk(dir).catch(()=>{});
  return map;
}

function changed(before,after){
  const names=new Set([...before.keys(),...after.keys()]);
  return [...names].filter(n=>before.get(n)?.hash!==after.get(n)?.hash).sort();
}

async function readChangedFiles(dir,names){
  const rows=[];
  for(const rel of names.slice(0,MAX_FILES)){
    const full=path.join(dir,rel);
    try{
      const st=await fs.stat(full);
      if(st.size>MAX_FILE_BYTES) continue;
      const content=await fs.readFile(full,"utf8");
      rows.push({path:rel,content,size:st.size});
    }catch{
      rows.push({path:rel,deleted:true});
    }
  }
  return rows;
}

async function runCodex(dir,instruction){
  const bin=codexBin();
  const args=["exec","--sandbox","workspace-write","--skip-git-repo-check","--json",String(instruction||"")];
  return new Promise((resolve,reject)=>{
    const child=spawn(bin,args,{
      cwd:dir,
      env:{
        ...process.env,
        HOME:process.env.CODEX_HOME || process.env.HOME,
        // The CLI receives no Avalynx provider secrets through custom argv.
      },
      stdio:["ignore","pipe","pipe"]
    });

    let stdout="",stderr="",bytes=0,killed=false;
    const take=(chunk,target)=>{
      if(bytes>=MAX_OUTPUT_BYTES)return target;
      const s=Buffer.from(chunk).toString("utf8");
      bytes+=Buffer.byteLength(s);
      return target+s.slice(0,Math.max(0,MAX_OUTPUT_BYTES-target.length));
    };
    child.stdout.on("data",c=>{stdout=take(c,stdout)});
    child.stderr.on("data",c=>{stderr=take(c,stderr)});
    child.on("error",reject);

    const timer=setTimeout(()=>{
      killed=true;
      try{child.kill("SIGTERM")}catch{}
      setTimeout(()=>{try{child.kill("SIGKILL")}catch{}},1500).unref?.();
    },RUN_TIMEOUT_MS);

    child.on("exit",code=>{
      clearTimeout(timer);
      if(killed)return reject(new Error("Codex CLI execution timed out."));
      resolve({code,stdout,stderr});
    });
  });
}

function humanCodexSummary(stdout,stderr){
  const lines=String(stdout||"").split(/\r?\n/).filter(Boolean);
  const messages=[];
  for(const line of lines){
    try{
      const obj=JSON.parse(line);
      const text=obj?.message?.content || obj?.content || obj?.text || obj?.item?.text;
      if(typeof text==="string"&&text.trim())messages.push(text.trim());
    }catch{}
  }
  return messages.at(-1)||String(stderr||"").trim()||"Codex CLI completed.";
}


function classifyCodexFailure({code,stdout="",stderr="",error=""}={}){
  const text=`${stdout}\n${stderr}\n${error}`.toLowerCase();

  if(/unauthorized|authentication|api key|invalid api key|missing.*key|login required|not authenticated|401|403/.test(text)){
    return {kind:"auth",title:"Autenticação do Codex falhou",hint:"O Codex CLI está instalado, mas o backend não está autenticado para executar tarefas."};
  }
  if(/sandbox|landlock|bubblewrap|bwrap|permission denied|operation not permitted|workspace-write|seccomp/.test(text)){
    return {kind:"sandbox",title:"Sandbox do Codex falhou",hint:"O Codex iniciou, mas o sandbox workspace-write foi bloqueado pelo ambiente do servidor."};
  }
  if(/enoent|not found|command not found|spawn .*codex/.test(text)){
    return {kind:"path",title:"Codex CLI não encontrado",hint:"A execução não encontrou o binário configurado no PATH."};
  }
  if(/timed out|timeout|deadline/.test(text)){
    return {kind:"timeout",title:"Codex excedeu o tempo limite",hint:"A execução passou do limite configurado no backend."};
  }
  if(/rate limit|quota|insufficient|credits|billing|429|402/.test(text)){
    return {kind:"quota",title:"Limite do provider do Codex",hint:"O provider recusou a execução por cota, rate limit ou cobrança."};
  }
  return {kind:"runtime",title:"Codex CLI encerrou com erro",hint:"Veja stderr/stdout abaixo para identificar a causa concreta."};
}

function safeDiagnosticText(value,max=12000){
  return String(value||"")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g,"[REDACTED_OPENAI_KEY]")
    .replace(/hf_[A-Za-z0-9]{12,}/g,"[REDACTED_HF_TOKEN]")
    .replace(/nvapi-[A-Za-z0-9_-]{12,}/g,"[REDACTED_NVIDIA_KEY]")
    .slice(0,max);
}

export async function handleCodeEngine(req,res,url,body={}){
  if(url.pathname==="/api/code/status"&&req.method==="GET"){
    const available=await commandExists(codexBin());
    return json(res,200,{
      engine:"codex-cli",
      available,
      binary:codexBin(),
      sandbox:"workspace-write",
      timeoutMs:RUN_TIMEOUT_MS,
      authEnvPresent:Boolean(process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY),
      diagnostics:{
        cwd:process.cwd(),
        node:process.version,
        platform:process.platform,
        arch:process.arch
      }
    });
  }

  if(url.pathname==="/api/code/run"&&req.method==="POST"){
    if(process.env.AVA_CODE_ENGINE && process.env.AVA_CODE_ENGINE!=="codex"){
      return json(res,503,{error:"Codex engine is disabled by AVA_CODE_ENGINE."});
    }
    if(!(await commandExists(codexBin()))){
      return json(res,503,{
        error:"Codex CLI is not installed in this backend image.",
        hint:"Install @openai/codex in the server image or set CODEX_CLI_PATH."
      });
    }

    const instruction=String(body?.instruction||"").trim();
    if(!instruction)return json(res,400,{error:"instruction is required"});
    if(instruction.length>20000)return json(res,413,{error:"instruction too large"});

    await ensureRoot();
    const id=crypto.randomUUID();
    const dir=path.join(ROOT,id);
    await fs.mkdir(dir,{recursive:true,mode:0o700});

    try{
      await writeWorkspace(dir,body?.files||[]);
      const before=await snapshot(dir);
      const result=await runCodex(dir,instruction);
      const after=await snapshot(dir);
      const changedFiles=changed(before,after);
      const files=await readChangedFiles(dir,changedFiles);

      const failure=result.code===0 ? null : classifyCodexFailure(result);
      return json(res,result.code===0?200:502,{
        engine:"codex-cli",
        workspaceId:id,
        exitCode:result.code,
        summary:humanCodexSummary(result.stdout,result.stderr),
        changedFiles,
        files,
        failure,
        stderr:result.code===0?"":safeDiagnosticText(result.stderr),
        stdout:result.code===0?"":safeDiagnosticText(result.stdout),
        command:{
          binary:codexBin(),
          args:["exec","--sandbox","workspace-write","--skip-git-repo-check","--json","<instruction>"]
        }
      });
    }catch(error){
      const failure=classifyCodexFailure({error:String(error?.message||error)});
      return json(res,502,{
        error:safeDiagnosticText(error?.message||error),
        engine:"codex-cli",
        failure,
        exitCode:null,
        stderr:"",
        stdout:"",
        command:{
          binary:codexBin(),
          args:["exec","--sandbox","workspace-write","--skip-git-repo-check","--json","<instruction>"]
        }
      });
    }finally{
      setTimeout(()=>fs.rm(dir,{recursive:true,force:true}).catch(()=>{}),30*60*1000).unref?.();
    }
  }

  return json(res,404,{error:"Code engine route not found"});
}
