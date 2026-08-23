import { handleModelRouter } from "../server/modules/model-router.mjs";

export default async function handler(req,res){
  const url=new URL(req.url,"http://localhost");
  const route=String(url.searchParams.get("route")||"");
  url.pathname=route.startsWith("/")?route:`/${route}`;
  let body={};
  if(req.method!=="GET"&&req.method!=="HEAD"){
    const chunks=[];
    for await(const c of req)chunks.push(Buffer.from(c));
    try{body=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}")}catch{}
  }
  await handleModelRouter(req,res,url,body);
}
