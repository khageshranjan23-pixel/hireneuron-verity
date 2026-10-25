"""Pure, deterministic interview rules. No vendor dependency or media-based scoring."""
import hashlib, hmac, json, secrets, time, uuid

def uid(): return str(uuid.uuid4())
def digest(s): return hashlib.sha256(s.encode()).hexdigest()
def canonical(x): return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def seal(record,secret): return hmac.new(secret.encode(),canonical(record).encode(),hashlib.sha256).hexdigest()

RUBRIC = {
 'correctness': {'weight':.4,'anchors':{'1':'Substantially incorrect','3':'Core idea correct with gaps','5':'Correct with relevant qualifications'}},
 'relevance': {'weight':.2,'anchors':{'1':'Does not address question','3':'Addresses main question','5':'Direct and well scoped'}},
 'reasoning': {'weight':.3,'anchors':{'1':'Unsupported assertions','3':'Some rationale','5':'Clear rationale and tradeoffs'}},
 'clarity': {'weight':.1,'anchors':{'1':'Meaning cannot be followed','3':'Understandable explanation','5':'Logical, precise explanation'}}
}
TEMPLATES=[
 ('technical','Explain how {skill} works. Give a concrete example and one limitation.'),
 ('scenario','A production system using {skill} becomes unreliable. How would you investigate?'),
 ('experience','Describe a project where you used {skill}. What did you personally implement?'),
 ('behavioral','Describe a disagreement about a {skill} design. How did you resolve it?'),
 ('technical','What tradeoffs matter when selecting {skill} for a new project?'),
 ('scenario','How would you test a change involving {skill} before release?'),
 ('experience','What was the hardest failure you encountered with {skill}, and what did you learn?'),
 ('technical','How would you explain {skill} to a new teammate?'),
 ('scenario','Given limited time, how would you simplify a solution involving {skill}?'),
 ('behavioral','How would you communicate uncertainty in an estimate for a {skill} task?')]

def blueprint(config):
 n=config.get('question_count') or 10
 custom=config.get('custom_questions',[])
 if len(custom)>n: raise ValueError('Custom questions exceed primary question count')
 skills=config.get('skills') or ['the role requirements']
 cats=config.get('categories') or ['technical','scenario','experience','behavioral']
 bank=[t for t in TEMPLATES if t[0] in cats]
 if not bank: raise ValueError('Select a supported category')
 qs=[]
 for i in range(n):
  cat,template=bank[i%len(bank)]
  text=custom[i] if i<len(custom) else template.format(skill=skills[i%len(skills)])
  if any(q['text']==text for q in qs): text += f' Focus on a different example for {config["job_title"]}, case {i+1}.'
  qs.append(dict(id=uid(),slot=i+1,text=text,category='recruiter' if i<len(custom) else cat,
    skill=skills[i%len(skills)],locked=i<len(custom),status='PENDING',spans=[],followup=None,scores=None))
 return qs

def new_session(config):
 return dict(id=uid(),config=config,questions=blueprint(config),rubric=RUBRIC,state='BLUEPRINT_FROZEN',
  current=0,created_at=time.time(),started_at=None,question_started_at=None,consents=[],events=[],audit=[],
  revision=0,processed={},pending_skip=False,phase='primary',generation='local templates; not AI',coverage={},
  profile=config.get('candidate_profile'),alignment=config.get('skill_alignment'))

def active(s): return s['questions'][s['current']] if s['current']<len(s['questions']) else None

def finish(s):
 for q in s['questions']:
  if q['status'] in ('PENDING','ANSWERING','ASKING'): q['status']='TIMED_OUT' if q['spans'] else 'UNANSWERED'
 s['state']='COMPLETED'

def disqualify(s, reason='Exceeded maximum permitted proctoring warnings (unfair means detected).'):
 for q in s['questions']:
  if q['status'] in ('PENDING','ANSWERING','ASKING'): q['status']='UNANSWERED'
 s['state']='DISQUALIFIED'
 s['disqualified_at']=time.time()
 s['disqualification_reason']=reason
 s['audit'].append(dict(at=time.time(),by='proctor_controller',action='disqualify',note=reason))

