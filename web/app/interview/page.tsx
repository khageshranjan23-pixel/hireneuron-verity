'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
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
  HelpCircle,
  AlertTriangle,
  Users,
  EyeOff,
  Activity
} from 'lucide-react';
import { api, BASE } from '@/components/api';
import MediaRoom from '@/components/MediaRoom';

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
  const [speakerPlaying, setSpeakerPlaying] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [secondaryConnected, setSecondaryConnected] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<{ camera: boolean; mic: boolean }>({ camera: false, mic: false });
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showTextFallback, setShowTextFallback] = useState(true);
  const [micActive, setMicActive] = useState(false);
  const [answerCleared, setAnswerCleared] = useState(false); // tracks fresh-clear animation
  const [aiState, setAiState] = useState<'idle' | 'speaking' | 'listening' | 'thinking'>('idle');
  const [proctoringAlert, setProctoringAlert] = useState<{ type: string; message: string; severity: string; time: number } | null>(null);
  const [eventCount, setEventCount] = useState(0);

  // Proctoring Warning Controller & Disqualification States
  const MAX_WARNINGS = 3;
  const [warningCount, setWarningCount] = useState(0);
  const [warningsList, setWarningsList] = useState<Array<{ type: string; message: string; time: string }>>([]);
  const [disqualified, setDisqualified] = useState(false);
  const lastViolationTimeRef = useRef<{ [key: string]: number }>({});

  const handleFinalTranscript = useCallback((finalChunk: string) => {
    // Suppress if we just switched to a new question
    if (clearBlockRef.current) return;
    if (!finalChunk || !finalChunk.trim()) return;
    const chunk = finalChunk.trim();
    setText((prev) => {
      if (!prev) return chunk;
      if (prev.endsWith(chunk)) return prev;
      return prev + ' ' + chunk;
    });
    setInterimText('');
  }, []);

  const triggerViolationWarning = useCallback((type: string, message: string) => {
    const criticalViolations = [
      'ELECTRONIC_DEVICE_DETECTED',
      'MULTIPLE_PERSONS',
      'FACE_ABSENT',
      'LOOK_AWAY_SEVERE',
      'READING_PATTERN',
      'SPEAKING_WHILE_AWAY',
      'TAB_SWITCH',
      'BLUR'
    ];
    if (!criticalViolations.includes(type)) return;

    const nowTime = Date.now();
    const lastTime = lastViolationTimeRef.current[type] || 0;
    if (nowTime - lastTime < 10000) return; // 10s cooldown per violation category
    lastViolationTimeRef.current[type] = nowTime;

    setWarningCount((prev) => {
      const nextCount = prev + 1;
      const timeStr = new Date().toLocaleTimeString();
      setWarningsList((w) => [...w, { type, message, time: timeStr }]);

      if (nextCount >= MAX_WARNINGS) {
        setDisqualified(true);
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        void api(`/sessions/${sid}/disqualify`, token, 'POST', {
          reason: `Automatic disqualification: Exceeded ${MAX_WARNINGS} integrity warnings (${type})`
        }).catch(() => {});
      }
      return nextCount;
    });
  }, [sid, token]);

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

  // ─── CLEAR ANSWER BOX ON EVERY NEW QUESTION ───────────────────────────────
  // Runs whenever the question slot index or phase changes — guarantees the
  // textarea is always fresh and never carries over from a previous question.
  const prevQuestionKey = useRef<string>('__init__');
  // Block SpeechRecognition results briefly after a question change to prevent
  // buffered audio from the previous question re-populating the new answer box.
  const clearBlockRef = useRef(false);

  useEffect(() => {
    if (!s || s.state !== 'LISTENING') return;
    // Use current slot index + phase as the unique key (question.id may be static)
    const key = `${s.current ?? 0}-${s.phase ?? 'primary'}`;
    if (key !== prevQuestionKey.current) {
      prevQuestionKey.current = key;
      // Block any STT result from landing for 800ms after question transition
      clearBlockRef.current = true;
      setText('');
      setInterimText('');
      setAnswerCleared(true);
      const unblock = setTimeout(() => { clearBlockRef.current = false; }, 800);
      const anim = setTimeout(() => setAnswerCleared(false), 600);
      return () => { clearTimeout(unblock); clearTimeout(anim); };
    }
  }, [s?.current, s?.phase, s?.state]);

  // In-browser Web Speech API recognition — robust continuous capture with auto-restart
  const stopRequestedRef = useRef(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!s || s.state !== 'LISTENING' || typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    stopRequestedRef.current = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const startRecognition = () => {
      if (stopRequestedRef.current) return;
      try {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch (_) {}
        }
        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        rec.maxAlternatives = 1;

        rec.onstart = () => {
          setMicActive(true);
        };

        rec.onresult = (event: any) => {
          // If we just transitioned to a new question, suppress buffered results
          // for 800ms to prevent previous-question audio from polluting the new box
          if (clearBlockRef.current) return;
          let currentInterim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              setText((prev) => {
                const trimmed = transcript.trim();
                if (!trimmed) return prev;
                return prev ? prev + ' ' + trimmed : trimmed;
              });
              setInterimText('');
            } else {
              currentInterim += transcript;
            }
          }
          if (currentInterim) {
            setInterimText(currentInterim);
          }
        };

        rec.onerror = (e: any) => {
          // 'no-speech' is normal — just means silence, recognition will end and we'll restart
          // 'aborted' means we called abort() ourselves — ignore
          if (e.error === 'aborted') return;
          console.warn('Web Speech error:', e.error);
          // For network/audio errors, attempt restart after a short delay
          if (e.error === 'network' || e.error === 'audio-capture' || e.error === 'service-not-allowed') {
            setMicActive(false);
          }
        };

        rec.onend = () => {
          setMicActive(false);
          if (stopRequestedRef.current) return;
          // Auto-restart after a brief pause (helps with browser throttling)
          restartTimer = setTimeout(() => {
            if (!stopRequestedRef.current) {
              startRecognition();
            }
          }, 250);
        };

        recognitionRef.current = rec;
        rec.start();
      } catch (e) {
        console.warn('SpeechRecognition init error:', e);
        setMicActive(false);
      }
    };

    startRecognition();

    return () => {
      stopRequestedRef.current = true;
      setMicActive(false);
      if (restartTimer) clearTimeout(restartTimer);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) {}
        recognitionRef.current = null;
      }
    };
  }, [s?.state, s?.current, s?.phase]);

  // Poll server-side OpenCV proctoring events
  useEffect(() => {
    if (!sid || !token || !s || s.state !== 'LISTENING') return;
    const pollEvents = async () => {
      try {
        const events = await api(`/sessions/${sid}/events`, token);
        if (Array.isArray(events)) {
          setEventCount(events.length);
          if (events.length > 0) {
            const latest = events[events.length - 1];
            if (latest && Date.now() / 1000 - latest.timestamp < 8) {
              let msg = '⚠️ Proctoring Alert';
              if (latest.type === 'MULTIPLE_PERSONS') {
                msg = '🚨 CHEATING ALERT: Multiple Persons in Camera Frame!';
              } else if (latest.type === 'FACE_ABSENT') {
                msg = '⚠️ WARNING: Face Out of Camera View!';
              } else if (latest.type === 'HEAD_TURN_PROLONGED') {
                msg = '⚠️ SUSPICIOUS: Candidate Looking Away from Screen!';
              } else if (latest.type === 'GAZE_DEVIATION') {
                msg = '👀 ALERT: Sustained Eye Gaze Deviation Detected!';
              } else if (latest.type === 'READING_PATTERN') {
                msg = '📖 SUSPICIOUS: Reading Pattern Detected — Eyes Scanning Horizontally!';
              } else if (latest.type === 'SPEAKING_WHILE_AWAY') {
                msg = '🗣️ ALERT: Speaking While Looking Away — Possible Coaching!';
              } else if (latest.type === 'FACE_OBSCURED') {
                msg = '🫣 WARNING: Face Partially Covered or Obscured!';
              } else if (latest.type === 'MULTIPLE_VOICES') {
                msg = '🔊 ALERT: Multiple Voices Detected — Possible Assistance!';
              } else if (latest.type === 'LOOK_AWAY_SEVERE') {
                msg = '⚠️ SEVERE: Prolonged Look-Away from Screen!';
              } else if (latest.type === 'RAPID_TOGGLE') {
                msg = '⚠️ SUSPICIOUS: Repeated Appearing/Disappearing from Camera!';
              } else if (latest.type === 'PHONE_CALL_SUSPECTED') {
                msg = '📱 ALERT: Phone Use Suspected — Mouth Open While Looking Down!';
              } else if (latest.type === 'ELECTRONIC_DEVICE_DETECTED') {
                msg = '🚨 CHEATING ALERT: Electronic Device Detected (Phone / Laptop / Secondary Screen)!';
              }
              setProctoringAlert({
                type: latest.type,
                message: msg,
                severity: latest.severity || 'NEEDS_REVIEW',
                time: Date.now()
              });
              triggerViolationWarning(latest.type, msg);
            }
          }
        }
      } catch (_) {}
    };
    const timer = setInterval(pollEvents, 1500);
    return () => clearInterval(timer);
  }, [sid, token, s?.state]);

  // Auto-clear proctoring alert after 5s
  useEffect(() => {
    if (!proctoringAlert) return;
    const timer = setTimeout(() => setProctoringAlert(null), 5000);
    return () => clearTimeout(timer);
  }, [proctoringAlert]);

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

  const lastSpokenQRef = useRef('');

  const speakText = (textToSpeak: string) => {
    if (!textToSpeak || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(textToSpeak);
      u.rate = 0.95;
      u.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('David') || v.name.includes('English')));
      if (preferred) u.voice = preferred;

      u.onstart = () => setAiState('speaking');
      u.onend = () => setAiState('idle');
      u.onerror = () => setAiState('idle');

      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn('Speech synthesis notice:', e);
    }
  };

  // Automatically read questions out loud when entering LISTENING or when question changes
  useEffect(() => {
    if (!s || s.state !== 'LISTENING') return;
    const qText = (s.phase === 'followup' ? s.question?.followup : s.question?.text) || '';
    if (qText && qText !== lastSpokenQRef.current) {
      lastSpokenQRef.current = qText;
      const timer = setTimeout(() => {
        speakText(qText);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [s?.state, s?.current, s?.phase, s?.question?.id, s?.question?.text, s?.question?.followup]);

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
    if (a === 'repeat') {
      const qText = r.message || (s.phase === 'followup' ? s.question?.followup : s.question?.text) || '';
      speakText(qText);
    }
  };

  async function submit() {
    const finalAnswer = (text.trim() + (interimText ? ' ' + interimText.trim() : '')).trim();
    if (finalAnswer && s.phase === 'primary' && !(s.question?.spans || []).length) {
      const f = await api(`/sessions/${sid}/followup`, token, 'POST', {
        action: 'answer',
        text: finalAnswer,
        slot_id: s.question.id,
        request_id: crypto.randomUUID()
      });
      if (f.needed) {
        setText('');
        setInterimText('');
        setS(await api(`/sessions/${sid}`, token));
        return;
      }
    }
    await action('answer', finalAnswer);
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

  const playSpeakerTest = async () => {
    setSpeakerPlaying(true);
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';

      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(523.25, t); // C5
      osc.frequency.setValueAtTime(659.25, t + 0.18); // E5
      osc.frequency.setValueAtTime(783.99, t + 0.36); // G5
      osc.frequency.setValueAtTime(1046.5, t + 0.54); // C6

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.85);

      setTimeout(() => {
        setSpeakerTested(true);
        setSpeakerPlaying(false);
      }, 900);
    } catch (_) {
      setSpeakerTested(true);
      setSpeakerPlaying(false);
    }
  };

  const generatePhoneQr = async () => {
    try {
      await api(`/sessions/${sid}/consent`, token, 'POST', { accepted: true, policy_version: '2026-10-25' });
    } catch (_) {}
    const r = await api(`/sessions/${sid}/pair`, token, 'POST');
    let baseOrigin = location.origin;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      try {
        const tun = await api('/tunnel', '');
        if (tun?.url) {
          baseOrigin = tun.url;
        }
      } catch (_) {}
    }
    const u = `${baseOrigin}/phone?nonce=${r.nonce}#${r.nonce}`;
    setPhoneLink(u);
    setQr(await QRCode.toDataURL(u, { width: 220, margin: 2 }));
  };

  const elapsed = s?.started_at ? Math.max(0, Math.floor(now / 1000 - s.started_at)) : 0;
  const remaining = s ? Math.max(0, s.duration_minutes * 60 - elapsed) : 0;

  return (
    <div className="candidateApp">
      {/* Top Header */}
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
                  <div className="stepBadge primary">STEP 1</div>
                  <div>
                    <h3>Audio &amp; Video Device Verification</h3>
                    <p className="muted">Verify that your webcam and microphone respond cleanly before beginning.</p>
                  </div>
                </div>

                <div className="deviceCheckGrid">
                  <div className="deviceItem">
                    <div className="deviceLabel">
                      <Camera size={18} />
                      <span>Webcam Feed</span>
                    </div>
                    <span className={`statusBadge ${deviceStatus.camera ? 'ready' : 'pending'}`}>
                      {deviceStatus.camera ? '✓ Camera Active' : 'Initializing Preview…'}
                    </span>
                  </div>

                  <div className="deviceItem">
                    <div className="deviceLabel">
                      <Mic size={18} />
                      <span>Microphone Level</span>
                    </div>
                    <div className="micMeterWrapper">
                      <div className="micMeterFill" style={{ width: `${Math.max(10, volumeLevel)}%` }}></div>
                    </div>
                    <small className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                      {volumeLevel > 15 ? '✓ Speech Detected' : 'Speak to test mic'}
                    </small>
                  </div>

                  <div className="deviceItem">
                    <div className="deviceLabel">
                      <Volume2 size={18} />
                      <span>Speaker Check</span>
                    </div>
                    <button className="btnSecondary compact" onClick={playSpeakerTest} disabled={speakerPlaying}>
                      {speakerPlaying ? '🔊 Playing Chime…' : speakerTested ? '✓ Tested (Click to repeat)' : 'Play Test Chime'}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
                  <span>
                    <strong>Positioning Check:</strong> Ensure your head is centered in the camera preview on the right. You can tap <em>Calibrate</em> anytime to align your natural straight-ahead resting pose.
                  </span>
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
          /* 3. Live Interview Room */
          <div className="interviewLayout">
            <div className="interviewMain">
              {/* Real-time Proctoring Alert Banner (Only for sustained actionable notices) */}
              {proctoringAlert && (proctoringAlert.type === 'FACE_ABSENT' || proctoringAlert.type === 'MULTIPLE_PERSONS' || proctoringAlert.type === 'READING_PATTERN' || proctoringAlert.type === 'SPEAKING_WHILE_AWAY' || proctoringAlert.type === 'MULTIPLE_VOICES' || proctoringAlert.type === 'LOOK_AWAY_SEVERE' || proctoringAlert.type === 'RAPID_TOGGLE' || proctoringAlert.type === 'PHONE_CALL_SUSPECTED' || proctoringAlert.type === 'ELECTRONIC_DEVICE_DETECTED') && (
                <div className={`proctoringWarningBanner ${proctoringAlert.severity.toLowerCase()}`}>
                  {proctoringAlert.type === 'MULTIPLE_PERSONS' ? (
                    <Users size={20} className="alertIconPulse" />
                  ) : proctoringAlert.type === 'ELECTRONIC_DEVICE_DETECTED' ? (
                    <Smartphone size={20} className="alertIconPulse" style={{ color: '#ef4444' }} />
                  ) : (
                    <EyeOff size={20} className="alertIconPulse" />
                  )}
                  <div className="bannerText">
                    <strong>{proctoringAlert.message}</strong>
                    <p>Camera monitoring active · Please maintain your position in frame.</p>
                  </div>
                </div>
              )}

              {/* Question Card */}
              <div className="questionCard">
                <div className="questionMeta">
                  <span className="questionProgress">
                    QUESTION {s.current + 1} OF {s.question_count}
                  </span>
                  <div className="metaBadgesRow">
                    <span className="categoryBadge">
                      {s.phase === 'followup' ? 'Contextual Follow-up' : s.question?.category || 'Primary Question'}
                    </span>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 9px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      background: warningCount === 0 ? '#f0fdf4' : warningCount === 1 ? '#fefce8' : '#fef2f2',
                      border: `1px solid ${warningCount === 0 ? '#bbf7d0' : warningCount === 1 ? '#fef08a' : '#fecaca'}`,
                      color: warningCount === 0 ? '#15803d' : warningCount === 1 ? '#a16207' : '#b91c1c'
                    }}>
                      <ShieldCheck size={12} />
                      <span>Integrity Strikes: {warningCount} / {MAX_WARNINGS}</span>
                    </span>
                    <span className="integrityIndicator">
                      <ShieldCheck size={13} />
                      <span>Proctoring Active ({eventCount} Events)</span>
                    </span>
                  </div>
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 12 }}>
                  <button
                    type="button"
                    className="btnSecondary compact"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px' }}
                    onClick={() => {
                      const qText = (s.phase === 'followup' ? s.question?.followup : s.question?.text) || '';
                      speakText(qText);
                    }}
                  >
                    <Volume2 size={16} /> 🔊 Read Question Out Loud
                  </button>
                </div>

                {/* Contextual Follow-up Notice */}
                {s.phase === 'followup' && (
                  <div className="followupNotice">
                    <strong>Contextual Follow-up:</strong> The interviewer is seeking further architectural details on your previous answer.
                  </div>
                )}

                {/* Mic Status + Live Transcription Area */}
                <div className={`micStatusBar ${micActive ? 'micStatusBarActive' : 'micStatusBarIdle'}`}>
                  <span className={`micDot ${micActive ? 'micDotActive' : 'micDotIdle'}`}></span>
                  <span className="micStatusLabel">
                    {micActive ? '🎤 Listening — speak now...' : '⏸ Mic paused, resuming...'}
                  </span>
                  {(text || interimText) && (
                    <span className="wordCountBadge">
                      {(text + (interimText ? ' ' + interimText : '')).trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                  )}
                </div>

                {/* Live Interim Transcription Banner */}
                {interimText && (
                  <div className="liveTranscriptionBanner">
                    <span className="captionDot"></span>
                    <span className="captionLabel">Hearing:</span>
                    <span className="captionText">"{interimText}"</span>
                  </div>
                )}

                {/* Always-Visible Answer Text Box */}
                <div className="answerBoxWrapper">
                  <div className="answerBoxHeader">
                    <span className="answerBoxLabel">📝 Your Answer</span>
                    <span className="answerBoxHint">auto-filled as you speak · you can edit</span>
                    {(text || interimText) && (
                      <button
                        className="clearAnswerBtn"
                        title="Clear and re-record"
                        onClick={() => { setText(''); setInterimText(''); }}
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={5}
                    value={text + (interimText ? (text ? ' ' : '') + interimText : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      // If user edits while interim is showing, commit it as final text
                      setText(val);
                      setInterimText('');
                    }}
                    placeholder={answerCleared
                      ? '✨ Ready for your answer — start speaking...'
                      : 'Your spoken words appear here in real time. Start speaking...'}
                    className={`answerBoxMain${answerCleared ? ' answerBoxFresh' : ''}`}
                    spellCheck={false}
                  />
                  <div className="answerBoxFooter">
                    <span className="answerBoxChars">
                      {(text + (interimText ? ' ' + interimText : '')).trim().length > 0
                        ? `${(text + (interimText ? ' ' + interimText : '')).trim().split(/\s+/).filter(Boolean).length} words · ${(text + (interimText ? ' ' + interimText : '')).trim().length} chars`
                        : 'Start speaking or type your answer'}
                    </span>
                    {text.trim().length > 20 && (
                      <span className="answerReadyBadge">✓ Answer ready</span>
                    )}
                  </div>
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

            {/* Sidebar Media Stream with Dual Camera HUD */}
            <aside className="interviewAside">
              <MediaRoom
                sid={sid}
                token={token}
                onInterimTranscript={setInterimText}
                onFinalTranscript={handleFinalTranscript}
                onSecondaryChange={setSecondaryConnected}
                onProctoringAlert={(alert) => {
                  setProctoringAlert(alert);
                  triggerViolationWarning(alert.type, alert.message);
                }}
              />
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                padding: '8px 12px',
                background: secondaryConnected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${secondaryConnected ? '#22c55e' : '#ef4444'}`,
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: secondaryConnected ? '#15803d' : '#b91c1c'
              }}>
                <Smartphone size={15} />
                <span>
                  {secondaryConnected
                    ? '✓ Secondary Camera: Streaming Live'
                    : '⚠ Secondary Camera: Connecting / Reconnecting…'}
                </span>
              </div>
              <div className="interviewProctoringPill" style={{ marginTop: 6 }}>
                <ShieldCheck size={14} />
                <span>Dual-Perspective Proctoring Active</span>
              </div>
            </aside>
          </div>
        ) : (disqualified || s?.state === 'DISQUALIFIED') ? (
          /* Disqualification Screen — Unfair Means Detected */
          <div className="wizardCard standalone completionCard" style={{ borderColor: '#ef4444', borderTop: '4px solid #ef4444' }}>
            <div className="completionIcon" style={{ background: '#fef2f2', color: '#ef4444' }}>
              <AlertCircle size={56} style={{ color: '#ef4444' }} />
            </div>
            <h1 style={{ color: '#b91c1c', marginBottom: 8 }}>Interview Disqualified — Unfair Means Detected</h1>
            <p style={{ color: '#475569', maxWidth: 580, margin: '0 auto 16px' }}>
              This interview has been automatically closed because the permitted integrity limit (<strong>{MAX_WARNINGS} warning strikes</strong>) was exceeded.
            </p>
            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '16px 20px', margin: '16px auto', maxWidth: 580, textAlign: 'left' }}>
              <strong style={{ display: 'block', marginBottom: 10, color: '#9f1239', fontSize: 14 }}>Recorded Violation Incidents:</strong>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#be123c', fontSize: 13, lineHeight: 1.6 }}>
                {warningsList.length > 0 ? (
                  warningsList.map((w, idx) => (
                    <li key={idx}>
                      <strong>Strike {idx + 1} [{w.time}]:</strong> {w.message}
                    </li>
                  ))
                ) : (
                  <li>
                    <strong>Strike 1:</strong> Integrity threshold exceeded ({s?.disqualification_reason || 'Proctoring violations logged'})
                  </li>
                )}
              </ul>
            </div>
            <p className="muted" style={{ fontSize: 13, maxWidth: 540, margin: '0 auto 24px' }}>
              All webcam & secondary camera feeds, timestamps, and integrity logs have been sealed with SHA-256 HMAC cryptographic signatures and submitted to the RTPL recruitment audit team.
            </p>
            <button
              onClick={() => window.location.href = '/candidate/dashboard'}
              className="btnPrimary"
              style={{ margin: '0 auto' }}
            >
              Return to Candidate Dashboard
            </button>
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
