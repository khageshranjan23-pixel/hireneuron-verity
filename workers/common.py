import os,httpx
from backend.app.media import token
from livekit import rtc
API=os.getenv('API_INTERNAL_URL','http://localhost:8000')
def client():return httpx.AsyncClient(base_url=API,headers={'Authorization':'Bearer '+os.environ['WORKER_TOKEN']},timeout=35)
async def connect(sid,role):
 room=rtc.Room();await room.connect(os.environ['LIVEKIT_URL'],token(sid,role));return room
async def state(c,sid):
 r=await c.get('/sessions/'+sid);r.raise_for_status();return r.json()
