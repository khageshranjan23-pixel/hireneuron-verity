# Product and visual specification

Visual goal: calm, credible recruiter tool, not a surveillance alarm console. The supplied UI uses indigo (#5550dc), dark ink (#172239), pale gray background (#f6f7fb), white cards, fine borders, 8–15px radii and restrained iconography. Keep strong typography hierarchy and readable transcript line lengths.

Recruiter overview: compact sidebar, breadcrumb, product introduction, actual session counts, real session list and useful empty state. Avoid fake accuracy, time-saved metrics and “100% secure” badges.

Configuration: role/candidate on left, interview structure on right; resume upload with extracted text review, fixed custom questions and clear duration/slot defaults. Add structured profile/skills review in next iteration.

Candidate: one prominent current question, explicit phase/slot count, remaining time, final transcript, Done/repeat/skip, live capture status, phone QR and accessible text fallback. Camera permissions never requested before consent. State restoration must be visible after reload.

Phone: one-column mobile-first flow, separate consent, clear placement instructions, visible camera feed, no mic request, stop camera and reconnect feedback. Avoid exposing report scores on phone.

Report: separate assessment/integrity/audit tabs. Each score cites actual answer spans. Each event names observation, source and time. No red “cheater” badges or ranking by appearance. Render latest reviewer assessment alongside original machine output and history.

Interaction states: loading, empty, error, offline, expired invitation, QR expired, provider unavailable, worker stale, unanswered, timed out, insufficient evidence. Every failure offers an honest next action.

Accessibility: 44px touch targets where practical, keyboard-visible focus, semantic labels, screen reader alerts for errors, non-color status indicators, reduced-motion support, readable contrast. Test long names, 20k-character answers, zoom, 390px portrait and landscape phone.

The project uses hand-authored CSS and vector icons. No generated raster design is required to run it. Keep product wording understandable; show implementation details only on a diagnostic view.
