import asyncio, os, json, time, io, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from dotenv import load_dotenv

load_dotenv()
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app import store, providers

store.init()
client = TestClient(app)
recruiter_token = os.getenv('RECRUITER_TOKEN')
rec_headers = {'Authorization': f'Bearer {recruiter_token}'}

print('[*] 1. Creating session...')
res = client.post('/sessions', headers=rec_headers, json={
    'candidate_name': 'Alex Rivera',
    'job_title': 'Senior Distributed Systems Engineer',
    'job_description': 'Design, build, and maintain high-scale distributed backend systems, streaming data pipelines, and microservices in Python, Kafka, PostgreSQL, and Kubernetes.',
    'skills': ['Python', 'Kafka', 'PostgreSQL', 'Kubernetes', 'Distributed Systems'],
    'question_count': 3,
    'duration_minutes': 15,
    'answer_seconds': 90,
    'custom_questions': ['How do you handle schema evolution across microservices?'],
    'categories': ['technical', 'scenario', 'experience']
})
assert res.status_code == 200, res.text
sid = res.json()['session']['id']
candidate_token = res.json()['candidate_token']
cand_headers = {'Authorization': f'Bearer {candidate_token}'}
print(f'  ✓ Session created: {sid}')

print('[*] 2. Generating Gemini interview questions...')
q_res = client.post(f'/sessions/{sid}/questions', headers=rec_headers)
assert q_res.status_code == 200, q_res.text
session_data = q_res.json()
print(f"  ✓ Question generator: {session_data.get('generation')}")
for q in session_data['questions']:
    print(f"    - Slot {q['slot']} [{q['category']}]: {q['text'][:75]}...")

print('[*] 3. Candidate granting consent & starting interview...')
c_res = client.post(f'/sessions/{sid}/consent', headers=cand_headers, json={'accepted': True, 'policy_version': '2026-10-25'})
assert c_res.status_code == 200
s_res = client.post(f'/sessions/{sid}/start', headers=cand_headers)
assert s_res.status_code == 200
print('  ✓ Interview started. State is now LISTENING.')

print('[*] 4. Submitting candidate answer to question 1...')
q1 = s_res.json()['question']
ans_res = client.post(f'/sessions/{sid}/action', headers=cand_headers, json={
    'action': 'answer',
    'text': 'We use Protocol Buffers with backward compatibility guarantees. Every event schema contains an evolving version field, and consumers ignore unrecognized optional fields to prevent deserialization breaking changes.',
    'slot_id': q1['id'],
    'request_id': 'req-ans-1'
})
assert ans_res.status_code == 200
print('  ✓ Answer submitted and recorded.')

print('[*] 5. Simulating a proctoring event with encrypted snapshot...')
from PIL import Image
import base64
b = io.BytesIO()
Image.new('RGB', (320, 240), color='#1e293b').save(b, format='JPEG')
ev_data = {
    'role': 'primary',
    'type': 'HEAD_TURN_PROLONGED',
    'severity': 'OBSERVED_EVENT',
    'jpeg_b64': base64.b64encode(b.getvalue()).decode(),
    'algorithm': 'calibrated-cv-cascade-hog-v2',
    'frame_count': 3,
    'start': 10.0,
    'end': 14.5
}
ev_res = client.post(f'/sessions/{sid}/events', headers={'Authorization': 'Bearer ' + os.getenv('WORKER_TOKEN')}, json=ev_data)
assert ev_res.status_code == 200, ev_res.text
print('  ✓ Proctoring event stored and sealed with HMAC.')

print('[*] 6. Completing the interview...')
s2 = client.get(f'/sessions/{sid}', headers=cand_headers).json()
fin_res = client.post(f'/sessions/{sid}/action', headers=cand_headers, json={
    'action': 'finish',
    'slot_id': s2['question']['id'],
    'request_id': 'req-finish'
})
assert fin_res.status_code == 200
print('  ✓ Interview marked COMPLETED.')

print('[*] 7. Uploading session recording video...')
video_bytes = b'SAMPLE_RECORDED_WEBM_VIDEO_DATA_FOR_VERIFICATION'
rec_res = client.post(f'/sessions/{sid}/recording/upload', headers=cand_headers, files={'file': ('session.webm', video_bytes, 'video/webm')})
assert rec_res.status_code == 200, rec_res.text
print(f"  ✓ Recording uploaded with SHA-256: {rec_res.json()['sha256']}")

print('[*] 8. Evaluating answers with Gemini evaluation engine...')
with store.tx() as c:
    s_curr = store.get(c, sid)
for q in s_curr['questions']:
    if q['spans']:
        print(f"  Evaluating question: {q['text'][:60]}...")
        scores = asyncio.run(providers.evaluate(q, s_curr['rubric']))
        q['scores'] = scores
        print(f"    Scores: {scores.get('scores')}")
        print(f"    Rationale: {scores.get('rationale')[:100]}...")
        if scores.get('evidence'):
            print(f"    Verified Citation: {scores['evidence'][0]}")
with store.tx() as c:
    s_curr['state'] = 'REVIEW_READY'
    store.put(c, s_curr)

print('[*] 9. Adding recruiter audit override...')
ov_res = client.post(f'/sessions/{sid}/override', headers=rec_headers, json={
    'target_id': s_curr['questions'][0]['id'],
    'score': 5,
    'reason': 'Candidate demonstrated advanced schema evolution practices with concrete Protocol Buffers experience.'
})
assert ov_res.status_code == 200
print('  ✓ Recruiter audit override successfully saved.')

print('[*] 10. Verifying evidence integrity chain...')
ret = os.system(f'"{sys.executable}" scripts/verify_evidence.py {sid}')
assert ret == 0, 'Evidence verification failed'
print('  ✓ Cryptographic evidence chain fully verified!')
print('\n===> FULL WORKFLOW TEST PASSED WITH 100% SUCCESS! <===')
