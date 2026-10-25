# Accuracy and reliability protocol

“Highest accuracy” is a goal, not an evidence-backed property of an untested build. Optimize the complete system and report component metrics separately.

## Data and splits

Collect consented real spoken technical answers and labeled room-camera clips. Avoid storing unnecessary identity details. Keep person/session-disjoint development and held-out sets; never tune thresholds on the held-out set. Track device, lighting, network, microphone, speaking conditions and technical domain. Include Indian-English speakers and ordinary pauses without treating accent as a quality feature.

Suggested initial pilot sizes (targets, not existing data): 30+ spoken answers across several speakers; 20+ benign and 20+ simulated concern clips across both cameras; 20+ human-rated answer pairs. These small samples support debugging, not sweeping accuracy claims. Expand and report uncertainty before claiming strong performance.

## Speech

Use human-checked verbatim transcript as reference. WER = (substitutions + deletions + insertions) / reference words. Report technical-term recall separately. Preserve disfluencies consistently in both reference and hypothesis. Measure truncation, hallucinated words in silence, wrong-slot text, duplicate turn rate, and interrupted mid-sentence responses. Keep empty-reference handling explicit.

Latency: timestamp final candidate word, finalized STT, turn decision, TTS request, first audio received, first audible playback. Report median and P95 over actual trials, with count and region. “API response time” is not perceived turn latency. Include retransmissions and failures, not only successes.

## Question relevance

Two reviewers independently rate relevance, level appropriateness, resume grounding, duplicate content and coverage of required skills. Track exact custom-question preservation and default-count correctness as deterministic pass/fail. A provider returning valid JSON does not prove a good interview.

## Evaluation quality

Freeze rubric anchors. Have two reviewers independently score answers, resolve disagreement, and keep original ratings. Report mean absolute error, weighted agreement if sample supports it, large disagreements (>1 point), quote validity rate, abstention rate and gap-claim contradictions. No face/proctoring inputs enter this experiment. Use held-out answers, not the prompt examples used to tune the scorer.

## Integrity

Label event intervals with camera role and event type. Match predictions to references one-to-one using an explicit temporal overlap rule. Compute event precision, recall, false positives per benign hour, median detection delay and coverage fraction. Frame-level accuracy is misleading when “nothing happened” dominates the video.

Separate conditions: single person typing, normal head movement, leaning out briefly, prolonged absence, another person crossing quickly, another person remaining, low light, camera occlusion, phone angle, network freeze. The product reports observations/review concerns, not a ground-truth “cheating” label.

A no-event report with no frame coverage is unverified, not a true negative. Report missed intervals and unavailable modalities. HOG/Haar defaults in this package must be calibrated or replaced.

## Release targets — all unmeasured until a report exists

Choose targets with the team and reviewers before collecting held-out results. Suggested aspirations: zero wrong-slot commits in the release test suite; every displayed citation validated; no unauthorized evidence retrieval in access tests; acceptable P95 perceived voice latency; benign false-alarm rate low enough for recruiter review. Do not invent 95%/99% accuracy from these aspirations.

Use `benchmarks/measure.py` on JSON data you collect. It computes basic WER, score MAE, event precision/recall and latency quantiles. It does not certify fairness, confidence calibration or statistical significance.
