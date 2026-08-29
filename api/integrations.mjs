import { handleIntegrationOAuth } from "../server/modules/integration-oauth.mjs";
export default async function handler(req,res){
  const url=new URL(req.url,"http://localhost");
  const path=String(url.searchParams.get("path")||"");
  url.pathname=`/v1/integrations/${path.replace(/^\/+/,"")}`;
  await handleIntegrationOAuth(req,res,url);
}
