# Recording completion specification

The baseline captures authorized event snapshots but does NOT implement full recording playback. The original problem expects access to authorized recordings or flagged segments. Complete this before claiming full problem coverage.

1. Add separate full-recording consent for laptop and phone, clearly specifying audio/video scope, purpose, access and retention. Current consent covers answer capture, analysis and event snapshots; do not silently broaden it.
2. Store `candidate_recording` and, if phone included, `phone_recording` policy records. The supplied Egress starter refuses to start without candidate_recording consent.
3. Configure a private supported Egress destination. A returned filepath may be remote object storage or the Egress container; it is not automatically a file on the API host.
4. Start composed room recording only after applicable consents. Use a layout that includes both cameras and interviewer/candidate audio. Avoid a second independent audio capture that creates echo.
5. Save egress ID/state. Implement stop, webhook signature verification or authenticated polling, and failure handling. Do not expose arbitrary output paths from untrusted candidate input.
6. Wait until finalized. Download/check checksum or validate trusted object metadata and file contents. Probe codec and duration with ffprobe. Play the file in the target browsers.
7. Persist recording start clock and map event offsets to playback time; measure mapping accuracy. Store Phase-B manifest containing session, object, checksum, start/end, event associations and signature. Keep Phase-A snapshots valid if recording fails.
8. Add recruiter-authenticated recording streaming with Range support or short-lived signed URLs only after authorization. Never expose bucket public URLs.
9. Show RECORDING_INCOMPLETE on partial failures; hide unsupported seek controls. An empty player is not recording functionality.
10. Test deletion/retention for recordings and derived clips alongside snapshots. Revoke access on candidate consent withdrawal according to disclosed policy.

Optional event clips: derive small clips from finalized recording around actual event times. Preserve full original hash/reference. Label derived media and processing parameters; never fabricate event footage.