def start(s,now):
 if s['state']!='BLUEPRINT_FROZEN': raise ValueError('Interview already started or completed')
 if not any(c['role']=='candidate' for c in s['consents']): raise ValueError('Consent required')
 s.update(state='LISTENING',started_at=now,question_started_at=now)
 active(s)['status']='ANSWERING'

def advance(s,now):
 s['current']+=1; s['phase']='primary'; s['pending_skip']=False
 if active(s):
  s['question_started_at']=now; active(s)['status']='ANSWERING'
 else: s['state']='COMPLETED'

def tick(s,now):
 if s['state']!='LISTENING': return
 if now-s['started_at']>=s['config']['duration_minutes']*60:
  finish(s); return
 q=active(s)
 if now-s['question_started_at']>=s['config']['answer_seconds']:
  q['status']='TIMED_OUT' if q['spans'] else 'UNANSWERED'; advance(s,now)

def command(s,action,text,now,slot_id=None):
 tick(s,now)
 if s['state']!='LISTENING': raise ValueError('Interview is not listening')
 q=active(s)
 if slot_id and q['id']!=slot_id: raise ValueError('Stale question; reload state')
 if action=='repeat': return q['followup'] if s['phase']=='followup' else q['text']
 if action=='request_skip': s['pending_skip']=True; return 'Do you want to skip this question?'
 if action=='cancel_skip': s['pending_skip']=False; return 'Continue your answer.'
 if action=='skip':
  if not s['pending_skip']: raise ValueError('Confirm skip first')
  q['status']='SKIPPED'; advance(s,now); return None
 if action=='finish': finish(s); return None
 if action=='disqualify': disqualify(s, text or 'Exceeded maximum permitted proctoring warnings (unfair means detected).'); return None
 if action not in ('answer','partial'): raise ValueError('Unknown action')
 text=text.strip()
 if text: q['spans'].append(dict(id=uid(),text=text,offset=round(now-s['started_at'],3),phase=s['phase'],source='candidate_text'))
 if action=='partial': return None
 q['status']='COMPLETED' if q['spans'] else 'UNANSWERED'
 advance(s,now)
 return None

class TemporalDetector:
 """Legacy thresholds kept for reference. Production detector lives in workers/integrity.py."""
 def __init__(self,absence=5,multiple=3,cooldown=20,head_turn=4):
  self.absence=absence;self.multiple=multiple;self.cooldown=cooldown;self.head_turn=head_turn;self.since={};self.last={}
 def update(self,role,faces,persons,now,profile_faces=0):
  out=[]
  for kind,condition,threshold,severity in [
   ('FACE_ABSENT',role=='primary' and faces==0 and profile_faces==0,self.absence,'NEEDS_REVIEW'),
   ('HEAD_TURN_PROLONGED',role=='primary' and faces==0 and profile_faces>0,self.head_turn,'OBSERVED_EVENT'),
   ('MULTIPLE_PERSONS',persons>=2,self.multiple,'NEEDS_REVIEW_HIGH')]:
   key=(role,kind)
   if not condition: self.since.pop(key,None);continue
   self.since.setdefault(key,now)
   if now-self.since[key]>=threshold and now-self.last.get(key,-1e12)>=self.cooldown:
    out.append(dict(type=kind,severity=severity,role=role,start=self.since[key],end=now));self.last[key]=now
  return out

def validate_assessment(result,q):
 """Reject fabricated quotations and unknown span IDs, even in valid provider JSON."""
 if result.get('status')=='insufficient_evidence': return result
 spans={s['id']:s['text'] for s in q['spans']}
 if not spans: raise ValueError('Cannot score absent evidence')
 if set(result.get('scores',{}))!=set(RUBRIC): raise ValueError('Rubric dimensions mismatch')
 if any(type(v) is not int or not 1<=v<=5 for v in result['scores'].values()): raise ValueError('Scores outside rubric')
 if not result.get('evidence'): raise ValueError('Evidence citations required')
 for e in result['evidence']:
  if not e.get('quote') or e.get('span_id') not in spans or e['quote'] not in spans[e['span_id']]:
   raise ValueError('Unsupported evidence citation')
 return result
