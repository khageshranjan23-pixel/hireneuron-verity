"""Independent trusted media subscriber. Real frames only; no client event authority.
OpenCV HOG + Haar are a conservative baseline, not validated production detectors.
Run one process per interview: python -m workers.integrity SESSION_ID
"""
import asyncio,time,sys,io,base64,logging
from collections import deque
from PIL import Image,ImageDraw
from livekit import rtc
from backend.app.core import TemporalDetector
from .common import client,connect,state

class BaselineCV:
 def __init__(self):
  import cv2
  self.cv=cv2;self.face=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_frontalface_default.xml')
  self.hog=cv2.HOGDescriptor();self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
 def infer(self,image):
  import numpy as np
  cv=self.cv;arr=np.array(image);gray=cv.cvtColor(arr,cv.COLOR_RGB2GRAY)
  faces=self.face.detectMultiScale(gray,scaleFactor=1.1,minNeighbors=5,minSize=(30,30))
  boxes,_=self.hog.detectMultiScale(arr,winStride=(8,8),padding=(8,8),scale=1.05)
  return len(faces),max(len(boxes),len(faces))

async def run(sid):
 async with client() as c:
  room=await connect(sid,'integrity');detector=TemporalDetector();cv=BaselineCV()
  tasks={};last={};gapped=set();rings={'primary':deque(maxlen=3),'secondary':deque(maxlen=3)}
  async def emit(role,kind,severity,frames,start,end):
   # Contact sheet retains multiple actual sampled frames and receive times.
   sheet=Image.new('RGB',(320*len(frames),260),'#101828');draw=ImageDraw.Draw(sheet)
   for i,(stamp,img) in enumerate(frames):
    thumb=img.copy();thumb.thumbnail((320,240));sheet.paste(thumb,(i*320,20));draw.text((i*320+4,4),f'{stamp:.3f} UTC epoch',fill='white')
   b=io.BytesIO();sheet.save(b,format='JPEG',quality=85)
   r=await c.post(f'/sessions/{sid}/events',json=dict(role=role,type=kind,severity=severity,jpeg_b64=base64.b64encode(b.getvalue()).decode(),algorithm='opencv-haar-hog-baseline-v1',frame_count=len(frames),start=start,end=end));r.raise_for_status()
  async def read(track,role):
   stream=rtc.VideoStream(track,format=rtc.VideoBufferType.RGB24);sample=0
   try:
    async for ev in stream:
     now=time.time()
     if now-sample<1:continue
     sample=now;last[role]=now;frame=ev.frame
     img=Image.frombytes('RGB',(frame.width,frame.height),bytes(frame.data));img.thumbnail((640,480))
     rings[role].append((now,img))
     if role in gapped:
      await emit(role,'COVERAGE_RESTORED','OBSERVED_EVENT',list(rings[role]),now,now);gapped.remove(role)
     faces,people=await asyncio.to_thread(cv.infer,img)
     for event in detector.update(role,faces,people,now):
      await emit(role,event['type'],event['severity'],list(rings[role]),event['start'],now)
   finally:await stream.aclose()
  def subscribe(track,publication,participant):
   roles={'candidate:'+sid:'primary','phone:'+sid:'secondary'}
   role=roles.get(participant.identity)
   if role and track.kind==rtc.TrackKind.KIND_VIDEO and publication.source==rtc.TrackSource.SOURCE_CAMERA:
    if role in tasks:tasks[role].cancel()
    tasks[role]=asyncio.create_task(read(track,role));last[role]=time.time()
  room.on('track_subscribed',subscribe)
  # Handle tracks already present when connect completed.
  for p in room.remote_participants.values():
   for pub in p.track_publications.values():
    if pub.track:subscribe(pub.track,pub,p)
  try:
   while True:
    s=await state(c,sid)
    if s['state'] not in ('BLUEPRINT_FROZEN','LISTENING'):break
    for role,stamp in list(last.items()):
     if time.time()-stamp>8 and role not in gapped and rings[role]:
      await emit(role,'FRAME_COVERAGE_GAP','UNVERIFIED',list(rings[role]),stamp,time.time());gapped.add(role)
    # Heartbeat is separate from evidence, including a never-received feed.
    await c.post(f'/sessions/{sid}/coverage',json={'worker':'integrity','frames':last,'algorithm':'opencv-haar-hog-baseline-v1'})
    await asyncio.sleep(2)
  finally:
   for t in tasks.values():t.cancel()
   await asyncio.gather(*tasks.values(),return_exceptions=True);await room.disconnect()
if __name__=='__main__':asyncio.run(run(sys.argv[1]))
