"""Worker Supervisor.
Monitors active interview sessions (BLUEPRINT_FROZEN / LISTENING) and automatically
supervises dedicated voice and integrity worker processes per active session.
Avoids duplicate processes, gracefully cleans up completed sessions, and restarts failed workers.
"""
import sys, os, time, subprocess, logging, signal
from pathlib import Path
from dotenv import load_dotenv

# Ensure root is in path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / '.env')

from backend.app import store

logging.basicConfig(level=logging.INFO, format="%(asctime)s [Supervisor] %(message)s")
logger = logging.getLogger("supervisor")

running_procs = {}  # (sid, worker_type) -> Popen

def terminate_proc(key):
    proc = running_procs.pop(key, None)
    if proc:
        sid, kind = key
        logger.info("Stopping %s worker for session %s (PID %d)...", kind, sid, proc.pid)
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

def clean_all():
    keys = list(running_procs.keys())
    for k in keys:
        terminate_proc(k)

def run_loop():
    logger.info("HireNeuron Verity Worker Supervisor started.")
    store.init()
    
    while True:
        try:
            # Check for dead processes
            for (sid, kind), proc in list(running_procs.items()):
                code = proc.poll()
                if code is not None:
                    logger.warning("%s worker for %s exited with code %s", kind, sid, code)
                    running_procs.pop((sid, kind), None)
            
            # Query active sessions
            with store.connect() as c:
                rows = c.execute("SELECT id, data FROM sessions").fetchall()
            
            active_sids = set()
            for r in rows:
                import json
                try:
                    s = json.loads(r['data'])
                except Exception:
                    continue
                sid = s['id']
                state = s.get('state')
                
                if state in ('BLUEPRINT_FROZEN', 'LISTENING'):
                    active_sids.add(sid)
                    
                    # Check / start voice worker
                    if (sid, 'voice') not in running_procs:
                        logger.info("Spawning voice worker for active session: %s", sid)
                        p = subprocess.Popen([sys.executable, '-m', 'workers.voice', sid])
                        running_procs[(sid, 'voice')] = p
                    
                    # Check / start integrity worker
                    if (sid, 'integrity') not in running_procs:
                        logger.info("Spawning integrity worker for active session: %s", sid)
                        p = subprocess.Popen([sys.executable, '-m', 'workers.integrity', sid])
                        running_procs[(sid, 'integrity')] = p
            
            # Clean up processes for sessions that are no longer active
            for (sid, kind) in list(running_procs.keys()):
                if sid not in active_sids:
                    terminate_proc((sid, kind))
                    
        except Exception as e:
            logger.error("Supervisor loop iteration error: %s", e)
            
        time.sleep(1.5)

if __name__ == '__main__':
    try:
        run_loop()
    except KeyboardInterrupt:
        logger.info("Shutdown signal received.")
    finally:
        clean_all()
        logger.info("Supervisor stopped cleanly.")
