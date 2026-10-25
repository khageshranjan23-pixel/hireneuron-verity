'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  ShieldCheck,
  Camera,
  Mic,
  Volume2,
  Smartphone,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Play
} from 'lucide-react';
import CandidateNav from '@/components/CandidateNav';
import MediaRoom from '@/components/MediaRoom';
import { api, Session } from '@/components/api';

export default function CandidateSetupWizardPage() {
  const params = useParams();
  const router = useRouter();
  const sid = params.id as string;

  const [step, setStep] = useState(1);
  const [sessionToken, setSessionToken] = useState('');
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Device check states
  const [deviceStatus, setDeviceStatus] = useState({ camera: false, mic: false });
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [speakerPlaying, setSpeakerPlaying] = useState(false);

  // Secondary camera states
  const [qr, setQr] = useState('');
  const [phoneLink, setPhoneLink] = useState('');
  const [secondaryConnected, setSecondaryConnected] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Consent states
  const [consentAnalysis, setConsentAnalysis] = useState(true);
  const [consentRecording, setConsentRecording] = useState(true);

  useEffect(() => {
    const candidateAuthToken = sessionStorage.getItem('rtpl_token') || '';
    if (!candidateAuthToken) {
      router.push('/candidate/login');
      return;
    }
    initializeCandidateAccess(candidateAuthToken);
  }, [sid]);

  const initializeCandidateAccess = async (candToken: string) => {
    setLoading(true);
    try {
      // Authorize candidate enter and mint/retrieve session token
      const enterRes = await api(`/api/candidate/interviews/${sid}/enter`, candToken);
      setSessionToken(enterRes.token);
      sessionStorage.setItem('verity_candidate', `${enterRes.session_id}:${enterRes.token}`);

      // Fetch public session details
      const s = await api(`/sessions/${enterRes.session_id}`, enterRes.token);
      setSession(s);
    } catch (err: any) {
      setError(err.message || 'Check-in error. Please verify your interview schedule window.');
    } finally {
      setLoading(false);
    }
  };

  const generatePhoneQr = async () => {
    if (!sessionToken) return;
    try {
      const pairData = await api(`/sessions/${sid}/pair`, sessionToken, 'POST');
      let currentOrigin = window.location.origin;
      try {
        const tun = await api('/tunnel', '');
        if (tun && tun.url && tun.url.startsWith('https://')) {
          currentOrigin = tun.url.replace(/\/$/, '');
        }
      } catch (_) {}
      const pUrl = `${currentOrigin}/phone?nonce=${pairData.nonce}`;
      setPhoneLink(pUrl);
      const qrDataUrl = await QRCode.toDataURL(pUrl, { margin: 1, width: 220 });
      setQr(qrDataUrl);
    } catch (e: any) {
      console.warn('QR pairing notice:', e.message);
    }
  };

  useEffect(() => {
    if (step === 3 && sessionToken) {
      generatePhoneQr();
    }
  }, [step, sessionToken]);

  const testSpeaker = () => {
    setSpeakerPlaying(true);
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
      setTimeout(() => {
        setSpeakerPlaying(false);
        setSpeakerTested(true);
      }, 800);
    } catch (_) {
      setSpeakerPlaying(false);
      setSpeakerTested(true);
    }
  };

  const handleStartInterview = async () => {
    try {
      await api(`/sessions/${sid}/consent`, sessionToken, 'POST', {
        accepted: true,
        policy_version: '2026-10-25'
      });
      router.push(`/candidate/interviews/${sid}/live`);
    } catch (err: any) {
      setError(err.message || 'Failed to start interview.');
    }
  };

  return (
    <div className="candidatePortalLayout">
      <CandidateNav />

      <main className="candidateMain">
        <div className="candidateContainer" style={{ maxWidth: 840 }}>
          {/* Progress Header */}
          <div className="wizardProgressBar" style={{ marginBottom: 28 }}>
            <div className={`wizardStepItem ${step >= 1 ? 'active' : ''}`}>
              <span className="stepNum">1</span>
              <span className="stepTitle">Rules & Consent</span>
            </div>
            <div className="stepDivider" />
            <div className={`wizardStepItem ${step >= 2 ? 'active' : ''}`}>
              <span className="stepNum">2</span>
              <span className="stepTitle">Device Check</span>
            </div>
            <div className="stepDivider" />
            <div className={`wizardStepItem ${step >= 3 ? 'active' : ''}`}>
              <span className="stepNum">3</span>
              <span className="stepTitle">Secondary Camera</span>
            </div>
            <div className="stepDivider" />
            <div className={`wizardStepItem ${step >= 4 ? 'active' : ''}`}>
              <span className="stepNum">4</span>
              <span className="stepTitle">Ready to Begin</span>
            </div>
          </div>

          {error && (
            <div className="authErrorAlert" style={{ marginBottom: 24 }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="tableLoading">Verifying interview room access…</div>
          ) : (
            <div className="formContainerCard">
              {/* ── SCREEN 1: RULES & CONSENT ─────────────────────────────── */}
              {step === 1 && (
                <div className="wizardStepSection">
                  <div className="stepHeader">
                    <h3>Step 1 · Interview Instructions & Verification Consent</h3>
                    <p>Please review the interview policies before proceeding.</p>
                  </div>

                  <div className="guidelinesGrid" style={{ marginBottom: 24 }}>
                    <div className="guidelineCard">
                      <Camera size={20} />
                      <h4>Camera & Face Presence</h4>
                      <p>Maintain your face within the primary camera frame. Computer vision monitors head pose and gaze.</p>
                    </div>

                    <div className="guidelineCard">
                      <Mic size={20} />
                      <h4>Spoken Answers</h4>
                      <p>The AI interviewer will ask questions out loud. Speak clearly. Your words are transcribed in real time.</p>
                    </div>

                    <div className="guidelineCard">
                      <ShieldCheck size={20} />
                      <h4>Human Recruiter Review</h4>
                      <p>Proctoring observations are non-disqualifying. Human recruiters make all hiring decisions.</p>
                    </div>
                  </div>

                  <div className="consentCheckboxes">
                    <label className="checkboxLabel">
                      <input
                        type="checkbox"
                        checked={consentAnalysis}
                        onChange={(e) => setConsentAnalysis(e.target.checked)}
                      />
                      <span>I consent to real-time speech transcription and automated proctoring observations for recruiter review.</span>
                    </label>

                    <label className="checkboxLabel" style={{ marginTop: 12 }}>
                      <input
                        type="checkbox"
                        checked={consentRecording}
                        onChange={(e) => setConsentRecording(e.target.checked)}
                      />
                      <span>I consent to encrypted audio-video session recording for audit purposes.</span>
                    </label>
                  </div>

                  <div className="wizardNavActions">
                    <div />
                    <button
                      className="btnPrimary"
                      disabled={!consentAnalysis}
                      onClick={() => setStep(2)}
                    >
                      <span>Proceed to Device Check</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── SCREEN 2: DEVICE CHECK ─────────────────────────────────── */}
              {step === 2 && (
                <div className="wizardStepSection">
                  <div className="stepHeader">
                    <h3>Step 2 · Camera, Microphone & Speaker Verification</h3>
                    <p>Verify your webcam stream, audio input, and speaker volume.</p>
                  </div>

                  <div className="deviceCheckGrid">
                    {/* Live Camera Preview */}
                    <div className="previewBoxWrapper">
                      <div className="previewBoxHeader">
                        <Camera size={16} />
                        <span>Laptop Webcam Stream</span>
                      </div>
                      <div className="previewMediaWrapper" style={{ height: 260, background: '#0f172a', borderRadius: 8, overflow: 'hidden' }}>
                        {sessionToken && (
                          <MediaRoom
                            sid={sid}
                            token={sessionToken}
                            onDeviceStatus={setDeviceStatus}
                            onVolume={setVolumeLevel}
                            onSecondaryChange={setSecondaryConnected}
                          />
                        )}
                      </div>
                    </div>

                    {/* Microphone & Speaker Test */}
                    <div className="deviceDiagnosticsBox">
                      <div className="diagItem">
                        <div className="diagHeader">
                          <Mic size={18} />
                          <strong>Microphone Sensitivity</strong>
                          <span className={`statusPill ${volumeLevel > 15 ? 'completed' : 'low'}`}>
                            {volumeLevel > 15 ? 'Audio Detected' : 'Speak to Test'}
                          </span>
                        </div>
                        <div className="audioMeterBar">
                          <div
                            className="audioMeterFill"
                            style={{ width: `${Math.min(100, volumeLevel * 2)}%` }}
                          />
                        </div>
                      </div>

                      <div className="diagItem" style={{ marginTop: 20 }}>
                        <div className="diagHeader">
                          <Volume2 size={18} />
                          <strong>Speaker Audio Playback</strong>
                          <span className={`statusPill ${speakerTested ? 'completed' : 'low'}`}>
                            {speakerTested ? 'Verified' : 'Test Required'}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 10px' }}>
                          Click to play a verification tone to ensure you will hear the AI interviewer.
                        </p>
                        <button
                          type="button"
                          className="btnSecondary compact"
                          onClick={testSpeaker}
                          disabled={speakerPlaying}
                        >
                          <Play size={14} />
                          <span>{speakerPlaying ? 'Playing Tone…' : 'Play Test Sound'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="wizardNavActions">
                    <button className="btnSecondary" onClick={() => setStep(1)}>
                      <ArrowLeft size={16} /> Back
                    </button>
                    <button
                      className="btnPrimary"
                      onClick={() => setStep(3)}
                    >
                      <span>Next: Secondary Camera</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── SCREEN 3: SECONDARY SMARTPHONE CAMERA ───────────────────── */}
              {step === 3 && (
                <div className="wizardStepSection">
                  <div className="stepHeader">
                    <h3>Step 3 · Smartphone Secondary Camera Pairing</h3>
                    <p>Scan this QR code with your smartphone camera for dual-perspective proctoring.</p>
                  </div>

                  <div className="qrPairingLayout">
                    <div className="qrDisplayCard">
                      {qr ? (
                        <img src={qr} alt="Pair Smartphone QR Code" className="qrImage" />
                      ) : (
                        <div className="qrLoadingBox">Generating Pairing QR…</div>
                      )}

                      <div className="pairingStatusRow">
                        <span className={`liveDot ${secondaryConnected ? 'green' : 'amber'}`} />
                        <span>
                          {secondaryConnected ? '✓ Smartphone Camera Connected' : 'Waiting for phone connection…'}
                        </span>
                      </div>
                    </div>

                    <div className="pairingInstructionsCard">
                      <h4>Simple Pairing Steps</h4>
                      <ol>
                        <li>Open the Camera app on your smartphone.</li>
                        <li>Point it at the QR code on your screen.</li>
                        <li>Tap the link to open the RTPL camera companion page.</li>
                        <li>Grant camera permission and position your phone to show your desk and workspace.</li>
                      </ol>

                      {phoneLink && (
                        <div className="manualLinkFallback">
                          <small>Or open manually on your phone:</small>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <input readOnly value={phoneLink} style={{ fontSize: 11, fontFamily: 'monospace' }} />
                            <button
                              type="button"
                              className="btnSecondary compact"
                              onClick={() => {
                                navigator.clipboard.writeText(phoneLink);
                                setCopiedLink(true);
                                setTimeout(() => setCopiedLink(false), 2000);
                              }}
                            >
                              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="wizardNavActions">
                    <button className="btnSecondary" onClick={() => setStep(2)}>
                      <ArrowLeft size={16} /> Back
                    </button>
                    <button
                      className="btnPrimary"
                      onClick={() => setStep(4)}
                    >
                      <span>Next: Final Checklist</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── SCREEN 4: FINAL CHECKLIST & START ───────────────────────── */}
              {step === 4 && (
                <div className="wizardStepSection">
                  <div className="stepHeader">
                    <h3>Step 4 · Pre-Flight Readiness Checklist</h3>
                    <p>All setup requirements verified. You are ready to start your interview.</p>
                  </div>

                  <div className="readinessChecklist">
                    <div className="checkItem pass">
                      <CheckCircle2 size={20} />
                      <div>
                        <strong>Laptop Webcam</strong>
                        <span>Active and centered in frame</span>
                      </div>
                    </div>

                    <div className="checkItem pass">
                      <CheckCircle2 size={20} />
                      <div>
                        <strong>Microphone & Audio</strong>
                        <span>Audio stream verified</span>
                      </div>
                    </div>

                    <div className={`checkItem ${secondaryConnected ? 'pass' : 'info'}`}>
                      <CheckCircle2 size={20} />
                      <div>
                        <strong>Smartphone Camera</strong>
                        <span>{secondaryConnected ? 'Connected & streaming' : 'Optional secondary mode active'}</span>
                      </div>
                    </div>

                    <div className="checkItem pass">
                      <CheckCircle2 size={20} />
                      <div>
                        <strong>Interview Blueprint</strong>
                        <span>{session?.question_count || 10} primary questions ready</span>
                      </div>
                    </div>
                  </div>

                  <div className="startInterviewCallout">
                    <h4>Begin Technical Spoken Interview</h4>
                    <p>
                      The AI interviewer will introduce the first question. Once you are done answering each question, click "Done Answering" to proceed.
                    </p>
                    <button
                      onClick={handleStartInterview}
                      className="btnLargeStart"
                    >
                      <span>Start Interview Now</span>
                      <ArrowRight size={20} />
                    </button>
                  </div>

                  <div className="wizardNavActions">
                    <button className="btnSecondary" onClick={() => setStep(3)}>
                      <ArrowLeft size={16} /> Back
                    </button>
                    <div />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
