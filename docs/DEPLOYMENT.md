# Deployment and operational handoff

## Local single-host topology

Next.js :3000 -> FastAPI :8000 -> SQLite WAL/local encrypted evidence.
Evaluation is a separate process. Voice/integrity are separate per-session processes joining LiveKit Cloud. LiveKit handles real-time WebRTC transport; Gemini and Deepgram are external providers. This topology intentionally avoids unused Postgres/Redis containers.

Run from root with an activated venv. `.env` is loaded by scripts/run.py. Direct `python -m workers...` needs exported env or an equivalent launcher. API and evaluation must resolve DATABASE_PATH/EVIDENCE_PATH to the same files. Docker Compose shares `/app/data` for those two services; do not mix local and Docker storage accidentally.

## Phone HTTPS deployment

1. Host web and API at reachable HTTPS origins, e.g. web at your chosen host and API at another HTTPS endpoint. Do not put localhost in a QR meant for another device.
2. Set web's `NEXT_PUBLIC_API_URL` before its production build to the public API HTTPS origin. Set API `WEB_ORIGINS` to the exact public web origin. Restart/rebuild.
3. Set `LIVEKIT_URL` to the project WSS endpoint and server credentials only on backend/workers.
4. Place always-on voice/integrity workers on a persistent process host. Do not assume a short-lived request server will keep WebRTC subscribers alive.
5. Use a private persistent disk for the baseline DB/evidence. One API host only; horizontal API replicas on independent SQLite files are invalid.
6. Visit web on laptop and phone. Confirm secure context, camera permissions, autoplay/audio gesture handling and two independent feeds.
7. Set provider billing/usage limits. The launcher doesn't create accounts, purchase services or deploy to a paid host automatically.

## Production-shaped migration plan

PostgreSQL tables: organizations, users, memberships, jobs, candidate_profiles, sessions, frozen_blueprints, primary_slots, followup_slots, transcript_spans, consents, media_credentials, evidence_events, evidence_objects, evaluations, reviewer_overrides, durable_jobs.

- Session row has revision and server deadlines. Use transaction/row lock or revision compare-and-swap for transitions.
- Transcript unique key `(session_id, source_stream_id, provider_segment_id)`; turn request unique `(session_id, request_id)` plus payload digest.
- Evidence per-session sequence unique with serialized prior hash. Upload objects before transaction; garbage-collect unreferenced uploads.
- Redis challenge hash binds tenant/session/role/expiry; consume with Lua/GETDEL and validation atomically. Use Redis for short-lived lease/rate limit, not sole source of transcript truth.
- Private object storage: encrypted buckets, scoped backend access, short-lived authorized retrieval after tenant checks, lifecycle retention, checksum verification.
- Migration tool: Alembic or SQL migrations with rollback plan. Back up local data; verify counts/checksums before switching.
- Worker supervisor claims per-session voice and integrity leases, heartbeats, backoff, graceful termination, and explicit coverage gap on restart.
- Evaluation queue claims with leases; idempotent key includes transcript version, rubric hash and model version. Failed work retries boundedly and remains visible.

## Observability

Log session ID and request ID, not answer content or secrets. Capture received FPS by role, inference duration, queue delay, CPU/RAM, STT reconnects, dropped late segments, perceived turn latency, provider rate-limit counts, evaluation retries, pairing failures, evidence write failures. Show stale coverage as UNVERIFIED. Test actual simultaneous sessions; do not estimate unsupported “200 users per server.”

## Recovery

API crash: SQLite transaction rolls back; retry idempotent action. Evaluation crash: stale running job requeued after lease interval. Voice crash: current slot remains authoritative; restart and disclose transcription gap. Integrity crash: recruiter heartbeat goes stale; supervisor must emit gap. Lost encryption key: unrecoverable snapshots, not a reason to fabricate replacements. Full disk: fail evidence write and mark coverage failure rather than create a sealed missing file.
