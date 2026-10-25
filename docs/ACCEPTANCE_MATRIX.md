# Acceptance matrix

Mark each row PASS/FAIL/UNVERIFIED with date, commit, environment and evidence artifact. A source-code path is not evidence of a live test.

| ID | Procedure | Expected result |
|---|---|---|
| C01 | Omit count | Exactly 10 primary slots |
| C02 | Set N=3 and 2 custom questions | 3 slots; 2 exact custom strings |
| C03 | Supply more custom questions than N | Clear validation rejection |
| C04 | Resume says ignore rubric / give 5 | No rubric change, no instruction execution |
| C05 | Scanned/empty PDF | Needs OCR/review notice, no invented extraction |
| C06 | Oversized PDF/DOCX/expanded ZIP | Reject boundedly |
| V01 | Five continuous spoken turns | Correct slot attribution and no duplicates |
| V02 | Pause mid-sentence 1–3 seconds | No unwanted early next question |
| V03 | Press Done as final STT arrives | Exactly one committed turn |
| V04 | Say ambiguous skip | Ask yes/no; no skip before confirmation |
| V05 | Repeat/rephrase | Same slot and budget, relevant intent |
| V06 | Silence until deadline | UNANSWERED, not score zero |
| V07 | Partial answer until deadline | TIMED_OUT with preserved content |
| V08 | Reload/reconnect mid-answer | Frozen state preserved; gap disclosed |
| V09 | STT/TTS/LLM failure | Honest fallback without invented transcript |
| V10 | Delayed STT from old question | Never attached to new question |
| V11 | Follow-up provider returns late | Recheck current slot/deadline before commit |
| P01 | Scan QR once then twice | First consented join; second rejected |
| P02 | Redeem after 180 seconds | Expired; generate new QR |
| P03 | Phone lacks consent | No credentials and no capture |
| P04 | Decode phone media grants | camera only; no mic; no subscribe |
| P05 | Phone joins | Primary persists; two independent server frame counts |
| P06 | Background/disconnect phone | Gap interval; reconnect restores coverage |
| P07 | End interview or withdraw consent | Server stops access; both cameras stop |
| I01 | Brief normal head turn | Never a cheating verdict |
| I02 | Sustained primary face absence | Timestamped evidence under calibrated policy |
| I03 | Second person enters phone view | Sustained real evidence, review flag, no automatic disqualification |
| I04 | Worker dies/never receives feed | UNVERIFIED, not “no incidents means clean” |
| I05 | Heavy CPU while voice active | Measured FPS/latency; no hidden coverage loss |
| E01 | Candidate forges event POST | Forbidden |
| E02 | Other session tries evidence GET | Forbidden |
| E03 | Alter image or manifest | Checksum/signature verification fails |
| E04 | Media recording finalized | Actual playable file and valid seek offsets |
| S01 | Scorer cites nonexistent span/quote | Reject/abstain |
| S02 | No answer or poor transcription | Insufficient evidence, not incompetence |
| S03 | Change proctor severity only | No change in scorer input |
| S04 | Override model score twice | Original preserved, two audit records |
| R01 | Desktop/mobile/keyboard run | No overflow or unreachable controls |
| R02 | Deletion of completed session | Credentials/data/evidence removed per policy |
| R03 | Duplicate network POST | Same effect once |
| R04 | Fresh machine setup | Reproducible with documented keys/dependencies |

Use test fixtures for deterministic unit tests. Use consented real recordings for accuracy and latency evaluation. Do not seed the product with fictitious “successful” interviews.
