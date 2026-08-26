import { routeAndExecuteTools } from "../server/modules/runtime-tools.mjs";

async function body(req){
  if(req.body&&typeof req.body==="object")return req.body;
  let raw="";for await(const c of req)raw+=c;
  try{return raw?JSON.parse(raw):{}}catch{return {}}
}
export default async function handler(req,res){
  if(req.method!=="POST"){
    res.statusCode=405;res.setHeader("content-type","application/json");return res.end(JSON.stringify({ok:false,error:"Method not allowed"}));
  }
  try{
    const input=await body(req);
    const result=await routeAndExecuteTools(input);
    res.statusCode=200;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");
    res.end(JSON.stringify(result));
  }catch(error){
    res.statusCode=500;res.setHeader("content-type","application/json; charset=utf-8");
    res.end(JSON.stringify({ok:false,error:String(error?.message||error)}));
  }
}
