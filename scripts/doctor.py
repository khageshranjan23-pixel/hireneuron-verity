import os,sys,importlib.util,platform
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1]/'.env')
print('Python',platform.python_version())
for m in ['fastapi','livekit','cv2','cryptography','httpx','websockets']:
 print(m,'OK' if importlib.util.find_spec(m) else 'MISSING')
for key in ['RECRUITER_TOKEN','WORKER_TOKEN','EVIDENCE_KEY','SIGNING_KEY','LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','GEMINI_API_KEY','GEMINI_MODEL','DEEPGRAM_API_KEY','DEEPGRAM_TTS_MODEL']:
 print(key, 'SET' if os.getenv(key) else 'MISSING')
print('This checks configuration presence, not provider access or accuracy. Never paste secret values in logs.')
