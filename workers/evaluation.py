"""Durable single-node evaluation worker with transactional job queue.
Evaluates candidate answer spans against frozen rubrics using Gemini reasoning,
validating exact citations and quotes without fabricating results.
"""
import asyncio, time, os, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [EvaluationWorker] %(message)s")
logger = logging.getLogger("evaluation")

from backend.app import store, providers

async def run():
    store.init()
    logger.info("Evaluation worker started. Polling durable job queue...")
    
    while True:
        job = None
        s = None
        sid = None
        
        with store.tx() as c:
            # Reclaim stale running jobs (> 15 minutes)
            c.execute("UPDATE jobs SET state='queued' WHERE state='running' AND updated<?", (time.time() - 900,))
            row = c.execute("SELECT sid FROM jobs WHERE state='queued' ORDER BY updated LIMIT 1").fetchone()
            if row:
                sid = row[0]
                c.execute("UPDATE jobs SET state='running',updated=? WHERE sid=?", (time.time(), sid))
                s = store.get(c, sid)
                job = sid
                
        if not job or not s:
            await asyncio.sleep(2)
            continue
            
        logger.info("Processing evaluation job for session %s (Candidate: %s)", sid, s['config']['candidate_name'])
        results = {}
        
        for q in s['questions']:
            try:
                eval_res = await providers.evaluate(q, s['rubric'])
                eval_res['evaluated_at'] = time.time()
                results[q['id']] = eval_res
                logger.info("Scored question %d (%s): status=%s", q['slot'], q['skill'], eval_res.get('status'))
            except Exception as e:
                logger.warning("Assessment failed for question %d: %s", q['slot'], e)
                results[q['id']] = {
                    'status': 'provider_unavailable',
                    'rationale': f'Automated assessment encountered provider error ({e}). Recruiter review recommended.',
                    'scores': {},
                    'evidence': [],
                    'demonstrated_concepts': [],
                    'technical_correctness': 'N/A',
                    'reasoning_and_problem_solving': 'N/A',
                    'explanation_clarity': 'N/A',
                    'areas_needing_further_assessment': ['Manual review needed.'],
                    'strengths': [],
                    'gaps': []
                }
                
        with store.tx() as c:
            try:
                current = store.get(c, sid)
            except KeyError:
                logger.warning("Session %s was deleted during evaluation", sid)
                continue
                
            for q in current['questions']:
                q['scores'] = results.get(q['id'])
                
            current['state'] = 'REVIEW_READY'
            store.put(c, current)
            c.execute("UPDATE jobs SET state='done',updated=? WHERE sid=?", (time.time(), sid))
            logger.info("Evaluation complete for session %s. State transitioned to REVIEW_READY.", sid)

if __name__ == '__main__':
    asyncio.run(run())
