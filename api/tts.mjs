import { handleVoiceTts } from "../server/modules/voice-tts.mjs";
export default async function handler(req,res){await handleVoiceTts(req,res)}
