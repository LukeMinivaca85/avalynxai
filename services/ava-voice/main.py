from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional
import io, os, torch, soundfile as sf
from qwen_tts import Qwen3TTSModel
app=FastAPI(title="Avalynx Ava Voice")
MODEL_ID=os.getenv("AVA_TTS_MODEL","Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
TOKEN=os.getenv("AVA_TTS_SERVICE_TOKEN","")
DEVICE=os.getenv("AVA_TTS_DEVICE","cuda:0" if torch.cuda.is_available() else "cpu")
VOICE=os.getenv("AVA_VOICE_PROMPT","Young adult Brazilian Portuguese female AI voice. Clear, intelligent, warm, confident, natural Brazilian pronunciation, modern timbre, crisp articulation, subtle expressiveness, natural conversational pauses, no robotic cadence.")
_model=None
def model():
 global _model
 if _model is None:_model=Qwen3TTSModel.from_pretrained(MODEL_ID,device_map=DEVICE,dtype=torch.bfloat16 if DEVICE!="cpu" else torch.float32)
 return _model
class Req(BaseModel):
 text:str=Field(min_length=1,max_length=5000);voice:str="ava";language:str="pt-BR";style:str="conversational";format:str="wav"
@app.get("/health")
def health():return {"status":"ok","voice":"ava","model":MODEL_ID,"device":DEVICE}
@app.post("/v1/chat/voice/tts")
def tts(req:Req,authorization:Optional[str]=Header(default=None)):
 if TOKEN and authorization!=f"Bearer {TOKEN}":raise HTTPException(401,"Unauthorized")
 if req.voice.lower()!="ava":raise HTTPException(404,"Voice not found")
 language={"pt-BR":"Portuguese","pt":"Portuguese","en":"English","en-US":"English","es":"Spanish","fr":"French","de":"German"}.get(req.language,"Portuguese")
 styles={"conversational":"Natural conversational rhythm.","excited":"Energetic and excited while preserving identity.","calm":"Calm and reassuring.","serious":"Focused and confident.","warm":"Warm and welcoming."}
 wavs,sr=model().generate_voice_design(text=req.text,language=language,instruct=VOICE+"\\n"+styles.get(req.style,styles["conversational"]))
 buf=io.BytesIO();sf.write(buf,wavs[0],sr,format="WAV")
 return Response(buf.getvalue(),media_type="audio/wav",headers={"X-Avalynx-Voice":"ava","Cache-Control":"no-store"})
