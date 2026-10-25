# Implementation Inventory & Verification Status

| Capability | Status | Implemented Mechanism & Gate |
|---|---|---|
| Recruiter Workspace & Configuration | **Completed & Verified** | Next.js recruiter dashboard, JD & resume upload, structured profile extraction, Match/Claim/Gap skill matrix, inline question customization |
| Resume PDF/DOCX Text & Profile Extraction | **Completed & Verified** | PDF/DOCX text extraction with bounds checking, structured CandidateProfile (skills, experience, education, projects, certifications) |
| JD/Resume Grounded AI Questions | **Completed & Verified** | Gemini structured output generation with multi-model fallback (`gemini-3.8-flash` -> `gemini-3.6-flash` -> `gemini-3.5-flash-lite`), category & count enforcement |
| Recruiter Locked Questions & Blueprint Freeze | **Completed & Verified** | Preserves recruiter questions verbatim; allows pre-freeze customization via `PATCH /sessions/{sid}/questions/{qid}` |
| Deterministic State Machine & Timers | **Completed & Verified** | Authoritative transitions, per-question timers, hard duration limit, answer timeout preservation |
| Autonomous Voice Interviewer | **Completed & Verified** | Deepgram Nova-3 real-time STT WebSocket + Deepgram Aura Linear16 PCM speech synthesis with audio pre-caching, barge-in, explicit "Done answering" button & spoken commands |
| Contextual Follow-up Probing | **Completed & Verified** | Bounded to maximum 1 follow-up per primary question within time budget, asking grounded probes on candidate claims |
| Two-Camera System (Laptop + Phone) | **Completed & Verified** | Simultaneous LiveKit WebRTC streaming: laptop webcam/mic + smartphone rear camera (video-only grant, no audio), one-use 180s QR pairing token |
| Server-Side Dual-Camera Proctoring | **Completed & Verified** | Independent sampling at ~1 FPS per feed, OpenCV frontal face, profile face (head turn), and upper body / HOG person detection |
| Tamper-Evident Evidence Snapshots | **Completed & Verified** | UTC timestamped multi-frame contact sheets, SHA-256 digests, Fernet encryption at rest, HMAC signature chain verification via `scripts/verify_evidence.py` |
| Real Session Video Recording & Replay | **Completed & Verified** | Consented media recording, SHA-256 checksum verification, authorized streaming with Range seek support, incident timestamp seek shortcuts |
| Transcript-Grounded Rubric Evaluation | **Completed & Verified** | Gemini evaluation against frozen rubric (1–5 scale), exact span quote validation, demonstrated concepts, strengths, and model-inferred gaps |
| Recruiter Overrides & Audit Trail | **Completed & Verified** | Append-only human overrides with mandatory justification, preserving original model scores |
| Windows Startup System & Supervisor | **Completed & Verified** | `start_verity.ps1` and `start_verity.py` automated launch with port and dependency checks; `workers/supervisor.py` manages active session worker lifecycles |

---

## Architectural Notes
1. **Single-Host Prototype Persistence**: Uses SQLite WAL with `BEGIN IMMEDIATE` transactions to guarantee ACID concurrency across workers on Windows without requiring multi-service PostgreSQL setup for local hackathon demo.
2. **Provider Resilience**: Automatic multi-model fallback for Gemini handles quota exhaustion and rate limits seamlessly.
3. **Evidence vs Accusations**: Computer vision signals (`FACE_ABSENT`, `HEAD_TURN_PROLONGED`, `MULTIPLE_PERSONS`, `FRAME_COVERAGE_GAP`) produce `OBSERVED_EVENT`, `NEEDS_REVIEW`, and `UNVERIFIED` tags. Automatic disqualification is strictly prevented; human recruiters make all decisions.
