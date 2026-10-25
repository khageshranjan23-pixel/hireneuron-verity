import os,io,base64
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from backend.app import store
from backend.app.main import app
from PIL import Image
@pytest.fixture
def client(tmp_path,monkeypatch):
 monkeypatch.setattr(store,'DB',str(tmp_path/'test.db'))
 for k in ('RECRUITER_TOKEN','WORKER_TOKEN','SIGNING_KEY'):monkeypatch.setenv(k,'test-'+k+'x'*32)
 monkeypatch.setenv('EVIDENCE_KEY',Fernet.generate_key().decode());monkeypatch.setenv('EVIDENCE_PATH',str(tmp_path/'evidence'))
 with TestClient(app) as c:yield c

def headers(role='RECRUITER'):return {'Authorization':'Bearer '+os.environ[role+'_TOKEN']}
def create(c):
 r=c.post('/sessions',headers=headers(),json={'candidate_name':'API Test','job_title':'Engineer','job_description':'Develop APIs and test them','skills':['Python']});assert r.status_code==200
 data=r.json();return data['session']['id'],{'Authorization':'Bearer '+data['candidate_token']}
def begin(c,sid,h):
 assert c.post(f'/sessions/{sid}/consent',headers=h,json={'accepted':True}).status_code==200
 assert c.post(f'/sessions/{sid}/start',headers=h).status_code==200

def test_auth_and_isolation(client):
 a,ha=create(client);b,hb=create(client)
 assert client.get('/sessions').status_code==401
 assert client.get('/sessions/'+b,headers=ha).status_code==403
 assert client.get('/sessions/'+a,headers=ha).status_code==200
 assert client.get('/sessions',headers=ha).status_code==403

def test_atomic_pair_one_use(client):
 sid,h=create(client);begin(client,sid,h)
 n=client.post(f'/sessions/{sid}/pair',headers=h).json()['nonce']
 assert client.post('/pair/redeem',json={'nonce':n,'accepted':False}).status_code==409
 r=client.post('/pair/redeem',json={'nonce':n,'accepted':True});assert r.status_code==200
 assert client.post('/pair/redeem',json={'nonce':n,'accepted':True}).status_code==410
 assert client.get('/sessions/'+sid,headers={'Authorization':'Bearer '+r.json()['token']}).status_code==403

def test_action_idempotency(client):
 sid,h=create(client);begin(client,sid,h);s=client.get('/sessions/'+sid,headers=h).json()
 body={'action':'answer','text':'I use tests.','slot_id':s['question']['id'],'request_id':'unique-request-123'}
 assert client.post(f'/sessions/{sid}/action',headers=h,json=body).status_code==200
 assert client.post(f'/sessions/{sid}/action',headers=h,json=body).status_code==200
 assert client.get('/sessions/'+sid,headers=h).json()['current']==1
 body['request_id']='new-request-456'
 assert client.post(f'/sessions/{sid}/action',headers=h,json=body).status_code==409

def test_candidate_cannot_forge_evidence(client):
 sid,h=create(client);begin(client,sid,h)
 data={'role':'primary','type':'TEST','severity':'OBSERVED_EVENT','jpeg_b64':'eA==','algorithm':'test','frame_count':1,'start':0,'end':1}
 assert client.post(f'/sessions/{sid}/events',headers=h,json=data).status_code==403

def test_encrypted_evidence_access_and_delete(client):
 sid,h=create(client);begin(client,sid,h)
 b=io.BytesIO();Image.new('RGB',(10,10),'white').save(b,format='JPEG')
 data={'role':'primary','type':'UNIT_TEST_FIXTURE','severity':'OBSERVED_EVENT','jpeg_b64':base64.b64encode(b.getvalue()).decode(),'algorithm':'unit-test-only','frame_count':1,'start':0,'end':1}
 r=client.post(f'/sessions/{sid}/events',headers=headers('WORKER'),json=data);assert r.status_code==200
 eid=r.json()['id'];url=f'/sessions/{sid}/evidence/{eid}'
 assert client.get(url,headers=h).status_code==403
 assert client.get(url,headers=headers()).content==b.getvalue()
 from pathlib import Path
 stored=next(Path(os.environ['EVIDENCE_PATH']).iterdir()).read_bytes();assert stored!=b.getvalue()
 s=client.get('/sessions/'+sid,headers=h).json();client.post(f'/sessions/{sid}/action',headers=h,json={'action':'finish','slot_id':s['question']['id'],'request_id':'finish-request'})
 assert client.delete('/sessions/'+sid,headers=headers()).status_code==200
 assert not list(Path(os.environ['EVIDENCE_PATH']).iterdir())

