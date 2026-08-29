import { collectBody } from "../proxy-core.mjs";
function json(res,status,data){res.statusCode=status;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");res.end(JSON.stringify(data))}
export async function handleVoiceTts(req,res){
  if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
  const upstream=process.env.AVA_TTS_UPSTREAM_URL||"http://127.0.0.1:8000/v1/chat/voice/tts";
  const headers={"content-type":req.headers["content-type"]||"application/json",accept:"audio/*"};
  if(process.env.AVA_TTS_UPSTREAM_TOKEN)headers.authorization=`Bearer ${process.env.AVA_TTS_UPSTREAM_TOKEN}`;
  try{
    const response=await fetch(upstream,{method:"POST",headers,body:await collectBody(req)});
    if(!response.ok)return json(res,response.status,{error:"Ava Voice upstream failed",detail:(await response.text()).slice(0,1000)});
    res.statusCode=200;res.setHeader("content-type",response.headers.get("content-type")||"audio/wav");res.setHeader("cache-control","no-store");res.setHeader("x-avalynx-voice","ava");res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){return json(res,502,{error:"Ava Voice unavailable",detail:String(error.message||error)})}
}
