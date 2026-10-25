'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, Mic, ArrowRight, RotateCcw, Smartphone, Copy, Check, AlertCircle } from 'lucide-react';
import { api } from '../../components/api';
import MediaRoom from '../../components/MediaRoom';

export default function Interview() {
  const [sid, setSid] = useState('');
  const [token, setToken] = useState('');
  const [s, setS] = useState<any>(null);
  const [consentAnalysis, setConsentAnalysis] = useState(true);
  const [consentRecording, setConsentRecording] = useState(true);
  const [capture, setCapture] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');
  const [phoneLink, setPhoneLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const raw = location.hash.slice(1);
    if (raw) {
      sessionStorage.setItem('verity_candidate', raw);
      history.replaceState(null, '', location.pathname);
    }
    const [id, t] = (raw || sessionStorage.getItem('verity_candidate') || '').split(':');
    setSid(id || '');
    setToken(t || '');
  }, []);

  useEffect(() => {
    if (!sid || !token) return;
    let alive = true;
    const refresh = () =>
      api('/sessions/' + sid, token)
        .then((r) => {
          if (alive) setS(r);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    void refresh();
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sid, token]);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await f();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const action = async (a: string, answer = '') => {
    const r = await api(`/sessions/${sid}/action`, token, 'POST', {
      action: a,
      text: answer,
      slot_id: s.question.id,
      request_id: crypto.randomUUID()
    });
    setS(r.state);
    if (r.message && a === 'repeat') {
      const u = new SpeechSynthesisUtterance(r.message);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  };

  async function submit() {
    if (text.trim() && s.phase === 'primary' && !(s.question.spans || []).length) {
      const f = await api(`/sessions/${sid}/followup`, token, 'POST', {
        action: 'answer',
        text,
        slot_id: s.question.id,
        request_id: crypto.randomUUID()
      });
      if (f.needed) {
        setText('');
        setS(await api(`/sessions/${sid}`, token));
        return;
      }
    }
    await action('answer', text);
    setText('');
  }

  async function handleConsent() {
    await api(`/sessions/${sid}/consent`, token, 'POST', { accepted: true, policy_version: '2026-10-25' });
    if (consentRecording) {
      try {
        await api(`/sessions/${sid}/consent`, token, 'POST', { accepted: true, policy_version: '2026-10-25', role: 'candidate_recording' });
      } catch (_) {}
    }
    setCapture(true);
  }

  const elapsed = s?.started_at ? Math.max(0, Math.floor(now / 1000 - s.started_at)) : 0;
  const remaining = s ? Math.max(0, s.duration_minutes * 60 - elapsed) : 0;

  return (
    <div className="candidateShell">
      <nav className="candidateNav">
        <div className="brand">
          <div className="brandIcon">
            <ShieldCheck />
          </div>
          <span>
            HireNeuron<small>VERITY INTERVIEW</small>
          </span>
        </div>
        <span className="pill">Private candidate session</span>
      </nav>

      <div className="candidateContent">
        {error && <div role="alert" className="error">{error}</div>}

        {!sid ? (
          <div className="card">
            <h1>Invitation link required.</h1>
            <p>Please open the unique candidate link provided by your recruiter.</p>
          </div>
        ) : !s ? (
          <p>Connecting to interview session…</p>
        ) : (
          <>
            <div className="pageHeading">
              <div>
                <div className="eyebrow">{s.job_title}</div>
                <h1>Hello, {s.candidate_name}.</h1>
                <p>Welcome. Explain your thought process naturally. You can repeat or skip whenever needed.</p>
              </div>
              <span className="timer">
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </span>
            </div>

            {s.state === 'BLUEPRINT_FROZEN' ? (
              <div className="configGrid">
                <section className="card form">
                  <h2>Candidate Onboarding & Consent</h2>
                  <p>
                    This autonomous interview uses real-time voice, computer vision proctoring, and structured AI evaluation.
                    Observations are preserved for transparent human recruiter review.
                  </p>

                  <div className="notice">
                    <strong>Interview Rules & Boundaries</strong>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      <li>Use a well-lit, quiet environment.</li>
                      <li>Speak naturally. Explicit "Done answering" is always available.</li>
                      <li>Pair your smartphone as a second camera for surrounding workspace verification.</li>
                      <li>Proctoring signals are observational; no automated disqualifications occur.</li>
                    </ul>
                  </div>

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={consentAnalysis}
                      onChange={(e) => setConsentAnalysis(e.target.checked)}
                    />
                    I consent to speech transcription, camera analysis, and evidence snapshot storage.
                  </label>

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={consentRecording}
                      onChange={(e) => setConsentRecording(e.target.checked)}
                    />
                    I consent to full audio and video session recording for recruiter review and audit verification.
                  </label>

                  <div className="toolbar" style={{ marginTop: 20 }}>
                    <button
                      className="secondary"
                      disabled={!consentAnalysis || busy}
                      onClick={() => void run(handleConsent)}
                    >
                      Check camera & microphone
                    </button>
                    <button
                      className="primary"
                      disabled={!consentAnalysis || busy}
                      onClick={() =>
                        void run(async () => {
                          await handleConsent();
                          setS(await api(`/sessions/${sid}/start`, token, 'POST'));
                        })
                      }
                    >
                      Begin interview <ArrowRight size={16} />
                    </button>
                  </div>
                </section>

                <section>
                  {capture ? (
                    <MediaRoom sid={sid} token={token} onInterimTranscript={(t) => setInterimText(t)} />
                  ) : (
                    <div className="card empty">
                      <Mic size={40} />
                      <h3>Device Check</h3>
                      <p>Click "Check camera & microphone" above to initialize your preview.</p>
                    </div>
                  )}
                </section>
              </div>
            ) : s.state === 'LISTENING' ? (
              <div className="interviewGrid">
                <section className="card interviewQuestion">
                  <div className="questionTop">
                    <span className="pill">
                      QUESTION {s.current + 1} / {s.question_count}
                    </span>
                    <span className="pill" style={{ background: '#eef2ff', color: '#4338ca' }}>
                      {s.phase === 'followup' ? 'Contextual Follow-up' : 'Primary Question'}
                    </span>
                  </div>

                  <div className="agentMark">✦</div>
                  <h2>{s.phase === 'followup' ? s.question?.followup : s.question?.text}</h2>
                  <p className="muted">
                    Speak your answer. Voice transcription streams automatically. Click "Done answering" when you finish.
                  </p>

                  <div className="transcript">
                    {s.question?.spans?.length ? (
                      s.question.spans.map((p: any) => (
                        <p key={p.id}>
                          <small style={{ color: '#818cf8', marginRight: 6 }}>
                            {Math.floor(p.offset)}s:
                          </small>
                          {p.text}
                        </p>
                      ))
                    ) : (
                      <p className="muted" style={{ fontStyle: 'italic' }}>
                        Listening for spoken response… (Or type in the text box below)
                      </p>
                    )}
                    {interimText && (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: '#f5f3ff', borderRadius: 6, border: '1px dashed #8b5cf6', color: '#6d28d9' }}>
                        <span style={{ fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="dot" style={{ background: '#8b5cf6', width: 6, height: 6 }} /> Live Transcription:
                        </span>
                        <p style={{ margin: '4px 0 0', fontStyle: 'italic', fontSize: 13 }}>"{interimText}"</p>
                      </div>
                    )}
                  </div>

                  <label>
                    Text fallback / additional answer details
                    <textarea
                      rows={4}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Type your response here if microphone is unavailable or to append notes..."
                    />
                  </label>

                  {s.pending_skip ? (
                    <div className="notice" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
                      <strong>Do you want to skip this question?</strong>
                      <p style={{ margin: '4px 0 10px', fontSize: 12 }}>
                        Skipping records the question as skipped without penalizing earlier answers.
                      </p>
                      <div className="toolbar">
                        <button disabled={busy} className="primary" onClick={() => void run(() => action('skip'))}>
                          Yes, skip question
                        </button>
                        <button disabled={busy} className="secondary" onClick={() => void run(() => action('cancel_skip'))}>
                          Keep answering
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="toolbar">
                      <button disabled={busy} className="primary" onClick={() => void run(submit)}>
                        Done answering <ArrowRight size={16} />
                      </button>
                      <button disabled={busy} className="secondary" onClick={() => void run(() => action('repeat'))}>
                        <RotateCcw size={16} /> Repeat question
                      </button>
                      <button disabled={busy} className="secondary" onClick={() => void run(() => action('request_skip'))}>
                        Skip question
                      </button>
                    </div>
                  )}

                  <div style={{ marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                    <button
                      className="textButton"
                      onClick={() => {
                        if (confirm('Finish interview now? Remaining questions will be recorded as unanswered.')) {
                          void run(() => action('finish'));
                        }
                      }}
                    >
                      Finish interview early
                    </button>
                  </div>
                </section>

                <section>
                  {capture ? (
                    <MediaRoom sid={sid} token={token} onInterimTranscript={(t) => setInterimText(t)} />
                  ) : (
                    <div className="card">
                      <p>Media preview is paused on this view.</p>
                      <button className="secondary" onClick={() => setCapture(true)}>
                        Resume camera preview
                      </button>
                    </div>
                  )}

                  <div className="card phoneCard">
                    <Smartphone size={28} />
                    <h3>Secondary Phone Camera</h3>
                    <p>Pair your smartphone for surrounding workspace visibility. Audio remains disabled on the phone.</p>
                    <button
                      className="secondary"
                      onClick={() =>
                        void run(async () => {
                          const r = await api(`/sessions/${sid}/pair`, token, 'POST');
                          const u = `${location.origin}/phone#${r.nonce}`;
                          setPhoneLink(u);
                          setQr(await QRCode.toDataURL(u, { width: 220, margin: 2 }));
                        })
                      }
                    >
                      Generate 3-minute QR pairing code
                    </button>
                    {qr && (
                      <div style={{ textAlign: 'center', marginTop: 14 }}>
                        <img src={qr} alt="Scan QR code with smartphone" width={220} height={220} />
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <input readOnly value={phoneLink} style={{ fontSize: 11 }} />
                          <button
                            className="secondary"
                            onClick={() => {
                              navigator.clipboard.writeText(phoneLink);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                        <small style={{ color: '#64748b', marginTop: 6, display: 'block' }}>
                          One-time challenge token expires in 180 seconds.
                        </small>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <section className="card completion">
                <ShieldCheck size={56} style={{ color: '#168b74' }} />
                <h1>Thank you. Your interview is complete.</h1>
                <p>Your audio and video feeds have stopped. Your responses and evidence are ready for recruiter evaluation.</p>
                <span className="pill" style={{ background: '#ecfdf5', color: '#065f46' }}>
                  ✓ Responses Submitted Successfully
                </span>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
