import { handleCodeEngine } from "../server/modules/code-engine.mjs";

export default async function handler(req,res){
  const url=new URL(req.url,"http://localhost");
  const path=String(url.searchParams.get("path")||"status");
  url.pathname=`/api/code/${path.replace(/^\/+/,"")}`;
  let body={};
  if(req.method!=="GET"&&req.method!=="HEAD"){
    const chunks=[];
    for await(const c of req)chunks.push(Buffer.from(c));
    try{body=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}")}catch{}
  }
  await handleCodeEngine(req,res,url,body);
}
