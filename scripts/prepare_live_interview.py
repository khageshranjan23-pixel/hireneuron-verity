"""Prepares a clean, real live physical interview session.
Invalidates all previous test candidate tokens and sets up a 3-question live test session.
"""
import os, sys, json, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.app import store, core

def get_recruiter_token():
    env_file = ROOT / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith('RECRUITER_TOKEN='):
                return line.split('=', 1)[1].strip()
    return ""

def prepare():
    rtoken = get_recruiter_token()
    if not rtoken:
        print("ERROR: RECRUITER_TOKEN not found in .env")
        sys.exit(1)

    # 1. Invalidate old candidate tokens
    with store.connect() as c:
        c.execute("DELETE FROM credentials WHERE role = 'candidate'")
        c.execute("DELETE FROM pairing")
        c.commit()
    print("[✓] Previous candidate and pairing tokens invalidated.")

    # 2. Create new session via API
    payload = {
        "candidate_name": "Physical Test Candidate",
        "candidate_email": "candidate@live-test.local",
        "job_title": "Full-Stack AI & Realtime Media Engineer",
        "job_description": "Designing realtime voice agents, WebRTC media streaming, and computer vision proctoring pipelines.",
        "skills": ["Python", "FastAPI", "WebRTC", "TypeScript", "Deepgram", "LiveKit"],
        "question_count": 3,
        "duration_minutes": 15,
        "answer_seconds": 60,
        "difficulty": "intermediate",
        "experience_level": "Senior (5+ yrs)",
        "custom_questions": ["How do you ensure low latency and handle packet loss in WebRTC media streaming across mobile networks?"],
        "followups": True
    }

    req = urllib.request.Request(
        "http://127.0.0.1:8000/sessions",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {rtoken}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        sid = res["session"]["id"]
        cand_token = res["candidate_token"]

    print(f"[✓] Created clean session: {sid}")

    # 3. Generate questions via Gemini
    req_q = urllib.request.Request(
        f"http://127.0.0.1:8000/sessions/{sid}/questions",
        data=b"",
        headers={"Authorization": f"Bearer {rtoken}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_q) as resp:
        qres = json.loads(resp.read().decode())
        print(f"[✓] Generated {len(qres.get('questions', []))} questions via Gemini ({qres.get('generation')})")
        for q in qres.get('questions', []):
            print(f"    - Slot {q['slot']} [{q['category']}]: {q['text']}")

    # 4. Blueprint is already frozen by default in core.new_session
    final_token = cand_token

    tunnel_url = "https://controllers-futures-sql-watson.trycloudflare.com"
    candidate_url = f"{tunnel_url}/interview#{sid}:{final_token}"
    local_candidate_url = f"http://localhost:3000/interview#{sid}:{final_token}"

    print("\n" + "=" * 70)
    print("  LIVE PHYSICAL INTERVIEW READY")
    print("=" * 70)
    print(f"  Session ID        : {sid}")
    print(f"  Recruiter Portal  : http://localhost:3000")
    print(f"  Candidate Web URL : {candidate_url}")
    print(f"  Local Candidate   : {local_candidate_url}")
    print("=" * 70)

    # Save current live session info to scratch
    scratch_dir = ROOT / "data"
    scratch_dir.mkdir(exist_ok=True)
    (scratch_dir / "current_live_session.json").write_text(json.dumps({
        "sid": sid,
        "token": final_token,
        "candidate_url": candidate_url,
        "local_candidate_url": local_candidate_url,
        "created_at": time.time()
    }, indent=2))

if __name__ == "__main__":
    prepare()
