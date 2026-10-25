# Detailed implementation sequence

Effort depends on team experience, keys, network and devices. Treat the following as dependency order, not a promised number of hours. A successful unit test is evidence about that behavior, not about deployed accuracy.

## Phase 0 — establish a reproducible baseline

Owner: full-stack implementer. Inputs: repository and original PDFs.

- Read status inventory, run setup, preserve generated encryption keys outside git. Check Python 3.12 and Node LTS.
- Run backend tests from repository root; run `npm ci`, type checks and production build under web/.
- Start API and UI. Create a real test role with a consented resume. Save invitation once. Use a separate browser profile for the candidate.
- Exercise default 10 and custom 3 questions; complete text answers; skip with confirmation; reload mid-question; finish; inspect report; override with reason; export JSON.
- Confirm no unauthorized request can list sessions, read another candidate's state, submit evidence, or view snapshots.
- Deliverable: baseline commit, working commands, test log, screenshots at 1440 and 390 pixels.

Exit gate: reproducible text interview without manual DB edits or invented results.

## Phase 1 — configuration and intelligence contracts

Files: backend/app/main.py, providers.py, core.py, web/app/page.tsx.

1. Add `CandidateProfile` schema: skills with source text spans, roles with dates and organization as provided, project descriptions, education, certifications; represent missing values as null. Keep original extracted text and corrected profile versions.
2. Add `JobProfile`: required/preferred skills, responsibilities, level and competencies. Skill matching is semantic evidence, not an ability score. Show `claimed`, `not found in resume`, `requires assessment`; never “candidate lacks skill” solely from resume omission.
3. Add profile review/confirmation before question generation. Do not let resume/JD text alter system prompts, rubric, authorization or tool calls. Provider request includes only necessary content.
4. Add recruiter rubric configuration with validated names, weights summing to 1, score anchors and job relevance. Freeze rubric version/hash with blueprint. No changes after start without a separately auditable new version.
5. Generate exactly remaining unlocked slots, validate returned count, category, bounded length, skill alignment and duplicates. Exact custom text survives unchanged. Rephrasing a question is not a new primary slot.
6. Support at most one follow-up per primary with a unique child ID and own answer spans. Check remaining total time and slot time AFTER provider call. Apply via compare-and-swap to prevent stale provider output from changing the current slot.
7. Store generation model/version and input hash. Validate near-duplicates with normalized text first; semantic comparison optional and must not introduce flaky rejection loops.

Exit gate: adversarial resume cannot modify rubric/instructions; 10 defaults and N custom contracts pass; recruiter can inspect and approve blueprint.

## Phase 2 — authoritative timing and voice

Files: core.py, workers/voice.py, action API, candidate UI.

- Introduce explicit ASKING/LISTENING/TURN_DECISION transitions and one controller per session. Current baseline uses LISTENING plus phase. Maintain slot ID, turn ID, question child ID and server deadline.
- Use semantic turn detection with VAD and a tuned endpoint window. Do not promote each finalized STT fragment into a finished answer. Buffer final segments and keep interim captions ephemeral.
- Assign incoming audio timeline ranges to slot/turn IDs. A late transcript crossing a boundary must not attach to the next question; retain as unassigned evidence for review or request repeat.
- Explicit Done commits once. Store request ID and payload digest; an identical retry returns prior result; a reused ID with changed payload is a conflict. Handle concurrent worker and browser Done by CAS.
- For timeout, preserve partial spans, label TIMED_OUT. Silence without content is UNANSWERED. Use two measured reminders before deadline where time permits. Missing transcription is insufficient evidence.
- Barge-in: stop source playback, cancel pending TTS generation, distinguish deliberate speech from noise, and preserve same question. Account for echo tail when interpreting audio. Phone never contributes mic input.
- Normalize command phrases on final text. Ambiguous “skip” must ask confirmation. Buttons are always available. Rephrase uses original intent, no new slot, no silent change to scoring rubric.
- Use streamed TTS PCM chunks and pre-cache frozen questions. Record final-candidate-word to first-agent-audio timing; compare providers in actual region. Retry boundedly; expose text fallback when speech unavailable.
- Server scheduler enforces total deadline even when all browsers disconnect. Define whether technical pauses consume budget; default total wall-clock budget is bounded and transparent.

Exit gate: five real spoken turns, a deliberate mid-sentence pause, repeated question, confirmed skip, partial timeout, reload and provider failure all preserve correct transcript-slot attribution.

## Phase 3 — phone and media lifecycle

Files: media.py, phone UI, MediaRoom, pairing API, new supervisor.