def test_override_append_only(client):
 sid,h=create(client);s=client.get('/sessions/'+sid,headers=headers()).json();qid=s['questions'][0]['id']
 for score in [3,4]:assert client.post(f'/sessions/{sid}/override',headers=headers(),json={'target_id':qid,'score':score,'reason':'Reviewed actual answer'}).status_code==200
 s=client.get('/sessions/'+sid,headers=headers()).json()
 assert len(s['audit'])==2 and s['questions'][0]['scores'] is None

def test_missing_consent_and_provider(client):
 sid,h=create(client)
 assert client.post(f'/sessions/{sid}/start',headers=h).status_code==409
 assert client.post(f'/sessions/{sid}/evaluate',headers=headers()).status_code==409
 assert client.post(f'/sessions/{sid}/questions',headers=headers()).status_code==503

def test_request_payload_conflict(client):
 sid,h=create(client);begin(client,sid,h);q=client.get('/sessions/'+sid,headers=h).json()['question']
 b={'action':'partial','text':'first','slot_id':q['id'],'request_id':'same-request-id'}
 assert client.post(f'/sessions/{sid}/action',headers=h,json=b).status_code==200
 b['text']='different'
 assert client.post(f'/sessions/{sid}/action',headers=h,json=b).status_code==409

def test_phone_grants(client,monkeypatch):
 import json,base64
 from backend.app.media import token
 monkeypatch.setenv('LIVEKIT_API_KEY','test-api-key');monkeypatch.setenv('LIVEKIT_API_SECRET','a'*32)
 jwt=token('session-test','phone');payload=jwt.split('.')[1]
 body=json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)))
 assert body['video']['canPublishSources']==['camera']
 assert body['video']['canSubscribe'] is False
 assert body['video']['room']=='verity-session-test'
 assert body['sub']=='phone:session-test'

def test_expired_pair(client):
 sid,h=create(client);begin(client,sid,h)
 n=client.post(f'/sessions/{sid}/pair',headers=h).json()['nonce']
 with store.tx() as c:c.execute('UPDATE pairing SET expires=0')
 assert client.post('/pair/redeem',json={'nonce':n,'accepted':True}).status_code==410

def test_question_update_before_start(client):
 sid,h=create(client)
 s=client.get('/sessions/'+sid,headers=headers()).json()
 qid=s['questions'][0]['id']
 r=client.patch(f'/sessions/{sid}/questions/{qid}',headers=headers(),json={'text':'Custom recruiter wording for question 1?','category':'technical','skill':'Python'})
 assert r.status_code==200
 updated=r.json()['question']
 assert updated['text']=='Custom recruiter wording for question 1?'
 assert updated['locked'] is True
 begin(client,sid,h)
 r_after=client.patch(f'/sessions/{sid}/questions/{qid}',headers=headers(),json={'text':'Trying to change active'})
 assert r_after.status_code==409

def test_analyze_profile_deterministic(client):
 res=client.post('/documents/analyze-profile',headers=headers(),json={
  'resume_text':'Candidate Alice alice@example.com experienced with Python, Docker and SQL.',
  'job_description':'Need Python, FastAPI, and Kubernetes.',
  'skills':['Python','FastAPI','Kubernetes']
 })
 assert res.status_code==200
 data=res.json()
 assert 'profile' in data and 'alignment' in data
 assert 'Python' in data['alignment']['matched_skills']
 assert 'Kubernetes' in data['alignment']['missing_skills']

def test_recording_upload_and_stream(client):
 sid,h=create(client);begin(client,sid,h)
 assert client.get(f'/sessions/{sid}/recording',headers=headers()).status_code==404
 fake_video=b'REAL_INTERVIEW_MEDIA_BYTES_TEST_STREAM'
 r=client.post(f'/sessions/{sid}/recording/upload',headers=h,files={'file':('session.webm',fake_video,'video/webm')})
 assert r.status_code==200
 assert r.json()['status']=='uploaded'
 rec=client.get(f'/sessions/{sid}/recording',headers=headers())
 assert rec.status_code==200
 assert rec.content==fake_video
 assert client.delete(f'/sessions/{sid}/recording',headers=headers()).status_code==200
 assert client.get(f'/sessions/{sid}/recording',headers=headers()).status_code==404
