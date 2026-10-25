"""Cross-platform launcher. All paths resolved relative to repository root."""
import os,sys,subprocess
from pathlib import Path
from dotenv import load_dotenv
root=Path(__file__).resolve().parents[1];os.chdir(root);load_dotenv(root/'.env')
kind=sys.argv[1] if len(sys.argv)>1 else 'api'
commands={'api':[sys.executable,'-m','uvicorn','backend.app.main:app','--host','0.0.0.0','--port','8000'],
 'evaluate':[sys.executable,'-m','workers.evaluation'],
 'supervisor':[sys.executable,'-m','workers.supervisor'],
 'voice':[sys.executable,'-m','workers.voice',*sys.argv[2:]],
 'integrity':[sys.executable,'-m','workers.integrity',*sys.argv[2:]],
 'test':[sys.executable,'-m','pytest','backend/tests','-q']}
if kind not in commands:raise SystemExit('Use api, evaluate, supervisor, voice SESSION_ID, integrity SESSION_ID, or test')
raise SystemExit(subprocess.call(commands[kind]))
