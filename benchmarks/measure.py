"""Deterministic metrics; no random data, no automatic accuracy claims."""
import json,sys,math

def distance(a,b):
 row=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  out=[i]
  for j,y in enumerate(b,1):out.append(min(out[-1]+1,row[j]+1,row[j-1]+(x!=y)))
  row=out
 return row[-1]
def percentile(values,p):
 if not values:return None
 v=sorted(values);pos=(len(v)-1)*p;lo=math.floor(pos);hi=math.ceil(pos)
 return v[lo]+(v[hi]-v[lo])*(pos-lo)
def metrics(data):
 speech=data.get('speech',[]);words=sum(len(x['reference'].split()) for x in speech)
 errors=sum(distance(x['reference'].lower().split(),x['hypothesis'].lower().split()) for x in speech)
 scores=data.get('scores',[]);lat=data.get('latency_ms',[]);ev=data.get('events',{})
 truth=ev.get('truth',[]);pred=ev.get('predicted',[]);used=set();tp=0
 for p in pred:
  choices=[(max(0,min(t['end'],p['end'])-max(t['start'],p['start'])),i) for i,t in enumerate(truth) if i not in used and all(t[k]==p[k] for k in ['session','role','type'])]
  if choices:
   overlap,i=max(choices)
   if overlap>0:tp+=1;used.add(i)
 fp=len(pred)-tp;fn=len(truth)-tp;hours=ev.get('benign_hours',0)
 # FP/hour denominator must be the evaluated interval, not unrelated benign time.
 return {'speech_samples':len(speech),'reference_words':words,'wer':errors/words if words else None,
  'latency_count':len(lat),'latency_p50_ms':percentile(lat,.5),'latency_p95_ms':percentile(lat,.95),
  'score_count':len(scores),'score_mae':sum(abs(x['human']-x['model']) for x in scores)/len(scores) if scores else None,
  'events':{'tp':tp,'fp':fp,'fn':fn,'precision':tp/len(pred) if pred else None,'recall':tp/len(truth) if truth else None},
  'note':'No uncertainty estimates included. Report sampling, split, coverage and matching rule. Calculate benign false alarms/hour on benign-only intervals separately.'}
if __name__=='__main__':print(json.dumps(metrics(json.load(open(sys.argv[1]))),indent=2))
