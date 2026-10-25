# HireNeuron Verity — Antigravity build package

**Start with `ANTIGRAVITY_INITIAL_PROMPT.md`.** This is a working local foundation plus provider integration code and a prioritized completion specification, not a claim that the entire PDF has already been implemented or that live accuracy has been measured.

## What you receive

- Next.js/TypeScript recruiter workspace, configuration, candidate interview, smartphone pairing, evidence review, reviewer overrides, JSON export and printable reports.
- FastAPI API with transactional state, frozen primary question count, explicit turns, deadlines, idempotency, consent, scoped credentials, one-use phone challenges, encrypted evidence, signed event chains, durable evaluation queue.
- Separate LiveKit voice and dual-camera integrity workers; Gemini structured-output question generation, follow-ups and evidence-cited answer evaluation; Deepgram streaming STT and PCM TTS adapter.
- Automated backend tests, frontend production build setup, benchmarking scripts, deployment instructions, acceptance matrix, implementation backlog and original PDFs.

## What works without paid API keys

Create sessions; upload text-based PDF/DOCX; review extracted text; use clearly labeled template questions; run a full text interview; repeat/skip/timeout/reconnect state; view transcripts; append reviewer assessments; export JSON/print report. AI scoring is explicitly unavailable without a configured provider. Camera feeds require LiveKit credentials. There are no fake score cards, fake candidate rows, or fabricated accuracy numbers.

## Quick start — Windows / macOS / Linux

Requirements: Python 3.12, Node.js 22+ LTS, npm, internet for dependencies. Keep all commands at repository root unless shown otherwise.

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS / Linux instead:
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python scripts/setup.py
python scripts/doctor.py
python scripts/run.py api
```

Second terminal, from repository root:

```bash
cd web
npm ci
npm run dev
```

Open http://localhost:3000. The recruiter token is in the generated `.env`; paste its value into the login screen. This is a one-recruiter local prototype, not production SSO. Do not paste keys into Antigravity chat. Swagger is at http://localhost:8000/docs (authenticated operations require a bearer token).

Third terminal, same activated virtual environment:

```bash
python scripts/run.py evaluate
```

Create an interview, save the private candidate URL, optionally generate AI questions, then open the candidate URL in another browser profile. Consent and start. The invitation uses a URL fragment so the bearer token is not sent in HTTP URL logs; the frontend removes it from the visible URL and retains it in session storage.

## Enable real media and AI

Fill only server-side `.env` with LiveKit URL/API key/secret, Gemini key/model and Deepgram key/TTS model. Select real model IDs available to your account. Restart services after changes. The supplied PDF names are architecture choices, not a substitute for checking provider availability.

For each session ID (visible in candidate URL before its fragment is removed and in report JSON), run two terminals:

```bash
python scripts/run.py voice SESSION_ID
python scripts/run.py integrity SESSION_ID
```

Both workers connect to the same `verity-SESSION_ID` room. Voice listens only to the server-issued candidate identity. Integrity reads candidate and phone camera tracks separately. Candidate UI can also subscribe to phone video; the recruiter can open Live feeds. Phone never publishes audio and cannot subscribe.

**Phone camera requires reachable HTTPS**, not a laptop localhost URL. Read `docs/DEPLOYMENT.md`. The QR link expires after three minutes. A second scan cannot reuse it.

## Validate before presenting

```bash
python scripts/run.py test
cd web
npm ci
npm run build
```

Read `docs/VERIFICATION.md` for what was actually checked in the packaging environment. Read `docs/STATUS_AND_GAPS.md` before describing features to judges. No real interview dataset is bundled; source PDFs are under `reference/`. Test fixtures are software tests, not measured interview results.

## Important boundaries

- This release uses SQLite WAL and local Fernet-encrypted evidence for a reproducible single-host baseline. PostgreSQL, Redis, private object storage and distributed workers are specified migration tasks, not silently implied to exist.
- Explicit Done is the default. Automatic VAD endpointing is experimental; semantic turn detection, robust barge-in and autonomous silence recovery are completion gates.
- HOG/Haar CV is a runnable baseline, not a high-accuracy model. Do not advertise gaze tracking, speaker identity, hidden-device detection or cheating detection.
- Optional Egress code is consent-gated and is not a finished recording/replay implementation.
- Worker integrations require live provider and device verification. `npm run build` and unit tests do not validate end-to-end media quality.