- Keep QR as an opaque nonce with 180-second TTL. Store digest, session, issuance time, policy version and one-use status. Add rate limits and fail closed if shared challenge store unavailable.
- Redemption requires separate phone consent; issue camera-only publish and no subscribe permission. Server controls identity and room. Prevent arbitrary metadata from becoming a trusted camera role.
- Renew authorized participant credentials without reusing QR. Rotate phone credentials on re-pair, explicitly remove the previous participant from room and revoke its API credential.
- Active-session end and consent withdrawal remove media participants server-side. Token expiry alone does not necessarily disconnect an already joined participant.
- Launch workers under a supervisor with per-session leases. Restart voice without replaying committed turns; restart integrity with explicit coverage gap.
- Show both live videos without replacing primary when phone joins. Monitor frame counts per role, not merely a green connection badge.
- Test desktop/phone on separate networks, denied permissions, backgrounded phone, rotation, switch Wi-Fi to cellular, and QR expiry. Configure TURN through LiveKit as required.

Exit gate: primary remains visible; secondary frame count increases independently; phone has no mic/subscription grant; no consent means no stream; disconnect appears truthfully.

## Phase 4 — calibrated integrity and trustworthy evidence

Files: workers/integrity.py, evidence.py, event APIs, recruiter evidence UI.

- Replace HOG/Haar when real data demonstrates inadequate recall. Select a licensed person/face detector; record model version, license, weights digest, preprocessing, input size and confidence threshold. Do not download unspecified model weights at runtime.
- Evaluate primary and secondary separately. Full-body HOG is especially weak for seated/occluded people. Face count alone cannot detect everyone in a workspace view.
- Maintain temporal windows with hysteresis, minimum dwell, event closure and cooldown. Store actual model score as a detector score, never a calibrated confidence probability unless calibrated.
- Coarse head pose is optional and must be described as a direction indicator, not proof of looking at forbidden material. Avoid eye-gaze claims.
- Track frame-receipt times, inference completion times, observed FPS and frame age. On overload, lower sampling and expose UNVERIFIED intervals; do not keep a stale green monitor.
- Ring-buffer multiple real server frames around event onset. Encrypt originals; record timestamps on a separate manifest, not only rendered captions. Use a contact sheet as UI convenience, retaining originals when feasible.
- Atomic evidence flow: encrypt/upload -> read/verify checksum -> transactionally commit event and signed chain. Clean orphan files after failed commit. Use server-only HMAC key; export a verification tool. Account for key rotation.
- Audio anomaly work is P1. VAD only establishes speech activity, not speaker identity. Never produce extra-person labels from a speaking pause or noise alone.

Exit gate: labeled benign clips plus consented simulated events; per-event precision/recall and false alarms/hour; both camera sources tested; evidence can be retrieved only by authorized reviewer.

## Phase 5 — recording and evaluation

Recording first: collect explicit recording consent; enable composed Egress; poll finalized status; verify playable MP4; persist private object reference and checksum; associate recording clock with event offsets; enforce authorized seek/replay. See RECORDING.md.

Evaluation:
- Queue durable jobs only after final transcript is frozen. Use input version + model + rubric as idempotency key. Store raw output securely for audit and parsed output separately.
- Provide only question, rubric and answer spans. Never include proctoring, camera, demographic, accent or appearance metadata.
- Validate exact span IDs and quote substrings. Add per-dimension evidence/rationale and a rubric validator. If references fail, retry once with a validation error, then abstain and flag review; never silently accept a malformed score.
- Use `scored`, `insufficient_evidence`, `provider_unavailable`, `needs_review` as distinct states. Missing answer isn't zero. Incomplete transcription isn't incompetence.
- Check inferred gap claims against transcript to avoid “didn't mention X” when X is present. Keep these as model-inferred missing evidence.
- Calibrate against two human reviewers on held-out answers. Report disagreement and abstention, not just average score correlation.
- Original machine outputs are immutable. Reviewer changes include authenticated identity, dimension, old value, new value, reason, time, version. The UI must distinguish model result from latest human review.

Exit gate: every scored answer cites real text; fabricated quotation rejected; override audit preserved; actual recording plays or clearly shows unavailable.

## Phase 6 — presentation quality and release

- Keep visual style and actual APIs; add skeletons, empty states, provider error explanations, reconnect banners and next actions.
- Add keyboard focus order, semantic controls, contrast checks, ARIA alerts; test 390/768/1440 widths and long names/text.
- Candidate should always know current question, remaining time, recording state, capture state, error state and what to do next.
- Report: job/candidate context, frozen rubric, per-question status, answer, citations, score, model version, strengths, inferred gaps, evidence timeline, coverage gaps, reviewer decisions. No opaque aggregate cheating percentage.
- Add downloaded PDF through a server renderer or browser print with consistent breaks. Do not let report export fetch unauthorized object URLs.
- Run acceptance matrix. Save actual metrics with software/model versions and sample counts. Prepare a real previously recorded session as a labeled backup, not a simulation disguised as a live demo.

Exit gate: demo can be repeated from a clean install; no placeholder success labels; all remaining limitations disclosed.
