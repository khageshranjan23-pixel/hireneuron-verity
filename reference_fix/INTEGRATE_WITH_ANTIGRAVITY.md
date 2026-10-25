# Integration notes — facePresenceGate.ts

This is a **tested reference state-machine implementation**, not a completed end-to-end patch. It should be integrated by Antigravity into the *existing* HireNeuron Verity application and adapted for its actual model APIs. It has no camera access of its own.

## Integration requirements

1. Add `facePresenceGate.ts` under `web/lib/` and create one `FacePresenceGate` per actual camera/stream lifecycle (`useRef`); reset it only when a stream changes. Drive it using `performance.now()` and **fresh decoded frames**.
2. In `AIProctorEngine.tsx`, replace `counts.faceAbsent >= 3` with `gate.update(...)`; do not report out-of-view without both robust negative face detections and independent negative person evidence over time. Use the state `TRACKING_UNCERTAIN` for low confidence or errors. Do not send server claims from client-only inference.
3. In `MediaRoom.tsx`, remove `setFaceStatus(metrics.faces === 0 ? 'absent'...)` and map **the gated state**, not raw `faces` count. Avoid overwriting server state with client raw counts. Distinguish server evidence from local monitoring.
4. Use a separate face detector fallback, including profile/head-turned face, only when the landmark model misses. Use a verified lightweight person detector (or `personVisible: null` if unavailable). If fallback is not running, `fallbackFace:null` must **not** be silently converted to `false`.
5. In `workers/integrity.py`, detector exception must report `method:'error', observation_valid:false` and NOT `face_count:0` as an observation. Temporal rules must ignore invalid/unknown observations, record a coverage gap, and require observed duration, never consecutive-frame count alone.
6. Separate candidate-side *calm UX* from recruiter-side *reviewable evidence*. Don't present "cheating" accusations for head turns or missed tracking.
7. Use different timing policies: optional instantaneous neutral movement indicator, sustained face visibility condition, and confirmed out-of-view only when corroborated.
8. Test different lighting, eyeglasses, darker skin tones, varied camera positions, profile turn, actual leave-frame behavior and actual camera disconnect. Measure false alerts per minute and latency. **Do not invent accuracy numbers**.
9. Avoid unsupported claims that a webcam can know the exact object being looked at, or distinguish dishonesty from thought/attention.

## Run the included *unit tests* (Node.js 22+)

```bash
node --experimental-strip-types --test facePresenceGate.test.mjs
```

All these tests use **synthetic observation metadata**, not real video. They validate only state transitions, not model accuracy.

## Security

Do not copy `.env`, TLS private keys, live interview tokens or candidate recordings into source archives. Previously exposed credentials must be rotated separately in their provider consoles.
