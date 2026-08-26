import { searchWeb } from "../server/modules/runtime-tools.mjs";
async function body(req){if(req.body&&typeof req.body==="object")return req.body;let raw="";for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{return {}}}
export default async function handler(req,res){
  const input=req.method==="POST"?await body(req):{};
  const u=new URL(req.url,"http://localhost");
  const q=String(input.q||u.searchParams.get("q")||"").trim();
  if(!q){res.statusCode=400;res.setHeader("content-type","application/json");return res.end(JSON.stringify({ok:false,error:"q is required"}))}
  const data=await searchWeb(q,{limit:Math.min(8,Math.max(1,Number(input.limit||u.searchParams.get("limit")||6)))});
  res.statusCode=data.ok?200:502;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");
  res.end(JSON.stringify(data));
}
