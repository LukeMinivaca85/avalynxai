from fastapi import FastAPI,HTTPException,Header
from fastapi.responses import Response
from pydantic import BaseModel,Field
from typing import Optional
import io,os,torch,soundfile as sf
from qwen_tts import Qwen3TTSModel
app=FastAPI(title="Avalynx Ava Voice")
MODEL_ID=os.getenv("AVA_TTS_MODEL","Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"); TOKEN=os.getenv("AVA_TTS_SERVICE_TOKEN",""); DEVICE=os.getenv("AVA_TTS_DEVICE","cuda:0" if torch.cuda.is_available() else "cpu")
VOICE=os.getenv("AVA_VOICE_PROMPT","Young adult Brazilian Portuguese female AI voice. Clear, intelligent, warm and confident. Smooth modern timbre, natural Brazilian pronunciation, crisp articulation, subtle expressiveness, conversational delivery, no announcer voice and no robotic cadence.")
model=None
def get_model():
 global model
 if model is None:model=Qwen3TTSModel.from_pretrained(MODEL_ID,device_map=DEVICE,dtype=torch.bfloat16 if DEVICE!="cpu" else torch.float32)
 return model
class Req(BaseModel):
 text:str=Field(min_length=1,max_length=5000);voice:str="ava";language:str="pt-BR";style:str="conversational";format:str="wav"
@app.get("/health")
def health():return {"status":"ok","voice":"ava","model":MODEL_ID,"device":DEVICE}
@app.post("/v1/chat/voice/tts")
def tts(req:Req,authorization:Optional[str]=Header(default=None)):
 if TOKEN and authorization!=f"Bearer {TOKEN}":raise HTTPException(401,"Unauthorized")
 if req.voice.lower()!="ava":raise HTTPException(404,"Voice not found")
 lang={"pt-BR":"Portuguese","pt":"Portuguese","en":"English","en-US":"English","es":"Spanish","fr":"French","de":"German"}.get(req.language,"Portuguese")
 style={"conversational":"Natural conversational rhythm with subtle emotion.","excited":"Energetic and excited while preserving the same speaker identity.","calm":"Calm, gentle and reassuring.","serious":"Focused, serious and confident.","warm":"Warm, friendly and welcoming."}.get(req.style,"Natural conversational rhythm with subtle emotion.")
 wavs,sr=get_model().generate_voice_design(text=req.text,language=lang,instruct=VOICE+"\n"+style); b=io.BytesIO();sf.write(b,wavs[0],sr,format="WAV");return Response(b.getvalue(),media_type="audio/wav",headers={"X-Avalynx-Voice":"ava","Cache-Control":"no-store"})
