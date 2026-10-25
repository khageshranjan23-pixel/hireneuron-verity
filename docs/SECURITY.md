# Security, privacy and evidence boundaries

## Implemented local prototype properties

- One recruiter bearer token, separate worker bearer token, scoped random candidate/phone credentials stored by SHA-256; API validates role and session.
- Candidate invite never grants recruiter functions. Phone API credential cannot retrieve interview transcript.
- Opaque phone QR challenge stores digest only, expires in 180 seconds, and is consumed inside a SQLite write transaction.
- LiveKit identity/room are server-generated. Phone grant restricts camera publication and denies subscription and data publication.
- Consent before candidate media tokens; separate phone consent before redemption. Phone UI never requests audio.
- Uploaded PDF/DOCX has bounded compressed size, PDF pages and DOCX expanded size. Raw document not retained by extraction endpoint.
- Evidence is encrypted at rest with Fernet, read back/checksummed before event sealing, and fetched through a recruiter-authenticated route.
- Event records form an HMAC-sealed chain. This detects changes after receipt while keys remain secure. It does not prove physical room authenticity or protect against a fully compromised signer.
- Candidate and phone tokens remain session-storage values. No server API secrets are in NEXT_PUBLIC variables.

## Required before broader deployment

- Named user accounts, organization tenancy, RBAC, invitation expiry/rotation, per-user audit identity, secure HttpOnly cookie or equivalent session architecture.
- Distributed rate limiting on auth, uploads, challenge creation/redemption, LLM usage and evidence; total session/user cost quotas.
- Parser subprocess sandbox and resource limits. Length limits alone do not make hostile PDF parsing safe.
- Explicit recording consent, withdrawal, removal from active room and cancellation of worker capture. JWT expiry alone is insufficient active revocation.
- TLS at all boundaries; correct CORS origin allowlist; CSP and security headers; server-secret rotation and encrypted backup policy.
- Worker service identity or signed internal events with least privilege. The prototype worker token has broad workspace authority; do not expose it to browsers.
- Scheduled retention/deletion including objects, recordings, DB backups, provider retention behavior and logs. Explain exact policy to candidates.
- Protect raw resume/transcript data from debug logs; avoid storing provider response bodies in general error logs.
- No biometric identity verification, emotion recognition, protected-attribute inference or automatic hiring decision. Human review remains required.
- Do not claim regulatory compliance from these engineering controls; deployment policy needs jurisdiction-specific review.

## Abuse tests

Replay QR; race two redemptions; request another room; tamper identity metadata; publish mic as phone; enumerate sessions as candidate; retrieve evidence from another session; forge event from browser; mutate request ID payload; submit prompt-injection resume; malformed provider quotation; alter encrypted evidence and event JSON; oversized/zip-bomb documents; expired credentials; deleted-session replay.

## Sensitive files

Never commit `.env`, databases, real resumes, recordings, evidence, private invitations, or generated benchmark recordings. The ZIP contains no runtime secrets or real candidate data. Keep `.env.example`. Backup the encryption key securely: losing it makes stored snapshots unreadable.
