# Troubleshooting

- **401 on workspace:** use RECRUITER_TOKEN from local .env, without quotes/spaces. Never use WORKER_TOKEN in a browser. Restart API after changing env.
- **API won't start:** setup.py must generate four keys. Run scripts/doctor.py. Preserve EVIDENCE_KEY when existing snapshots matter.
- **No AI questions:** local template blueprint is available. Set GEMINI_API_KEY and a real GEMINI_MODEL, then restart. A provider error retains the existing blueprint.
- **Scores unavailable:** start evaluation worker from the same repository/data path. Configure provider. Queue only after completion; inspect provider status without printing secrets.
- **Camera denied:** use HTTPS or localhost and browser permissions. On a phone, laptop localhost isn't reachable. Verify web API base URL and CORS.
- **Phone QR used/expired:** generate a fresh QR; separate phone consent is mandatory. The challenge is not a reusable room token.
- **Only one video visible:** verify both identities and video publications. Start integrity worker before or after joins; it handles existing tracks. Watch independent frames/heartbeat rather than local preview alone.
- **No voice:** run the per-session voice worker, configure Deepgram model/key and LiveKit keys, verify browser audio permissions and audio autoplay gesture. Use Done plus text fallback while resolving it.
- **Voice advances too early:** AUTO_ENDPOINT should remain false until semantic/endpoint tuning is tested. VAD silence is not proof a complete answer was spoken.
- **No incident from second person:** Haar/HOG baseline may miss seated/occluded people. Inspect actual frames and detector logs, then calibrate or replace detector. Never inject a success event to hide a miss.
- **No snapshots during worker outage:** report UNVERIFIED. The code cannot produce evidence for frames it never received.
- **Recording script refuses:** full recording consent and storage integration are not finished in baseline; follow RECORDING.md. Do not bypass consent guard merely for a demonstration.
- **Build dependencies differ:** use package-lock.json with npm ci. Compare tested_python_versions.json, pin Python dependencies after integration validation.
- **Schema changed after initial run:** prototype DB is not a migration system. Back up real data; write migrations rather than deleting data silently. For disposable local test sessions only, a new DATABASE_PATH starts fresh.
