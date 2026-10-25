"""Durable single-node evaluation queue; retry after a worker restart."""
import asyncio,time,os,logging
from backend.app import store,providers
async def run():
 store.init()
 while True:
  with store.tx() as c:
   c.execute("UPDATE jobs SET state='queued' WHERE state='running' AND updated<?",(time.time()-900,))
   job=c.execute("SELECT sid FROM jobs WHERE state='queued' ORDER BY updated LIMIT 1").fetchone()
   if job:
    sid=job[0];c.execute("UPDATE jobs SET state='running',updated=? WHERE sid=?",(time.time(),sid));s=store.get(c,sid)
  if not job:await asyncio.sleep(2);continue
  results={}
  for q in s['questions']:
   try:results[q['id']]=await providers.evaluate(q,s['rubric'])|{'model':os.getenv('GEMINI_MODEL'),'evaluated_at':time.time()}
   except Exception:
    results[q['id']]={'status':'provider_unavailable','rationale':'Assessment unavailable. Retry or review manually.'}
  with store.tx() as c:
   try:current=store.get(c,sid)
   except KeyError:continue
   for q in current['questions']:q['scores']=results[q['id']]
   current['state']='REVIEW_READY';store.put(c,current)
   c.execute("UPDATE jobs SET state='done',updated=? WHERE sid=?",(time.time(),sid))
if __name__=='__main__':asyncio.run(run())
