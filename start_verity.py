"""Cross-platform one-command launcher for HireNeuron Verity.
Starts API, Evaluation Worker, Worker Supervisor, and Next.js Dev Server.
Cleanly shuts down all child processes on Ctrl+C.
"""
import os, sys, time, subprocess, signal, urllib.request, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

VENV_PYTHON = str(ROOT / ('.venv/Scripts/python.exe' if os.name == 'nt' else '.venv/bin/python'))
if not os.path.exists(VENV_PYTHON):
    VENV_PYTHON = sys.executable

NPM_CMD = 'npm.cmd' if os.name == 'nt' else 'npm'

def get_recruiter_token():
    env_file = ROOT / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith('RECRUITER_TOKEN='):
                return line.split('=', 1)[1].strip()
    return ""

def main():
    print("=" * 60)
    print("  HIRENEURON VERITY — AUTONOMOUS AI INTERVIEWER")
    print("=" * 60)
    
    # Run doctor check
    subprocess.run([VENV_PYTHON, 'scripts/doctor.py'])
    
    token = get_recruiter_token()
    processes = []
    
    def shutdown(sig=None, frame=None):
        print("\n[*] Shutting down all HireNeuron Verity services...")
        for p in processes:
            try:
                p.terminate()
            except Exception:
                pass
        for p in processes:
            try:
                p.wait(timeout=3)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
        print("[*] All services stopped.")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, 'SIGTERM'):
        signal.signal(signal.SIGTERM, shutdown)

    print("\n[*] Launching services...")
    # 1. API
    p_api = subprocess.Popen([VENV_PYTHON, 'scripts/run.py', 'api'])
    processes.append(p_api)
    print("  ✓ API Server launched (http://localhost:8000)")

    # 2. Evaluation Worker
    p_eval = subprocess.Popen([VENV_PYTHON, 'scripts/run.py', 'evaluate'])
    processes.append(p_eval)
    print("  ✓ Evaluation Worker launched")

    # 3. Media Worker Supervisor
    p_sup = subprocess.Popen([VENV_PYTHON, 'scripts/run.py', 'supervisor'])
    processes.append(p_sup)
    print("  ✓ Voice & Integrity Supervisor launched")

    # 4. Next.js Frontend (Production Server)
    p_web = subprocess.Popen([NPM_CMD, '--prefix', 'web', 'run', 'start'])
    processes.append(p_web)
    print("  ✓ Next.js Frontend launched (http://localhost:3000)")

    # Wait for API health check
    print("\n[*] Checking API health...")
    healthy = False
    for _ in range(15):
        time.sleep(1)
        try:
            with urllib.request.urlopen('http://localhost:8000/health', timeout=2) as resp:
                data = json.loads(resp.read().decode())
                if data.get('status') == 'ok':
                    healthy = True
                    break
        except Exception:
            pass

    if healthy:
        print("=" * 60)
        print("  HIRENEURON VERITY IS ONLINE AND READY!")
        print("=" * 60)
        print("  Recruiter Portal : http://localhost:3000")
        print("  API Docs         : http://localhost:8000/docs")
        print(f"  Recruiter Token  : {token}")
        print("=" * 60)
        print("Press Ctrl+C to terminate all services.\n")
    else:
        print("[!] Warning: API health check timed out. Check console logs.")

    while True:
        time.sleep(1)
        for p in processes:
            if p.poll() is not None:
                print(f"[!] A core service exited with code {p.poll()}. Shutting down.")
                shutdown()

if __name__ == '__main__':
    main()
