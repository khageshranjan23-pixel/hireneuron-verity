"""Autonomous AI Voice Interviewer with Deepgram Nova-3 STT, Deepgram Aura TTS,
audio pre-caching for sub-second question delivery, and contextual follow-ups.
"""
import asyncio, os, sys, json, time, uuid, logging
from collections import deque
from urllib.parse import urlencode
import httpx, websockets
from livekit import rtc
from backend.app.core import active
from .common import client, connect, state

logger = logging.getLogger(__name__)

async def run(sid):
    async with client() as c:
        room = await connect(sid, 'voice')
        source = rtc.AudioSource(24000, 1)
        track = rtc.LocalAudioTrack.create_audio_track('interviewer', source)
        await room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        
        speaking = False
        slot = None
        seen = set()
        audio_tasks = set()
        last_question = None
        tts_cache = {}  # text -> linear16 bytes
        
        async def fetch_tts(text: str) -> bytes:
            if text in tts_cache:
                return tts_cache[text]
            model = os.getenv('DEEPGRAM_TTS_MODEL', 'aura-asteria-en')
            key = os.getenv('DEEPGRAM_API_KEY')
            if not key:
                return b''
            try:
                async with httpx.AsyncClient(timeout=25) as h:
                    r = await h.post(
                        'https://api.deepgram.com/v1/speak',
                        params={'model': model, 'encoding': 'linear16', 'sample_rate': 24000, 'container': 'none'},
                        headers={'Authorization': f'Token {key}'},
                        json={'text': text}
                    )
                    r.raise_for_status()
                    data = r.content
                    tts_cache[text] = data
                    return data
            except Exception as e:
                logger.warning("Deepgram TTS request failed: %s", e)
                return b''
        
        async def say(text: str):
            nonlocal speaking
            if not text or not text.strip():
                return
            speaking = True
            try:
                data = await fetch_tts(text)
                if not data:
                    return
                # Stream frames in chunks of 960 bytes (20ms at 24kHz 16-bit mono)
                for i in range(0, len(data), 960):
                    if not speaking:  # Clean barge-in cancellation
                        break
                    chunk = data[i:i+960]
                    if len(chunk) % 2:
                        chunk = chunk[:-1]
                    if chunk:
                        await source.capture_frame(rtc.AudioFrame(chunk, 24000, 1, len(chunk) // 2))
                await source.wait_for_playout()
                await asyncio.sleep(0.3)
            except Exception as ex:
                logger.exception("TTS playback error: %s", ex)
            finally:
                speaking = False
        
        async def prefetch_primary_questions():
            """Pre-cache introductory and fixed question speech for low latency."""
            try:
                s = await state(c, sid)
                for q in s.get('questions', []):
                    if q.get('text') and q['text'] not in tts_cache:
                        await fetch_tts(q['text'])
            except Exception as e:
                logger.debug("Prefetch error: %s", e)
        
        asyncio.create_task(prefetch_primary_questions())
        
        async def listen(track):
            stream = rtc.AudioStream(track, sample_rate=16000, num_channels=1)
            timeline = deque(maxlen=30000)
            sent_seconds = 0.0
            params = {
                'model': 'nova-3',
                'language': 'en',
                'encoding': 'linear16',
                'sample_rate': 16000,
                'channels': 1,
                'interim_results': 'true',
                'endpointing': 1500
            }
            url = 'wss://api.deepgram.com/v1/listen?' + urlencode(params)
            
            try:
                async with websockets.connect(url, additional_headers={'Authorization': 'Token ' + os.environ['DEEPGRAM_API_KEY']}) as ws:
                    async def send():
                        nonlocal sent_seconds
                        async for ev in stream:
                            duration = ev.frame.samples_per_channel / 16000
                            timeline.append((sent_seconds, sent_seconds + duration, slot))
                            sent_seconds += duration
                            # Silence during TTS reduces acoustic echo feedback
                            await ws.send(bytes(len(ev.frame.data)) if speaking else bytes(ev.frame.data))
                    
                    async def receive():
                        nonlocal speaking
                        async for raw in ws:
                            ev = json.loads(raw)
                            if ev.get('type') != 'Results':
                                continue
                            
                            is_final = ev.get('is_final', False)
                            text = ev.get('channel', {}).get('alternatives', [{}])[0].get('transcript', '').strip()
                            if not text:
                                continue
                            
                            # Publish interim transcript over LiveKit data channel for real-time candidate UI captions
                            if not is_final:
                                if not speaking:
                                    try:
                                        await room.local_participant.publish_data(json.dumps({'type': 'interim', 'text': text}))
                                    except Exception:
                                        pass
                                continue
                            
                            # Clear interim preview on final chunk
                            try:
                                await room.local_participant.publish_data(json.dumps({'type': 'final', 'text': text}))
                            except Exception:
                                pass
                            
                            # Handle barge-in if candidate speaks while interviewer is talking
                            if speaking:
                                speaking = False
                                continue
                            
                            s = await state(c, sid)
                            q = active(s)
                            if s['state'] != 'LISTENING' or not q:
                                continue
                            
                            segment_start = float(ev.get('start', 0))
                            segment_end = segment_start + float(ev.get('duration', 0))
                            touched = {bound for a, b, bound in timeline if b > segment_start and a < segment_end}
                            if touched != {q['id']}:
                                logger.warning("Dropped transcript crossing slot boundary: %s", text)
                                continue
                            
                            fingerprint = (q['id'], ev.get('start'), ev.get('duration'), text)
                            if fingerprint in seen:
                                continue
                            seen.add(fingerprint)
                            
                            cmd = text.lower().strip(' .!?')
                            action = 'partial'
                            
                            if cmd in ('please repeat', 'repeat the question', 'repeat this question', 'can you repeat', 'repeat', 'could you repeat'):
                                action = 'repeat'
                            elif cmd in ('skip', 'skip this question', 'please skip', 'pass'):
                                action = 'request_skip'
                            elif s['pending_skip'] and cmd in ('yes', 'yes please', 'confirm skip', 'skip'):
                                action = 'skip'
                            elif s['pending_skip'] and cmd in ('no', 'no thanks', 'keep answering', 'cancel'):
                                action = 'cancel_skip'
                            elif cmd in ('done', 'done answering', "i'm done", 'next question', 'finished'):
                                action = 'answer'
                            
                            r = await c.post(
                                f'/sessions/{sid}/action',
                                json={'action': action, 'text': text if action == 'partial' else '', 'slot_id': q['id'], 'request_id': str(uuid.uuid4())}
                            )
                            if r.is_success and r.json().get('message'):
                                await say(r.json()['message'])
                            
                            # Check auto-endpoint or followup
                            if action == 'partial' and ev.get('speech_final') and os.getenv('AUTO_ENDPOINT', 'false') == 'true':
                                # Check contextual follow-up if candidate finished primary answer
                                if s['phase'] == 'primary' and not q['followup'] and s['config'].get('followups', True):
                                    fu_res = await c.post(
                                        f'/sessions/{sid}/followup',
                                        json={'action': 'answer', 'text': text, 'slot_id': q['id'], 'request_id': str(uuid.uuid4())}
                                    )
                                    if fu_res.is_success and fu_res.json().get('needed'):
                                        continue  # followup will be spoken by state loop
                                await c.post(
                                    f'/sessions/{sid}/action',
                                    json={'action': 'answer', 'text': '', 'slot_id': q['id'], 'request_id': str(uuid.uuid4())}
                                )
                    
                    send_task = asyncio.create_task(send())
                    recv_task = asyncio.create_task(receive())
                    try:
                        done, pending = await asyncio.wait([send_task, recv_task], return_when=asyncio.FIRST_COMPLETED)
                        for t in done:
                            t.result()
                    finally:
                        send_task.cancel()
                        recv_task.cancel()
                        await asyncio.gather(send_task, recv_task, return_exceptions=True)
            finally:
                await stream.aclose()
        
        def subscribed(track, pub, participant):
            if participant.identity == 'candidate:' + sid and track.kind == rtc.TrackKind.KIND_AUDIO:
                t = asyncio.create_task(listen(track))
                audio_tasks.add(t)
                t.add_done_callback(audio_tasks.discard)
        
        room.on('track_subscribed', subscribed)
        for p in room.remote_participants.values():
            for pub in p.track_publications.values():
                if pub.track:
                    subscribed(pub.track, pub, p)
        
        try:
            while True:
                s = await state(c, sid)
                if s['state'] not in ('BLUEPRINT_FROZEN', 'LISTENING'):
                    break
                q = active(s)
                slot = q['id'] if q and s['state'] == 'LISTENING' else None
                key = (q['id'], s['phase']) if q else None
                if s['state'] == 'LISTENING' and key != last_question:
                    last_question = key
                    question_text = q['followup'] if s['phase'] == 'followup' else q['text']
                    await say(question_text)
                
                await c.post(
                    f'/sessions/{sid}/coverage',
                    json={'worker': 'voice', 'algorithm': 'deepgram-nova3-aura-cached-v2', 'frames': {}}
                )
                await asyncio.sleep(0.5)
        finally:
            for t in list(audio_tasks):
                t.cancel()
            await asyncio.gather(*audio_tasks, return_exceptions=True)
            await room.disconnect()

if __name__ == '__main__':
    asyncio.run(run(sys.argv[1]))
