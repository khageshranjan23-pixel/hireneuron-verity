"""Optional real LiveKit Egress recording. Requires explicitly consented active room.
Usage: python scripts/record_room.py SESSION_ID OUTPUT_PATH
OUTPUT_PATH is an Egress storage path configured on your Egress deployment, NOT a local download.
Cloud storage destination must be configured per your LiveKit project before use.
"""
import sys,os,asyncio
from pathlib import Path
from dotenv import load_dotenv
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));load_dotenv()
from backend.app import store
from livekit import api
async def main():
 sid,path=sys.argv[1:3]
 with store.connect() as c:s=store.get(c,sid)
 if s['state']!='LISTENING':raise SystemExit('Recording requires an active interview')
 if not any(x['role']=='candidate_recording' for x in s['consents']):
  raise SystemExit('Full recording consent not collected by baseline UI. Implement separate consent before enabling Egress; see docs/RECORDING.md.')
 async with api.LiveKitAPI() as lk:
  result=await lk.egress.start_room_composite_egress(api.RoomCompositeEgressRequest(room_name='verity-'+sid,layout='grid',file_outputs=[api.EncodedFileOutput(file_type=api.EncodedFileType.MP4,filepath=path)]))
  print('Egress ID:',result.egress_id,'Check finalized output before showing replay.')
if __name__=='__main__':asyncio.run(main())
