'use client';
import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import {
  ShieldCheck,
  Camera,
  Mic,
  Volume2,
  Smartphone,
  ArrowRight,
  RotateCcw,
  SkipForward,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Radio,
  Sparkles,
  Clock,
  HelpCircle
} from 'lucide-react';
import { api, BASE } from '../../components/api';
import MediaRoom from '../../components/MediaRoom';

export default function CandidateInterview() {
  const [sid, setSid] = useState('');
  const [token, setToken] = useState('');
  const [s, setS] = useState<any>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consentAnalysis, setConsentAnalysis] = useState(true);
  const [consentRecording, setConsentRecording] = useState(true);
  const [capture, setCapture] = useState(true);
  const [qr, setQr] = useState('');
  const [phoneLink, setPhoneLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [now, setNow] = useState(Date.now());
  const [speakerTested, setSpeakerTested] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [secondaryConnected, setSecondaryConnected] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<{ camera: boolean; mic: boolean }>({ camera: false, mic: false });
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'speaking' | 'listening' | 'thinking'>('idle');

  // Parse session and token from URL query params, hash, or sessionStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qSid = params.get('sid');
    const qToken = params.get('token');
    if (qSid && qToken) {
      setSid(qSid);
      setToken(qToken);
      sessionStorage.setItem('verity_candidate', `${qSid}:${qToken}`);
      return;
    }

    const raw = location.hash.slice(1);
    if (raw && raw.includes(':')) {
      sessionStorage.setItem('verity_candidate', raw);
      const [id, t] = raw.split(':');
      setSid(id || '');
      setToken(t || '');
      return;
    }

    const saved = sessionStorage.getItem('verity_candidate') || '';
    if (saved && saved.includes(':')) {
      const [id, t] = saved.split(':');
      setSid(id || '');
      setToken(t || '');
    }
  }, []);

  // Poll session state
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

  // Determine dynamic AI avatar state
  useEffect(() => {
    if (!s) return;
    if (busy) {
      setAiState('thinking');
    } else if (interimText.trim().length > 0) {
      setAiState('listening');
    } else if (s.state === 'LISTENING') {
      setAiState('speaking');
      const timer = setTimeout(() => setAiState('idle'), 3500);
      return () => clearTimeout(timer);
    } else {
      setAiState('idle');
    }
  }, [busy, interimText, s?.current, s?.phase, s?.state]);

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
      slot_id: s.question?.id,
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
    if (text.trim() && s.phase === 'primary' && !(s.question?.spans || []).length) {
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
    setInterimText('');
  }

  async function handleConsentAndStart() {
    await api(`/sessions/${sid}/consent`, token, 'POST', { accepted: true, policy_version: '2026-10-25' });
    if (consentRecording) {
      try {
        await api(`/sessions/${sid}/consent`, token, 'POST', {
          accepted: true,
          policy_version: '2026-10-25',
          role: 'candidate_recording'
        });
      } catch (_) {}
    }
    const started = await api(`/sessions/${sid}/start`, token, 'POST');
    setS(started);
  }

  const playSpeakerTest = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3); // G5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      setSpeakerTested(true);
    } catch (_) {}
  };

  const generatePhoneQr = async () => {
    const r = await api(`/sessions/${sid}/pair`, token, 'POST');
    const baseOrigin =
      location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? 'https://controllers-futures-sql-watson.trycloudflare.com'
        : location.origin;
    const u = `${baseOrigin}/phone#${r.nonce}`;
    setPhoneLink(u);
    setQr(await QRCode.toDataURL(u, { width: 220, margin: 2 }));
  };

  const elapsed = s?.started_at ? Math.max(0, Math.floor(now / 1000 - s.started_at)) : 0;
  const remaining = s ? Math.max(0, s.duration_minutes * 60 - elapsed) : 0;

  return (
    <div className="candidateApp">
      {/* Top Professional Header */}
      <header className="candidateHeader">
        <div className="brandGroup">
          <div className="brandBadge">
            <ShieldCheck size={20} />
          </div>
          <div className="brandText">
            <span className="brandTitle">HireNeuron</span>
            <span className="brandSub">VERITY AI INTERVIEW</span>
          </div>
        </div>

        <div className="headerStatus">
          {s?.state === 'LISTENING' ? (
            <div className="liveTimerPill">
              <Clock size={16} />
              <span>
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} remaining
              </span>
            </div>
          ) : (
            <span className="secureSessionPill">
              <span className="statusDot active"></span>
              Encrypted Session
            </span>
          )}
        </div>
      </header>

      <main className="candidateContainer">
        {error && (
          <div className="alertBanner">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Missing Token / Reconnect Fallback Form */}
        {!sid ? (
          <div className="wizardCard standalone">
            <h2>Candidate Invitation Required</h2>
            <p>Please open the unique link provided in your recruiter invitation email, or enter your credentials below:</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const inputSid = (form.elements.namedItem('sid') as HTMLInputElement)?.value.trim();
                const inputToken = (form.elements.namedItem('token') as HTMLInputElement)?.value.trim();
                if (inputSid && inputToken) {
                  setSid(inputSid);
                  setToken(inputToken);
                  sessionStorage.setItem('verity_candidate', `${inputSid}:${inputToken}`);
                }
              }}
              className="reconnectForm"
            >
              <label>
                Session ID
                <input name="sid" placeholder="e.g. 6e91881a-6e9f-4d8f-9859-..." required />
              </label>
              <label>
                Invitation Token
                <input name="token" placeholder="Paste your candidate token" required />
              </label>
              <button type="submit" className="btnPrimary">
                Connect to Interview <ArrowRight size={16} />
              </button>
            </form>
          </div>
        ) : !s ? (
          <div className="wizardCard standalone center">
            <div className="spinner"></div>
            <h3>Connecting to secure interview room…</h3>
            <p className="muted">Negotiating WebRTC audio channels and proctoring telemetry.</p>
          </div>
        ) : s.state === 'BLUEPRINT_FROZEN' ? (
          /* 2. Candidate Setup & Verification Wizard */
          <div className="setupLayout">
            <div className="setupMain">
              <div className="welcomeBanner">
                <span className="eyebrow">{s.job_title}</span>
                <h1>Welcome, {s.candidate_name}</h1>
                <p>
                  You are about to begin an autonomous AI-driven technical interview. Please verify your camera,
                  microphone, and secondary workspace camera below.
                </p>
              </div>

              {/* Step 1: Device Check */}
              <section className="wizardCard">
                <div className="cardHeader">
                  <div className="stepBadge">STEP 1</div>
                  <div>
                    <h3>Audio &amp; Video Device Verification</h3>
                    <p className="muted">Confirm that your webcam and microphone are working smoothly.</p>
                  </div>
                </div>

                <div className="deviceCheckGrid">
                  <div className="deviceItem">
                    <div className="deviceLabel">
                      <Camera size={18} />
                      <span>Webcam Status</span>
                    </div>
                    <span className={`statusBadge ${deviceStatus.camera ? 'ready' : 'pending'}`}>
                      {deviceStatus.camera ? '✓ Camera Active' : 'Waiting for Preview'}
                    </span>
                  </div>

                  <div className="deviceItem">
                    <div className="deviceLabel">
                      <Mic size={18} />
                      <span>Microphone Level</span>
                    </div>
                    <div className="micMeterWrapper">
                      <div className="micMeterFill" style={{ width: `${Math.max(8, volumeLevel)}%` }}></div>
                    </div>
                  </div>

                  <div className="deviceItem">
                    <div className="deviceLabel">
                      <Volume2 size={18} />
                      <span>Speaker Check</span>
                    </div>
                    <button className="btnSecondary compact" onClick={playSpeakerTest}>
                      {speakerTested ? '✓ Tested (Click to repeat)' : 'Play Test Chime'}
                    </button>
                  </div>
                </div>
              </section>

              {/* Step 2: Smartphone Workspace Camera Pairing */}
              <section className="wizardCard">
                <div className="cardHeader">
                  <div className="stepBadge">STEP 2</div>
                  <div>
                    <h3>Secondary Smartphone Camera (Dual Proctoring)</h3>
                    <p className="muted">
                      Scan the QR code with your phone to provide surrounding workspace visibility. Audio remains disabled on the phone.
                    </p>
                  </div>
                </div>

                {secondaryConnected ? (
                  <div className="successNotice">
                    <CheckCircle2 size={24} style={{ color: '#16a34a' }} />
                    <div>
                      <strong>Secondary Camera Successfully Connected!</strong>
                      <p>Your smartphone is actively streaming rear-camera workspace telemetry.</p>
                    </div>
                  </div>
                ) : (
                  <div className="qrPairingContainer">
                    <div className="qrLeft">
                      {!qr ? (
                        <button className="btnPrimary" onClick={() => void run(generatePhoneQr)}>
                          <Smartphone size={16} /> Generate 3-Minute Pairing QR Code
                        </button>
                      ) : (
                        <div className="qrBox">
                          <img src={qr} alt="Pair Smartphone" width={180} height={180} />
                          <small className="muted">Scan with iPhone Camera or Android Chrome</small>
                        </div>
                      )}
                    </div>

                    <div className="qrRight">
                      <p>
                        <strong>Instructions:</strong> Open your smartphone's camera app, point it at the QR code, and tap the link.
                        Your phone will open directly on our secure HTTPS tunnel with zero warnings.
                      </p>
                      {phoneLink && (
                        <div className="linkCopyRow">
                          <input readOnly value={phoneLink} className="compactInput" />
                          <button
                            className="btnSecondary compact"
                            onClick={() => {
                              navigator.clipboard.writeText(phoneLink);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* Step 3: Consent & Start */}
              <section className="wizardCard highlight">
                <div className="cardHeader">
                  <div className="stepBadge primary">STEP 3</div>
                  <div>
                    <h3>Interview Consent &amp; Integrity Agreement</h3>
                    <p className="muted">Transparent AI observation rules. No candidate is ever automatically disqualified.</p>
                  </div>
                </div>

                <div className="consentGroup">
                  <label className="checkboxLabel">
                    <input
                      type="checkbox"
                      checked={consentAnalysis}
                      onChange={(e) => setConsentAnalysis(e.target.checked)}
                    />
                    <span>
                      I consent to realtime speech transcription, computer vision integrity sampling (~1 FPS), and tamper-evident snapshot storage for recruiter review.
                    </span>
                  </label>

                  <label className="checkboxLabel">
                    <input
                      type="checkbox"
                      checked={consentRecording}
                      onChange={(e) => setConsentRecording(e.target.checked)}
                    />
                    <span>
                      I consent to candidate video and microphone session recording for human recruiter evaluation.
                    </span>
                  </label>
                </div>

                <div className="actionRow">
                  <button
                    className="btnLargePrimary"
                    disabled={!consentAnalysis || busy}
                    onClick={() => void run(handleConsentAndStart)}
                  >
                    <span>START INTERVIEW NOW</span>
                    <ArrowRight size={20} />
                  </button>
                </div>
              </section>
            </div>

            {/* Sidebar Preview */}
            <aside className="setupAside">
              <div className="previewCard">
                <div className="previewTitle">
                  <Camera size={16} /> Live Device Preview
                </div>
                <MediaRoom
                  sid={sid}
                  token={token}
                  onDeviceStatus={setDeviceStatus}
                  onVolume={setVolumeLevel}
                  onSecondaryChange={setSecondaryConnected}
                />
                <p className="previewTip">
                  Position your camera at eye level in a quiet room with good lighting.
                </p>
              </div>
            </aside>
          </div>
        ) : s.state === 'LISTENING' ? (
          /* 3. Live Interview Room (Priority 5) */
          <div className="interviewLayout">
            <div className="interviewMain">
              {/* Question Card */}
              <div className="questionCard">
                <div className="questionMeta">
                  <span className="questionProgress">
                    QUESTION {s.current + 1} OF {s.question_count}
                  </span>
                  <span className="categoryBadge">
                    {s.phase === 'followup' ? 'Contextual Follow-up' : s.question?.category || 'Primary Question'}
                  </span>
                </div>

                {/* Animated AI State Orb */}
                <div className={`aiAvatarOrb ${aiState}`}>
                  <div className="orbCore">
                    {aiState === 'speaking' ? (
                      <Radio size={28} className="pulseAnim" />
                    ) : aiState === 'listening' ? (
                      <Mic size={28} className="waveAnim" />
                    ) : aiState === 'thinking' ? (
                      <Sparkles size={28} className="spinAnim" />
                    ) : (
                      <Sparkles size={28} />
                    )}
                  </div>
                  <span className="aiStateText">
                    {aiState === 'speaking'
                      ? 'AI Interviewer is speaking…'
                      : aiState === 'listening'
                      ? 'Listening to your response…'
                      : aiState === 'thinking'
                      ? 'Evaluating response & reasoning…'
                      : 'Your turn to speak'}
                  </span>
                </div>

                {/* Question Text */}
                <h2 className="questionText">
                  {s.phase === 'followup' ? s.question?.followup : s.question?.text}
                </h2>

                {/* Contextual Follow-up Notice */}
                {s.phase === 'followup' && (
                  <div className="followupNotice">
                    <strong>Contextual Follow-up:</strong> The interviewer is seeking further architectural details on your previous answer.
                  </div>
                )}

                {/* Live Interim Transcription */}
                {interimText && (
                  <div className="liveTranscriptionBanner">
                    <span className="captionDot"></span>
                    <span className="captionLabel">Live Transcription:</span>
                    <span className="captionText">"{interimText}"</span>
                  </div>
                )}

                {/* Spoken Spans History */}
                <div className="transcriptHistory">
                  {s.question?.spans?.length > 0 ? (
                    s.question.spans.map((sp: any) => (
                      <p key={sp.id} className="transcriptSpan">
                        <small>{Math.round(sp.offset)}s:</small> {sp.text}
                      </p>
                    ))
                  ) : !interimText ? (
                    <p className="muted italic">
                      Start speaking naturally into your microphone. Deepgram Nova-3 streams your answer in real time.
                    </p>
                  ) : null}
                </div>

                {/* Text Fallback Toggle */}
                <div className="textFallbackSection">
                  <button
                    className="textToggleBtn"
                    onClick={() => setShowTextFallback(!showTextFallback)}
                  >
                    {showTextFallback ? '− Hide text fallback' : '+ Open text fallback / add notes'}
                  </button>
                  {showTextFallback && (
                    <textarea
                      rows={3}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Type your answer here if your microphone is muted or to append technical code..."
                      className="fallbackInput"
                    />
                  )}
                </div>

                {/* Skip Question Confirmation Box */}
                {showSkipModal ? (
                  <div className="confirmBox">
                    <p><strong>Skip this question?</strong> It will be recorded as skipped without penalizing earlier answers.</p>
                    <div className="confirmActions">
                      <button className="btnPrimary compact" onClick={() => void run(() => action('skip')).then(() => setShowSkipModal(false))}>
                        Yes, Skip Question
                      </button>
                      <button className="btnSecondary compact" onClick={() => setShowSkipModal(false)}>
                        Keep Answering
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Interview Action Toolbar */
                  <div className="interviewControlsBar">
                    <button className="btnLargeDone" disabled={busy} onClick={() => void run(submit)}>
                      <span>Done Answering</span>
                      <ArrowRight size={18} />
                    </button>

                    <button className="btnSecondary" disabled={busy} onClick={() => void run(() => action('repeat'))}>
                      <RotateCcw size={16} /> Repeat
                    </button>

                    <button className="btnSecondary" disabled={busy} onClick={() => setShowSkipModal(true)}>
                      <SkipForward size={16} /> Skip
                    </button>

                    <button
                      className="btnTextDanger"
                      onClick={() => {
                        if (confirm('Finish interview now? Any remaining questions will be marked unanswered.')) {
                          void run(() => action('finish'));
                        }
                      }}
                    >
                      Finish Early
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Media Stream */}
            <aside className="interviewAside">
              <MediaRoom
                sid={sid}
                token={token}
                onInterimTranscript={setInterimText}
                onSecondaryChange={setSecondaryConnected}
              />
              <div className="interviewProctoringPill">
                <ShieldCheck size={14} />
                <span>Continuous 2-Camera CV Monitoring Active</span>
              </div>
            </aside>
          </div>
        ) : (
          /* 4. Completion Screen */
          <div className="wizardCard standalone completionCard">
            <div className="completionIcon">
              <CheckCircle2 size={56} style={{ color: '#16a34a' }} />
            </div>
            <h1>Thank You! Your Interview is Complete.</h1>
            <p>
              Your spoken responses, encrypted dual-camera snapshots, and recording have been safely submitted
              to the recruiter for structured evaluation.
            </p>
            <div className="completionSummaryPills">
              <span className="summaryPill">✓ {s.question_count} Questions Processed</span>
              <span className="summaryPill">✓ Evidence Sealed with HMAC</span>
              <span className="summaryPill">✓ Evaluation In Progress</span>
            </div>
            <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
              You may safely close this browser window.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
