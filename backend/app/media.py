import os
from datetime import timedelta

def token(sid,role):
 from livekit import api
 if role not in ('candidate','phone','integrity','voice','recruiter'):raise ValueError('Invalid media role')
 sources=['camera'] if role=='phone' else ['camera','microphone'] if role=='candidate' else ['microphone']
 publish=role in ('candidate','phone','voice')
 grants=api.VideoGrants(room_join=True,room='verity-'+sid,can_publish=publish,
   can_subscribe=role!='phone',can_publish_data=False,can_publish_sources=sources if publish else [],can_update_own_metadata=False)
 return api.AccessToken(os.environ['LIVEKIT_API_KEY'],os.environ['LIVEKIT_API_SECRET']).with_identity(role+':'+sid).with_grants(grants).with_ttl(timedelta(minutes=10)).to_jwt()
