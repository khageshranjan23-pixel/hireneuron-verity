# Verification performed during packaging

Date: 25 October 2026. Environment: Linux, Python 3.12, Node 24; exact installed Python package versions are in tested_python_versions.json. Frontend dependencies are locked in package-lock.json (Next.js 15.5.28 at validation).

## Passed

- **26 backend tests** (`python -m pytest backend/tests -q`). Covers default count, preserved custom text, repeat, skip confirmation, unanswered/partial timeout, hard duration, stale slot rejection, temporal rules, exact citation rejection, HMAC changes, consent requirement, unauthorized access, cross-session isolation, one-use/expired phone pairing, idempotency and payload conflicts, phone camera-only grants, encrypted evidence retrieval/deletion and append-only overrides.
- **Python compile check** for backend, workers, scripts and benchmarks.
- **Next.js production build and TypeScript validation** for recruiter, candidate and phone routes.
- **Headless Chromium text lifecycle**: recruiter login, create 2-question QA session, candidate invitation, consent, start, submit answer, confirm skip, completion, recruiter transcript review.
- **No browser page errors** during that text lifecycle.
- **390px recruiter overview**: no document-level horizontal overflow in the browser check.
- **Visual inspection** of actual 1440px recruiter overview and candidate screenshots; no observed overlapping/clipped content in those views. UI_Preview.png is an actual empty-workspace screenshot, not a fabricated results dashboard.
- Local server startup and rendered page requests exercised by browser test.
- LiveKit Python constructors/grant definitions checked against installed SDK; phone token payload restrictions tested without connecting a real room.

The browser fixture is explicitly labeled software QA. Its answer, session and screenshot data are not accuracy evidence and its runtime database is excluded from this ZIP.

## Not established here

- Actual Gemini/Deepgram requests, subscription billing, quotas, provider outputs or TTS latency.
- Live laptop/phone WebRTC, permission behavior on physical phones, TURN/network transitions or simultaneous worker load.
- Real microphone transcription, semantic end-of-turn, automatic follow-ups for streaming voice, barge-in or speaker behavior.
- Detection accuracy, false alarms, fairness, calibrated confidence, held-out evaluation or concurrency capacity.
- Composed recording/replay lifecycle; the Egress script is a gated starting point.
- Docker deployment or production security/tenant isolation.
- Full accessibility audit or all responsive report states.

Provider/device-dependent work remains in IMPLEMENTATION_PLAN.md and ACCEPTANCE_MATRIX.md. Do not translate a passing compile/build/test into a claim of highest accuracy or complete production readiness.

## Reproduce

Run README setup and tests. For browser smoke testing, start API/UI, install Playwright in your QA environment, install its browser, provide TEST_RECRUITER_TOKEN locally and run scripts/browser_smoke.cjs. Keep tokens out of logs. The packaging environment needed an alternate Chromium binary because its normal browser download failed; this is an environment detail, not a product dependency.
