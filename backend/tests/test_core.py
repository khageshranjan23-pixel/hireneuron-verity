import copy
import pytest
from backend.app import core

def session(**kw):
 c=dict(candidate_name='Test fixture',job_title='Engineer',skills=['Python'],question_count=10,
  duration_minutes=25,answer_seconds=120,custom_questions=[],categories=['technical','scenario','experience','behavioral'])|kw
 s=core.new_session(c);s['consents']=[{'role':'candidate'}];core.start(s,1000);return s

def test_default_ten():assert len(session(question_count=None)['questions'])==10

def test_custom_unchanged():assert session(custom_questions=['Exact question?'])['questions'][0]['text']=='Exact question?'

def test_custom_count_bound():
 with pytest.raises(ValueError):session(question_count=1,custom_questions=['one','two'])

def test_repeat_does_not_advance():
 s=session();core.command(s,'repeat','',1001);assert s['current']==0 and core.active(s)['status']=='ANSWERING'

def test_skip_requires_confirmation():
 s=session()
 with pytest.raises(ValueError):core.command(s,'skip','',1001)
 core.command(s,'request_skip','',1002);core.command(s,'skip','',1003)
 assert s['current']==1 and s['questions'][0]['status']=='SKIPPED'

def test_silence_unanswered():
 s=session();core.tick(s,1121);assert s['questions'][0]['status']=='UNANSWERED'

def test_partial_timeout():
 s=session();core.command(s,'partial','A partial answer',1001);core.tick(s,1121)
 assert s['questions'][0]['status']=='TIMED_OUT' and s['questions'][0]['spans'][0]['text']=='A partial answer'

def test_stale_slot_rejected():
 s=session();old=core.active(s)['id'];core.command(s,'answer','First',1002,old)
 with pytest.raises(ValueError):core.command(s,'answer','Late text',1003,old)
 assert not core.active(s)['spans']

def test_hard_duration():
 s=session(duration_minutes=2);core.tick(s,1120);assert s['state']=='COMPLETED'
 assert all(q['status']=='UNANSWERED' for q in s['questions'])

def test_finish_preserves_completed():
 s=session();core.command(s,'answer','Evidence',1001);core.finish(s)
 assert s['questions'][0]['status']=='COMPLETED' and s['questions'][1]['status']=='UNANSWERED'

def test_temporal_reset():
 d=core.TemporalDetector();assert not d.update('primary',0,1,0)
 assert not d.update('primary',1,1,4)
 assert not d.update('primary',0,1,5)
 assert not d.update('primary',0,1,9)
 assert d.update('primary',0,1,10)[0]['type']=='FACE_ABSENT'

def test_multiple_secondary():
 d=core.TemporalDetector();assert not d.update('secondary',0,2,0)
 assert d.update('secondary',0,2,3)[0]['severity']=='NEEDS_REVIEW_HIGH'
 assert not d.update('secondary',0,2,4)

def test_no_secondary_face_absence():
 d=core.TemporalDetector();d.update('secondary',0,1,0);assert not d.update('secondary',0,1,30)

def test_citation_validation():
 q={'spans':[{'id':'s1','text':'I used a transaction.'}]}
 r={'status':'scored','scores':dict.fromkeys(core.RUBRIC,3),'evidence':[{'span_id':'s1','quote':'a transaction'}]}
 assert core.validate_assessment(r,q)==r
 for bad in ['invented quotation','']:
  r['evidence'][0]['quote']=bad
  with pytest.raises(ValueError):core.validate_assessment(r,q)

def test_hmac_tamper():
 r={'id':'test','score':4};s=core.seal(r,'secret');r['score']=5;assert s!=core.seal(r,'secret')

def test_no_consent_start():
 s=core.new_session({'job_title':'Engineer','skills':['Python']})
 with pytest.raises(ValueError):core.start(s,1000)
