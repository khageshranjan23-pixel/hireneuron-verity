# Implementation inventory — read before any claim

| Capability | Package status | Remaining gate |
|---|---|---|
| Recruiter/candidate/phone UI | Source implemented; frontend build checked | Real-device usability, full accessibility audit |
| Resume PDF/DOCX text extraction | Implemented with size/page/expanded-size limits | OCR, isolated parser process, structured profile |
| JD/resume grounded AI questions | Gemini adapter with schema/count/duplicate checks | Real API output quality, structured skills matrix |
| Default/custom primary count | Implemented and tested | More difficulty/category validation |
| Locked recruiter questions | Implemented and tested | UI editing before freeze |
| Single-node authoritative state | SQLite WAL transactions | Multi-tenant Postgres migration if deploying beyond demo |
| Timers/skip/repeat/partial timeout | Implemented and tested | Independent scheduler, pause-policy refinement |
| Text interview lifecycle | Implemented | Full browser end-to-end validation |
| LiveKit frontends and role grants | Implemented integration code | Real laptop/phone test; active revocation/renewal |
| One-use opaque QR | Implemented, transactional reuse test | Distributed rate limiting and device rotation policy |
| Finalized streaming transcription | Deepgram worker source implemented | Live speech verification; captions are final-only |
| Automatic voice turns | Experimental VAD opt-in | Semantic detector, pause corpus, interruption handling |
| Explicit Done and spoken commands | Implemented | Voice path testing |
| Contextual follow-up | Implemented for text without existing spans | Unified voice follow-up flow, provider retry idempotency |
| Voice TTS | Deepgram buffered PCM response | Streaming first audio, caching, TTS fallback, barge-in |
| Trusted two-track sampling | LiveKit worker source implemented | Real feeds and throughput test |
| Face/person detection | OpenCV Haar/HOG baseline | Modern licensed detector, quantitative calibration |
| Head pose/gaze | Not implemented | Optional calibrated coarse head-pose only |
| Additional voices | Not implemented | Do not confuse VAD with speaker identity |
| Multi-frame snapshots | Encrypted contact sheets, HMAC chain | Object-store migration, atomic orphan cleanup |
| Coverage | Worker heartbeats and stale-frame events | Never-received track interval events, mic status, watchdog |
| Scoring | Gemini schema + exact quote/span checks | Real human-rated validation; evidence per dimension |
| Review overrides | Append-only records; original preserved | Named accounts, rubric dimension overrides |
| Report export | JSON + print stylesheet | Designed downloadable PDF, signed report archive |
| Recordings | Consent-gated Egress starter only | Full consent UX, storage, lifecycle, replay; required P0 completion |
| Deployment | Local scripts + API/evaluation Docker Compose | HTTPS hosting and real media acceptance |
| Privacy controls | Consent + local encrypted snapshots + deletion | Full retention jobs, provider data policies, jurisdiction review |

This package is intentionally a substantial build foundation, not a counterfeit claim of a fully finished production system. Prioritize remaining required P0 work over advanced optional features. The provided solution PDF itself calls its architecture proposed and requires experimental validation.

## Architectural differences from the PDF

1. SQLite replaces Postgres/Redis for the runnable single-host baseline. Atomic challenge redemption uses a transaction. It is not a Redis implementation.
2. Next.js uses explicit CSS design tokens instead of Tailwind. This is a styling implementation choice, not a missing product feature.
3. Voice uses low-level LiveKit RTC and Deepgram APIs. A LiveKit Agents semantic-turn implementation is the intended next upgrade, not silently enabled.
4. AI model identifiers are environment choices. No unchecked hardcoded future model ID is required to boot the system.
5. Full video recording is separately consent-gated; snapshots alone do not fulfill all recording-review requirements.
6. All recruitment/auth is one local workspace. There is no implemented multi-tenant security claim.
