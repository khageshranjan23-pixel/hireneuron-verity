'use client';
/**
 * AIProctorEngine v5 — Z-depth 3D Head Pose + Robust Calibration
 *
 * KEY FIXES over v4:
 * - Uses MediaPipe 3D z-coordinates for yaw/pitch (no false positives from camera angle)
 * - 50-frame auto-calibration with clear UI countdown — ZERO alerts until calibrated
 * - Thresholds doubled — only flags sustained, obvious deviations
 * - Calibrate button always visible and prominent
 * - No violations fire during calibration or for 1.5s after
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface ProctorTelemetry {
  presenceState: string; presenceMessage: string; confirmedOutOfView: boolean;
  faces: number; gaze: 'focused' | 'away' | 'blink' | 'unknown';
  headPose: 'centered' | 'turned'; audio: 'clean' | 'noisy';
  yaw: number; pitch: number; roll: number; gazeX: number; gazeY: number;
  lookAwayState?: string; lookAwayDurationMs?: number; lookAwayViolationCount?: number;
  readingPattern?: boolean; speakingWhileAway?: boolean;
  isSpeaking?: boolean; mouthOpen?: boolean; multipleVoices?: boolean;
}

export interface AIProctorEngineProps {
  mediaStream?: MediaStream | null;
  onViolation?: (type: string, message: string, severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT', snapshotB64?: string) => void;
  onTelemetryUpdate?: (metrics: ProctorTelemetry) => void;
  calibrateTrigger?: number;
}

// ─── Landmark indices (MediaPipe 478-point FaceMesh with iris) ───────────────
const LM = {
  NOSE: 1, FOREHEAD: 10, CHIN: 152,
  L_EAR: 234, R_EAR: 454,
  L_EYE_OUT: 33, L_EYE_IN: 133, L_EYE_TOP: 159, L_EYE_BOT: 145, L_IRIS: 468,
  R_EYE_IN: 362, R_EYE_OUT: 263, R_EYE_TOP: 386, R_EYE_BOT: 374, R_IRIS: 473,
  MOUTH_TOP: 13, MOUTH_BOT: 14, MOUTH_L: 61, MOUTH_R: 291,
};

// ─── Thresholds (generous to avoid false positives) ──────────────────────────
const HEAD_YAW_DEG   = 22;   // degrees — only flag clear turns
const HEAD_PITCH_DEG = 18;   // degrees — only flag clear nods
const GAZE_H         = 0.18; // iris normalized offset
const GAZE_V         = 0.18;
const BLINK_EAR      = 0.18;

// Direction-specific look-away trigger times (ms) — relaxed
const DIR_MS: Record<string, number> = {
  DOWN: 600, DOWN_LEFT: 600, DOWN_RIGHT: 600,
  LEFT: 800, RIGHT: 800,
  UP: 1200, UP_LEFT: 1000, UP_RIGHT: 1000,
  CENTER: 99999,
};
const SEVERE_MS = 4000;
const CALIBRATION_FRAMES = 50; // frames to collect before activating

// ─── Types ────────────────────────────────────────────────────────────────────
interface KP { x: number; y: number; z?: number }

// ─── 3D Head Pose using Z-depth (most reliable in browser) ───────────────────
function getPose(lm: KP[]) {
  const lEar = lm[LM.L_EAR], rEar = lm[LM.R_EAR];
  const fore  = lm[LM.FOREHEAD], chin = lm[LM.CHIN];
  const lEyeO = lm[LM.L_EYE_OUT], rEyeO = lm[LM.R_EYE_OUT];
  const nose  = lm[LM.NOSE];
  if (!lEar || !rEar || !fore || !chin || !nose) return null;

  // ── Yaw: left-right rotation ──────────────────────────────────────────────
  // Primary: ear Z-depth difference (most stable signal)
  // When head turns right → left ear Z increases (further), right ear Z decreases (closer)
  const earZ_L = lEar.z ?? 0, earZ_R = rEar.z ?? 0;
  const interEarPx = Math.hypot(rEar.x - lEar.x, rEar.y - lEar.y) || 1;
  // Scale z by inter-ear pixel distance to normalize for distance from camera
  const yawFromZ = ((earZ_R - earZ_L) / interEarPx) * 140;

  // Secondary: nose X offset from eye midpoint (2D geometry)
  const eyeMidX = lEyeO && rEyeO ? (lEyeO.x + rEyeO.x) / 2 : (lEar.x + rEar.x) / 2;
  const noseOffX = (nose.x - eyeMidX) / (interEarPx || 1);
  const yawFrom2D = noseOffX * 80; // weaker signal

  // Blend: Z-depth is primary (70%), 2D geometry backup (30%)
  const yaw = yawFromZ * 0.7 + yawFrom2D * 0.3;

  // ── Pitch: up-down rotation ───────────────────────────────────────────────
  // Primary: forehead vs chin Z-depth difference
  // When looking down → forehead comes forward (z decreases), chin goes back
  const foreZ = fore.z ?? 0, chinZ = chin.z ?? 0;
  const faceHeightPx = Math.hypot(chin.x - fore.x, chin.y - fore.y) || 1;
  const pitchFromZ = ((foreZ - chinZ) / faceHeightPx) * 140;

  // Secondary: nose vertical position on face axis
  const noseAlongFace = ((nose.x - fore.x) * (chin.x - fore.x) + (nose.y - fore.y) * (chin.y - fore.y)) / (faceHeightPx * faceHeightPx);
  const pitchFrom2D = (noseAlongFace - 0.48) * 55;

  const pitch = pitchFromZ * 0.7 + pitchFrom2D * 0.3;

  // ── Roll ─────────────────────────────────────────────────────────────────
  const roll = lEyeO && rEyeO
    ? Math.atan2(rEyeO.y - lEyeO.y, rEyeO.x - lEyeO.x) * (180 / Math.PI)
    : 0;

  return { yaw, pitch, roll };
}

// ─── Direction classifier ─────────────────────────────────────────────────────
function classifyDir(yaw: number, pitch: number): string {
  const ay = Math.abs(yaw), ap = Math.abs(pitch);
  if (ay > HEAD_YAW_DEG && ap > HEAD_PITCH_DEG * 0.6) {
    return (pitch < 0 ? 'DOWN' : 'UP') + (yaw > 0 ? '_RIGHT' : '_LEFT');
  }
  if (ay > HEAD_YAW_DEG) return yaw > 0 ? 'RIGHT' : 'LEFT';
  if (ap > HEAD_PITCH_DEG) return pitch < 0 ? 'DOWN' : 'UP';
  return 'CENTER';
}

// ─── Eye gaze using iris position ────────────────────────────────────────────
function getGaze(lm: KP[], adjYaw: number, adjPitch: number) {
  const lOut = lm[LM.L_EYE_OUT], lIn = lm[LM.L_EYE_IN];
  const lTop = lm[LM.L_EYE_TOP], lBot = lm[LM.L_EYE_BOT], lIris = lm[LM.L_IRIS];
  const rIn  = lm[LM.R_EYE_IN],  rOut = lm[LM.R_EYE_OUT];
  const rTop = lm[LM.R_EYE_TOP], rBot = lm[LM.R_EYE_BOT], rIris = lm[LM.R_IRIS];

  if (!lOut || !lIn || !lTop || !lBot || !lIris || !rIn || !rOut || !rTop || !rBot || !rIris) {
    return { gazeX: 0, gazeY: 0, dir: 'UNKNOWN', blink: false };
  }

  const lW = Math.hypot(lIn.x-lOut.x, lIn.y-lOut.y) || 1;
  const rW = Math.hypot(rOut.x-rIn.x, rOut.y-rIn.y) || 1;
  const lH = Math.hypot(lBot.x-lTop.x, lBot.y-lTop.y) || 1;
  const rH = Math.hypot(rBot.x-rTop.x, rBot.y-rTop.y) || 1;
  const lEAR = lH / lW, rEAR = rH / rW;

  if (lEAR < BLINK_EAR && rEAR < BLINK_EAR) {
    return { gazeX: 0, gazeY: 0, dir: 'BLINK', blink: true };
  }

  const rawX = ((lIris.x - lOut.x) / lW - 0.5 + (rIris.x - rIn.x) / rW - 0.5) / 2;
  const rawY = ((lIris.y - lTop.y) / lH - 0.5 + (rIris.y - rTop.y) / rH - 0.5) / 2;

  // Head-compensate so eye-only glances are measured, not head turns
  const gazeX = rawX - Math.sin((adjYaw   * Math.PI) / 180) * 0.10;
  const gazeY = rawY - Math.sin((adjPitch * Math.PI) / 180) * 0.08;

  let dir = 'CENTER';
  const ax = Math.abs(gazeX), ay2 = Math.abs(gazeY);
  if (ax > GAZE_H && ay2 > GAZE_V) dir = (gazeY > 0 ? 'DOWN' : 'UP') + (gazeX > 0 ? '_RIGHT' : '_LEFT');
  else if (ax > GAZE_H) dir = gazeX > 0 ? 'RIGHT' : 'LEFT';
  else if (ay2 > GAZE_V) dir = gazeY > 0 ? 'DOWN' : 'UP';

  return { gazeX, gazeY, dir, blink: false };
}

// ─── Mouth ────────────────────────────────────────────────────────────────────
function getMouth(lm: KP[]) {
  const t = lm[LM.MOUTH_TOP], b = lm[LM.MOUTH_BOT], l = lm[LM.MOUTH_L], r = lm[LM.MOUTH_R];
  if (!t || !b || !l || !r) return { open: false, speaking: false };
  const w = Math.hypot(r.x-l.x, r.y-l.y) || 1;
  const lip = Math.hypot(b.x-t.x, b.y-t.y) / w;
  return { open: lip > 0.38, speaking: lip > 0.13 };
}

// ─── Reading pattern (horizontal oscillation) ─────────────────────────────────
class ReadingDetector {
  private hist: { t: number; dir: string }[] = [];
  update(t: number, dir: string): boolean {
    if (['LEFT','RIGHT','DOWN_LEFT','DOWN_RIGHT'].includes(dir)) this.hist.push({ t, dir });
    this.hist = this.hist.filter(e => t - e.t < 4000);
    let osc = 0;
    for (let i = 1; i < this.hist.length; i++) {
      const p = this.hist[i-1].dir, c = this.hist[i].dir;
      const L = (d: string) => d === 'LEFT' || d === 'DOWN_LEFT';
      const R = (d: string) => d === 'RIGHT' || d === 'DOWN_RIGHT';
      if ((L(p) && R(c)) || (R(p) && L(c))) osc++;
    }
    return osc >= 4; // raised from 3 to reduce false positives
  }
  reset() { this.hist = []; }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AIProctorEngine({ mediaStream, onViolation, onTelemetryUpdate, calibrateTrigger }: AIProctorEngineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMounted = useRef(true);

  // Calibration
  const calibSamples  = useRef<{ yaw: number; pitch: number; gazeX: number; gazeY: number }[]>([]);
  const calibDone     = useRef(false);
  const calibBaseline = useRef({ yaw: 0, pitch: 0, gazeX: 0, gazeY: 0 });
  const calibDoneAt   = useRef(0); // timestamp when calibration completed
  const manualCalib   = useRef(false);
  const manualSamples = useRef<{ yaw: number; pitch: number; gazeX: number; gazeY: number }[]>([]);

  // Look-away tracking
  const awayStart     = useRef<number | null>(null);
  const activeDir     = useRef('CENTER');
  const violations    = useRef(0);
  const readDet       = useRef(new ReadingDetector());
  const speakAwayAt   = useRef<number | null>(null);

  // Face presence
  const absentStart   = useRef<number | null>(null);
  const multiFaceAt   = useRef<number | null>(null);
  const emptyStreak   = useRef(0);

  // Audio
  const multiVoiceStreak = useRef(0);

  // Electronic Device Detection
  const detectedDevicesRef = useRef<{ bbox: [number, number, number, number]; class: string; score: number }[]>([]);

  // Cooldowns
  const lastFired = useRef<Map<string, number>>(new Map());

  // UI state
  const [status,       setStatus]       = useState<'loading' | 'running' | 'error'>('loading');
  const [calibFrames,  setCalibFrames]  = useState(0); // 0..CALIBRATION_FRAMES
  const [warn,         setWarn]         = useState('');
  const [warnSev,      setWarnSev]      = useState('');
  const warnExpiry = useRef(0);

  const onVioRef = useRef(onViolation); onVioRef.current = onViolation;
  const onTelRef = useRef(onTelemetryUpdate); onTelRef.current = onTelemetryUpdate;

  // ── helpers ────────────────────────────────────────────────────────────────
  const snap = useCallback(() => {
    try {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      const v = document.querySelector('video[data-proctor]') as HTMLVideoElement | null;
      if (!v || v.readyState < 2) return '';
      c.getContext('2d')?.drawImage(v, 0, 0, 320, 240);
      return c.toDataURL('image/jpeg', 0.78).split(',')[1] || '';
    } catch { return ''; }
  }, []);

  const fire = useCallback((type: string, msg: string, sev: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT', coolMs = 5000) => {
    // NEVER fire before calibration + 1.5s grace
    if (!calibDone.current || performance.now() - calibDoneAt.current < 1500) return;
    const now = Date.now();
    if (now - (lastFired.current.get(type) || 0) < coolMs) return;
    lastFired.current.set(type, now);
    onVioRef.current?.(type, msg, sev, snap());
  }, [snap]);

  const showWarn = useCallback((msg: string, sev: string, ms = 3000) => {
    if (!calibDone.current) return; // no warnings during calibration
    setWarn(msg); setWarnSev(sev);
    warnExpiry.current = Date.now() + ms;
  }, []);

  const triggerRecalibrate = useCallback(() => {
    manualSamples.current = [];
    manualCalib.current = true;
    calibDone.current = false;
    setCalibFrames(0);
    setWarn(''); setWarnSev('');
    warnExpiry.current = 0;
    lastFired.current.clear();
  }, []);

  useEffect(() => {
    if (calibrateTrigger && calibrateTrigger > 0) triggerRecalibrate();
  }, [calibrateTrigger, triggerRecalibrate]);

  // ── Main engine ────────────────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;
    if (!mediaStream || mediaStream.getVideoTracks().length === 0) return;

    let dead = false;
    let audioCtx: AudioContext | null = null;
    let audioInterval: ReturnType<typeof setInterval> | null = null;
    let objectInterval: ReturnType<typeof setInterval> | null = null;
    let rafHandle = 0;

    // Hidden video for inference
    const video = document.createElement('video');
    video.setAttribute('data-proctor', '1');
    video.muted = true; video.playsInline = true; video.autoplay = true;
    video.style.cssText = 'position:fixed;width:1px;height:1px;top:0;left:0;opacity:0;pointer-events:none';
    video.srcObject = mediaStream;
    document.body.appendChild(video);
    void video.play().catch(() => {});

    // Audio monitor
    try {
      const aTr = mediaStream.getAudioTracks();
      if (aTr.length > 0) {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        audioCtx = new Ctx();
        if (audioCtx!.state === 'suspended') void audioCtx!.resume();
        const anlz = audioCtx!.createAnalyser(); anlz.fftSize = 2048;
        audioCtx!.createMediaStreamSource(new MediaStream([aTr[0]])).connect(anlz);
        const buf = new Uint8Array(anlz.frequencyBinCount);
        const fbuf = new Uint8Array(anlz.frequencyBinCount);
        let hStr = 0;

        audioInterval = setInterval(() => {
          if (dead) return;
          anlz.getByteFrequencyData(buf);
          const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
          if (avg > 80) { if (++hStr >= 4) fire('BACKGROUND_NOISE', 'High ambient audio', 'OBSERVED_EVENT'); }
          else hStr = 0;
          anlz.getByteFrequencyData(fbuf);
          let pk = 0, lp = -40;
          for (let i = 5; i < fbuf.length - 5; i++) {
            if (fbuf[i] > 45 && fbuf[i] > fbuf[i-1] && fbuf[i] > fbuf[i+1] && i - lp >= 40) { pk++; lp = i; }
          }
          if (pk > 2) { if (++multiVoiceStreak.current >= 3) fire('MULTIPLE_VOICES', 'Multiple voices — coaching?', 'NEEDS_REVIEW'); }
          else multiVoiceStreak.current = 0;
        }, 500);
      }
    } catch (_) {}

    // ── Electronic Device Detection (Phone / Laptop / Secondary Screen) ──
    (async () => {
      try {
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        await import('@tensorflow/tfjs');
        if (dead) return;
        const cocoModel = await cocoSsd.load({ base: 'mobilenet_v1' });
        
        objectInterval = setInterval(async () => {
          if (dead || !cocoModel || video.readyState < 2 || !calibDone.current) return;
          try {
            const predictions = await cocoModel.detect(video);
            const suspicious = predictions.filter((p: any) =>
              ['cell phone', 'laptop', 'tv', 'book', 'tablet'].includes(p.class.toLowerCase()) && p.score > 0.45
            );
            if (suspicious.length > 0) {
              detectedDevicesRef.current = suspicious;
              showWarn(`🚨 PROHIBITED DEVICE DETECTED (${suspicious[0].class.toUpperCase()})`, 'danger', 3500);
              fire(
                'ELECTRONIC_DEVICE_DETECTED',
                `Electronic device detected in camera frame: ${suspicious[0].class} (${Math.round(suspicious[0].score * 100)}% confidence)`,
                'NEEDS_REVIEW_HIGH',
                6000
              );
            } else {
              detectedDevicesRef.current = [];
            }
          } catch (_) {}
        }, 1200);
      } catch (err) {
        console.warn('[Proctor] Electronic device detector background notice:', err);
      }
    })();

    // Load MediaPipe via script tag (bypasses webpack entirely)
    const loadScript = () => new Promise<void>((resolve, reject) => {
      if ((window as any).FaceMesh) { resolve(); return; }
      const el = document.querySelector<HTMLScriptElement>('script[data-mp-fm]');
      if (el) { el.addEventListener('load', () => resolve()); el.addEventListener('error', reject); return; }
      const s = document.createElement('script');
      s.src = '/mediapipe/face_mesh/face_mesh.js';
      s.setAttribute('data-mp-fm', '1');
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('MediaPipe face_mesh.js failed to load from /mediapipe/face_mesh/'));
      document.head.appendChild(s);
    });

    (async () => {
      try {
        await loadScript();
        if (dead) return;

        const FM = (window as any).FaceMesh;
        const faceMesh = new FM({ locateFile: (f: string) => `/mediapipe/face_mesh/${f}` });
        faceMesh.setOptions({ maxNumFaces: 3, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

        setStatus('running');
        let lastSend = 0;
        let lastTel = 0;

        faceMesh.onResults((res: any) => {
          if (dead || !isMounted.current) return;
          const now = performance.now();
          const lms = res.multiFaceLandmarks as KP[][] | undefined;
          const nFaces = lms?.length ?? 0;

          // ── FACE ABSENT ────────────────────────────────────────────────
          if (nFaces === 0) {
            emptyStreak.current++;
            if (absentStart.current === null) absentStart.current = now;
            const absentMs = now - absentStart.current;
            if (absentMs > 1500) showWarn('⚠️ Face not visible — please stay in frame', 'warn', 3000);
            if (absentMs > 2500) fire('FACE_ABSENT', `Out of camera (${(absentMs/1000).toFixed(1)}s)`, 'NEEDS_REVIEW');
            onTelRef.current?.({ presenceState: 'FACE_NOT_VISIBLE', presenceMessage: 'Face not in frame', confirmedOutOfView: absentMs > 2500, faces: 0, gaze: 'unknown', headPose: 'centered', audio: 'clean', yaw: 0, pitch: 0, roll: 0, gazeX: 0, gazeY: 0 });
            return;
          }

          if (absentStart.current !== null) { absentStart.current = null; emptyStreak.current = 0; }

          // ── MULTIPLE FACES ─────────────────────────────────────────────
          if (nFaces > 1) {
            if (multiFaceAt.current === null) multiFaceAt.current = now;
            if (now - multiFaceAt.current > 1800) {
              showWarn(`🚨 ${nFaces} people detected in camera!`, 'danger', 3000);
              fire('MULTIPLE_PERSONS', `${nFaces} faces detected`, 'NEEDS_REVIEW_HIGH', 6000);
            }
          } else { multiFaceAt.current = null; }

          const lm = lms![0];
          const pose = getPose(lm);
          if (!pose) return;

          // ── CALIBRATION ─────────────────────────────────────────────────
          if (!calibDone.current) {
            const samples = manualCalib.current ? manualSamples.current : calibSamples.current;
            const gaze = getGaze(lm, pose.yaw, pose.pitch);
            samples.push({ yaw: pose.yaw, pitch: pose.pitch, gazeX: gaze.gazeX, gazeY: gaze.gazeY });
            const progress = Math.min(samples.length, CALIBRATION_FRAMES);
            setCalibFrames(progress);

            if (samples.length >= CALIBRATION_FRAMES) {
              const n = samples.length;
              const avg = samples.reduce((a, c) => ({ yaw: a.yaw+c.yaw, pitch: a.pitch+c.pitch, gazeX: a.gazeX+c.gazeX, gazeY: a.gazeY+c.gazeY }), { yaw: 0, pitch: 0, gazeX: 0, gazeY: 0 });
              calibBaseline.current = { yaw: avg.yaw/n, pitch: avg.pitch/n, gazeX: avg.gazeX/n, gazeY: avg.gazeY/n };
              calibDone.current = true;
              calibDoneAt.current = performance.now();
              manualCalib.current = false;
              calibSamples.current = samples; // preserve for reference
              setCalibFrames(CALIBRATION_FRAMES);
            }
            // Draw calibration UI on canvas
            const canvas = canvasRef.current;
            if (canvas && res.image) {
              canvas.width = res.image.width || 640; canvas.height = res.image.height || 480;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                // Pulsing center circle
                ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(canvas.width/2, canvas.height/2, 40, 0, Math.PI*2); ctx.stroke();
                ctx.fillStyle = 'rgba(56,189,248,0.12)';
                ctx.fill();
                // Crosshair
                ctx.strokeStyle = 'rgba(56,189,248,0.5)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(canvas.width/2-60, canvas.height/2); ctx.lineTo(canvas.width/2+60, canvas.height/2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(canvas.width/2, canvas.height/2-60); ctx.lineTo(canvas.width/2, canvas.height/2+60); ctx.stroke();
              }
            }
            return; // don't evaluate during calibration
          }

          // ── EVALUATE — apply calibration baseline ──────────────────────
          const adjYaw   = pose.yaw   - calibBaseline.current.yaw;
          const adjPitch = pose.pitch - calibBaseline.current.pitch;

          const gaze  = getGaze(lm, adjYaw, adjPitch);
          const adjGazeX = gaze.gazeX - calibBaseline.current.gazeX;
          const adjGazeY = gaze.gazeY - calibBaseline.current.gazeY;
          const mouth = getMouth(lm);

          // Final direction: head pose primary, eye-only gaze secondary
          let headDir = classifyDir(adjYaw, adjPitch);
          let gazeDir = headDir !== 'CENTER' ? headDir : (gaze.dir !== 'UNKNOWN' && gaze.dir !== 'BLINK' ? gaze.dir : 'CENTER');
          // Recalculate gaze dir with calibrated offsets
          {
            const ax = Math.abs(adjGazeX), ay2 = Math.abs(adjGazeY);
            if (headDir === 'CENTER') {
              if (ax > GAZE_H && ay2 > GAZE_V) gazeDir = (adjGazeY > 0 ? 'DOWN' : 'UP') + (adjGazeX > 0 ? '_RIGHT' : '_LEFT');
              else if (ax > GAZE_H) gazeDir = adjGazeX > 0 ? 'RIGHT' : 'LEFT';
              else if (ay2 > GAZE_V) gazeDir = adjGazeY > 0 ? 'DOWN' : 'UP';
              else gazeDir = 'CENTER';
            }
          }
          const finalDir = gazeDir;
          const isAway = finalDir !== 'CENTER' && finalDir !== 'BLINK';

          // ── Look-away state machine ────────────────────────────────────
          const reading = readDet.current.update(now, finalDir);

          if (isAway) {
            if (awayStart.current === null) { awayStart.current = now; activeDir.current = finalDir; }
            const elapsed = now - awayStart.current;
            const thresh = DIR_MS[finalDir] ?? 800;

            if (elapsed >= thresh) {
              const dirLabel = finalDir.toLowerCase().replace('_', '-');
              if (elapsed >= SEVERE_MS) {
                showWarn(`⚠️ Prolonged: looking ${dirLabel} (${(elapsed/1000).toFixed(1)}s)`, 'danger', 2000);
                fire('LOOK_AWAY_SEVERE', `Severe: looked ${finalDir} for ${(elapsed/1000).toFixed(1)}s`, 'NEEDS_REVIEW', 6000);
              } else {
                showWarn(`👀 Please look at the screen (${dirLabel})`, 'warn', 2000);
                if (elapsed >= 3500) fire('LOOK_AWAY_PROLONGED', `Looked ${finalDir} for ${(elapsed/1000).toFixed(1)}s`, 'OBSERVED_EVENT', 5000);
              }
            }

            if (mouth.speaking) {
              if (speakAwayAt.current === null) speakAwayAt.current = Date.now();
              if (Date.now() - speakAwayAt.current > 3000) {
                showWarn('🗣️ Speaking while looking away', 'warn', 2500);
                fire('SPEAKING_WHILE_AWAY', `Speaking while looking ${finalDir}`, 'NEEDS_REVIEW', 8000);
              }
            }

            if (mouth.open && (finalDir === 'DOWN' || finalDir.startsWith('DOWN'))) {
              fire('PHONE_CALL_SUSPECTED', 'Mouth open + looking down', 'OBSERVED_EVENT', 12000);
            }
          } else {
            // Returned to CENTER
            if (awayStart.current !== null) {
              const el = now - awayStart.current;
              if (el > 400) violations.current++;
              setTimeout(() => { if (!isAway) { setWarn(''); setWarnSev(''); warnExpiry.current = 0; } }, 600);
            }
            awayStart.current = null;
            activeDir.current = 'CENTER';
            speakAwayAt.current = null;
          }

          if (reading) {
            showWarn('📖 Reading pattern — scanning notes?', 'warn', 3000);
            fire('READING_PATTERN', 'Horizontal eye oscillation', 'NEEDS_REVIEW', 8000);
          }

          // ── Canvas overlay ─────────────────────────────────────────────
          const canvas = canvasRef.current;
          if (canvas && res.image) {
            canvas.width  = res.image.width  || video.videoWidth  || 640;
            canvas.height = res.image.height || video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              const W = canvas.width, H = canvas.height;

              // Landmark dots
              ctx.fillStyle = 'rgba(56,189,248,0.7)';
              for (let i = 0; i < lm.length; i += 6) {
                ctx.beginPath(); ctx.arc(lm[i].x*W, lm[i].y*H, 1.1, 0, Math.PI*2); ctx.fill();
              }

              // Iris centers
              ctx.fillStyle = '#f43f5e';
              const li = lm[LM.L_IRIS], ri = lm[LM.R_IRIS];
              if (li) { ctx.beginPath(); ctx.arc(li.x*W, li.y*H, 4, 0, Math.PI*2); ctx.fill(); }
              if (ri) { ctx.beginPath(); ctx.arc(ri.x*W, ri.y*H, 4, 0, Math.PI*2); ctx.fill(); }

              // Nose direction arrow
              const nose = lm[LM.NOSE];
              if (nose) {
                const nx = nose.x*W, ny = nose.y*H;
                const col = isAway ? '#f97316' : '#22c55e';
                ctx.strokeStyle = col; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.moveTo(nx, ny);
                const ex = nx + Math.sin((adjYaw  * Math.PI)/180) * 40;
                const ey = ny - Math.sin((adjPitch * Math.PI)/180) * 40;
                ctx.lineTo(ex, ey); ctx.stroke();
                ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI*2); ctx.fill();
              }

              // Status label
              const col2 = isAway ? '#f97316' : '#22c55e';
              ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(3, 3, 230, 20);
              ctx.fillStyle = col2; ctx.font = 'bold 12px monospace';
              ctx.fillText(`${finalDir}  H:${adjYaw.toFixed(0)}° V:${adjPitch.toFixed(0)}°  g:${gaze.dir}`, 7, 18);

              // Draw detected electronic devices bounding boxes
              if (detectedDevicesRef.current && detectedDevicesRef.current.length > 0) {
                for (const item of detectedDevicesRef.current) {
                  const [bx, by, bw, bh] = item.bbox;
                  const scaleX = W / (video.videoWidth || W || 640);
                  const scaleY = H / (video.videoHeight || H || 480);
                  const rx = bx * scaleX, ry = by * scaleY, rw = bw * scaleX, rh = bh * scaleY;

                  ctx.strokeStyle = '#ef4444';
                  ctx.lineWidth = 3;
                  ctx.strokeRect(rx, ry, rw, rh);

                  ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
                  ctx.fillRect(rx, ry, rw, rh);

                  ctx.fillStyle = '#ef4444';
                  ctx.font = 'bold 13px monospace';
                  ctx.fillText(`🚨 ${item.class.toUpperCase()} ${Math.round(item.score * 100)}%`, rx + 4, Math.max(16, ry - 6));
                }
              }
            }
          }

          // ── Telemetry ──────────────────────────────────────────────────
          if (now - lastTel > 130) {
            lastTel = now;
            onTelRef.current?.({
              presenceState: 'FACE_PRESENT', presenceMessage: 'Monitoring active',
              confirmedOutOfView: false, faces: nFaces,
              gaze: gaze.blink ? 'blink' : (isAway ? 'away' : 'focused'),
              headPose: headDir !== 'CENTER' ? 'turned' : 'centered',
              audio: 'clean',
              yaw: adjYaw, pitch: adjPitch, roll: pose.roll,
              gazeX: adjGazeX, gazeY: adjGazeY,
              lookAwayState: isAway ? (awayStart.current && now - awayStart.current > SEVERE_MS ? 'LOOK_AWAY_SEVERE' : 'LOOK_AWAY_CONFIRMED') : 'LOOKING_FORWARD',
              lookAwayDurationMs: awayStart.current ? now - awayStart.current : 0,
              lookAwayViolationCount: violations.current,
              readingPattern: reading, speakingWhileAway: mouth.speaking && isAway,
              isSpeaking: mouth.speaking, mouthOpen: mouth.open,
              multipleVoices: multiVoiceStreak.current >= 3,
            });
          }

          // Expire warning
          if (warnExpiry.current > 0 && Date.now() > warnExpiry.current) {
            setWarn(''); setWarnSev(''); warnExpiry.current = 0;
          }
        });

        // Frame sender loop
        const sendFrame = async () => {
          if (dead) return;
          const now = performance.now();
          if (video.readyState >= 2 && now - lastSend >= 80) {
            lastSend = now;
            try { await faceMesh.send({ image: video }); } catch (_) {}
          }
          rafHandle = requestAnimationFrame(() => void sendFrame());
        };

        if (video.readyState >= 2) void sendFrame();
        else video.addEventListener('loadeddata', () => void sendFrame(), { once: true });

      } catch (err) {
        console.error('[Proctor] Init failed:', err);
        setStatus('error');
      }
    })();

    return () => {
      dead = true; isMounted.current = false;
      cancelAnimationFrame(rafHandle);
      if (audioInterval) clearInterval(audioInterval);
      if (objectInterval) clearInterval(objectInterval);
      if (audioCtx && audioCtx.state !== 'closed') void audioCtx.close();
      if (video.parentNode) video.parentNode.removeChild(video);
    };
  }, [mediaStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ───────────────────────────────────────────────────────────────

  const calibPct = Math.round((calibFrames / CALIBRATION_FRAMES) * 100);
  const isCalibrated = calibFrames >= CALIBRATION_FRAMES;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      {/* Landmark canvas overlay */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      {/* Calibration progress UI */}
      {status === 'running' && !isCalibrated && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10
        }}>
          <div style={{ color: '#38bdf8', fontWeight: 800, fontSize: 14, fontFamily: 'monospace', letterSpacing: 1 }}>
            🎯 CALIBRATING — LOOK STRAIGHT AT SCREEN
          </div>
          <div style={{ width: 180, height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${calibPct}%`, height: '100%', background: '#38bdf8', borderRadius: 4, transition: 'width 0.2s' }} />
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>
            {calibPct}% — do not move ({CALIBRATION_FRAMES - calibFrames} frames left)
          </div>
        </div>
      )}

      {/* Loading */}
      {status === 'loading' && (
        <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.75)', color: '#38bdf8', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, fontFamily: 'monospace' }}>
          ⏳ Loading AI proctoring…
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(239,68,68,0.85)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6 }}>
          ⚠ Proctoring load failed
        </div>
      )}

      {/* Re-calibrate button (always visible once running) */}
      {status === 'running' && isCalibrated && (
        <div style={{ position: 'absolute', top: 6, right: 6, pointerEvents: 'all' }}>
          <button
            onClick={triggerRecalibrate}
            style={{
              background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(56,189,248,0.5)',
              color: '#38bdf8', fontSize: 10, fontWeight: 700, padding: '3px 8px',
              borderRadius: 5, cursor: 'pointer', fontFamily: 'monospace',
            }}
            title="Re-run calibration if you repositioned yourself"
          >
            🎯 Recalibrate
          </button>
        </div>
      )}

      {/* Warning banner */}
      {warn && (
        <div style={{
          position: 'absolute', bottom: 6, left: 6, right: 6,
          background: warnSev === 'danger' ? 'rgba(239,68,68,0.93)' : 'rgba(180,120,0,0.93)',
          color: '#fff', fontSize: 12, fontWeight: 700,
          padding: '7px 12px', borderRadius: 7, textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          {warn}
        </div>
      )}
    </div>
  );
}
