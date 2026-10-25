import os
import secrets
from datetime import timedelta

def token(sid, role):
    from livekit import api
    if role not in ('candidate', 'phone', 'integrity', 'voice', 'recruiter'):
        raise ValueError('Invalid media role')
    publish = role in ('candidate', 'phone', 'voice')
    grants = api.VideoGrants(
        room_join=True,
        room='verity-' + sid,
        can_publish=publish,
        can_subscribe=True,
        can_publish_data=True,
        can_update_own_metadata=False
    )
    # Unique identity prevents participant collision (WebSocket 1006) on mobile reconnects
    identity = f"{role}:{sid}:{secrets.token_hex(4)}" if role == 'phone' else f"{role}:{sid}"
    return api.AccessToken(os.environ['LIVEKIT_API_KEY'], os.environ['LIVEKIT_API_SECRET']).with_identity(identity).with_grants(grants).with_ttl(timedelta(minutes=30)).to_jwt()

