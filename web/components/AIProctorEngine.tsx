'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarks from '@tensorflow-models/face-landmarks-detection';
import * as faceDetection from '@tensorflow-models/face-detection';
import {
  estimateHeadPose,
  estimateEyeGaze,
  HeadPoseResult,
  EyeGazeResult,
  ProctorCalibration,
  DEFAULT_CALIBRATION,
  Keypoint3D
} from '../lib/proctorGeometry';
import { FacePresenceGate, PresenceState, PresenceDecision } from '../lib/facePresenceGate';
import ProctorDiagnostics, { DiagnosticsMetrics } from './ProctorDiagnostics';

export interface ProctorTelemetry {
  presenceState: PresenceState;
  presenceMessage: string;
  confirmedOutOfView: boolean;
  faces: number;
  gaze: 'focused' | 'away' | 'blink' | 'unknown';
  headPose: 'centered' | 'turned';
  audio: 'clean' | 'noisy';
  yaw: number;
  pitch: number;
  roll: number;
  gazeX: number;
  gazeY: number;
}

export interface AIProctorEngineProps {
  mediaStream?: MediaStream | null;
  onViolation?: (type: string, message: string, severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT', snapshotB64?: string) => void;
  onTelemetryUpdate?: (metrics: ProctorTelemetry) => void;
  calibrateTrigger?: number;
}

/**
 * Lightweight canvas-based torso / upper-body silhouette detector.
 * Samples the central-lower portion of the video frame to distinguish an active person
 * from an empty chair or blank wall background when facial landmark models lose confidence.
 */
function checkTorsoPersonVisible(video: HTMLVideoElement): boolean | null {
  try {
    if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 48;
    sampleCanvas.height = 36;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // Draw the bottom-center 60% of frame where candidate shoulders & torso reside
    ctx.drawImage(video, vw * 0.2, vh * 0.4, vw * 0.6, vh * 0.6, 0, 0, 48, 36);
    const imgData = ctx.getImageData(0, 0, 48, 36).data;

    let sum = 0;
    let sumSq = 0;
    const n = imgData.length / 4;
    for (let i = 0; i < imgData.length; i += 4) {
      const lum = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
      sum += lum;
      sumSq += lum * lum;
    }
    const mean = sum / n;
    const variance = (sumSq / n) - (mean * mean);
    const stdDev = Math.sqrt(Math.max(0, variance));

    // A human torso / clothing generates high contrast and texture (stdDev > 14).
    // An empty uniform wall / empty room has low stdDev (< 10).
    return stdDev > 14;
  } catch {
    return null;
  }
}

export default function AIProctorEngine({
  mediaStream,
  onViolation,
  onTelemetryUpdate,
  calibrateTrigger
}: AIProctorEngineProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Model & Inference Lifecycle Refs
  const detectorRef = useRef<faceLandmarks.FaceLandmarksDetector | null>(null);
  const fallbackDetectorRef = useRef<faceDetection.FaceDetector | null>(null);
  const isInitializingRef = useRef<boolean>(false);
  const isInferenceBusyRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const modelInitCountRef = useRef<number>(0);

  // Presence State Machine Ref
  const presenceGateRef = useRef<FacePresenceGate | null>(null);

  // Stable Callback Refs to prevent model teardown on parent rerenders
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;
  const onTelemetryRef = useRef(onTelemetryUpdate);
  onTelemetryRef.current = onTelemetryUpdate;

  // Performance & Measurement Instrumentation Refs
  const cameraFrameTimesRef = useRef<number[]>([]);
  const inferenceTimesRef = useRef<number[]>([]);
  const latencySamplesRef = useRef<number[]>([]);
  const droppedFramesRef = useRef<number>(0);
  const lastAnalyzedTimeRef = useRef<number>(Date.now());
  const lastViolationDispatchRef = useRef<Map<string, number>>(new Map());
  const lastVideoTimeRef = useRef<number>(0);

  // Sustained Movement Timers (to separate brief thinking glances from prolonged deviations)
  const headTurnStartRef = useRef<number | null>(null);
  const gazeDevStartRef = useRef<number | null>(null);
  const multipleFacesStartRef = useRef<number | null>(null);

  // Calibration state
  const calibrationRef = useRef<ProctorCalibration>({ ...DEFAULT_CALIBRATION });
  const calibrationSamplesRef = useRef<{ yaw: number; pitch: number; roll: number; gazeX: number; gazeY: number }[]>([]);
  const isCalibratingRef = useRef<boolean>(false);
  const autoCalibratedRef = useRef<boolean>(false);
  const autoCalibWarmupRef = useRef<{ yaw: number; pitch: number; roll: number; gazeX: number; gazeY: number }[]>([]);

  // Calm UI Warning & Diagnostics State
  const [warning, setWarning] = useState<string>('');
  const [warningType, setWarningType] = useState<string>('');
  const warningExpiryRef = useRef<number>(0);
  const [overlayEnabled, setOverlayEnabled] = useState<boolean>(false);

  // Diagnostics HUD State
  const [diagMetrics, setDiagMetrics] = useState<DiagnosticsMetrics>({
    cameraFps: 0,
    inferenceFps: 0,
    latencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    droppedFrames: 0,
    modelInitCount: 0,
    lastAnalyzedAgeMs: 0,
    modelReady: false,
    activeFaceCount: 0,
    presenceState: 'INITIALIZING',
    presenceMessage: 'Camera monitoring starting…',
    confirmedOutOfView: false,
    headPose: null,
    eyeGaze: null,
    activeObservation: null,
    missReason: null,
    overlayEnabled: false,
    calibrationActive: false
  });

  // Snapshot Capture Helper
  const captureSnapshot = useCallback((): string => {
    try {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return '';
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(video, 0, 0, 320, 240);
      return canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '';
    } catch {
      return '';
    }
  }, []);

  // Visual Notification Helper (Polite, non-alarming)
  const triggerVisualNotice = useCallback((msg: string, type: string, holdMs = 2500) => {
    setWarning(msg);
    setWarningType(type);
    warningExpiryRef.current = Date.now() + holdMs;
  }, []);

  // Throttled Violation Dispatcher (3.0s debounce per type)
  const dispatchViolation = useCallback((type: string, message: string, severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT') => {
    const now = Date.now();
    const lastTime = lastViolationDispatchRef.current.get(type) || 0;
    if (now - lastTime > 3000) {
      lastViolationDispatchRef.current.set(type, now);
      const snapshot = captureSnapshot();
      onViolationRef.current?.(type, message, severity, snapshot);
    }
  }, [captureSnapshot]);

  // Calibration Trigger
  const triggerCalibration = useCallback(() => {
    calibrationSamplesRef.current = [];
    isCalibratingRef.current = true;
    triggerVisualNotice('🎯 Calibrating neutral straight-ahead pose…', 'CALIBRATING', 2000);
  }, [triggerVisualNotice]);

  const resetCalibration = useCallback(() => {
    calibrationRef.current = { ...DEFAULT_CALIBRATION };
    autoCalibratedRef.current = false;
    autoCalibWarmupRef.current = [];
    triggerVisualNotice('🔄 Posture baseline reset. Looking naturally at screen…', 'CALIBRATING', 2000);
  }, [triggerVisualNotice]);

  // External Calibration Trigger from parent UI
  useEffect(() => {
    if (calibrateTrigger && calibrateTrigger > 0) {
      triggerCalibration();
    }
  }, [calibrateTrigger, triggerCalibration]);

  // SECTION 1: DETECTOR LIFECYCLE (STABLE, INITIALIZES ONCE PER STREAM)
  useEffect(() => {
    isMountedRef.current = true;

    if (!mediaStream || mediaStream.getVideoTracks().length === 0) {
      return;
    }

    let isCancelled = false;
    let videoCallbackHandle: number | null = null;
    let animFrameHandle: number | null = null;
    let audioContext: AudioContext | null = null;
    let audioCheckInterval: NodeJS.Timeout | null = null;

    // Initialize Presence State Machine for this camera stream lifecycle
    presenceGateRef.current = new FacePresenceGate(performance.now(), {
      warmingUpMs: 1600,
      missingConfirmMs: 3000,
      outOfViewConfirmMs: 4000,
      presentGraceMs: 800
    });

    const initDetectorAndLoop = async () => {
      if (detectorRef.current || isInitializingRef.current) return;
      isInitializingRef.current = true;

      try {
        await tf.setBackend('webgl');
        await tf.ready();

        if (isCancelled || !isMountedRef.current) return;

        // 1. Primary Landmark Detector (MediaPipe FaceMesh 468+10)
        const detector = await faceLandmarks.createDetector(
          faceLandmarks.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: 'tfjs',
            refineLandmarks: true,
            maxFaces: 4
          }
        );

        if (isCancelled || !isMountedRef.current) {
          detector.dispose?.();
          return;
        }

        detectorRef.current = detector;
        modelInitCountRef.current += 1;

        // 2. Fallback Face Bounding-Box Detector (BlazeFace/MediaPipe Face Detection)
        try {
          const fallbackDetector = await faceDetection.createDetector(
            faceDetection.SupportedModels.MediaPipeFaceDetector,
            {
              runtime: 'tfjs',
              modelType: 'short'
            }
          );
          if (!isCancelled && isMountedRef.current) {
            fallbackDetectorRef.current = fallbackDetector;
          } else {
            fallbackDetector.dispose?.();
          }
        } catch (fbErr) {
          console.warn('Fallback face detector init optional failure:', fbErr);
        }

        // Attach stream to internal video element
        const video = videoRef.current;
        if (video) {
          video.srcObject = mediaStream;
          try {
            await video.play();
          } catch (_) {}
        }

        // Setup Ambient Audio Activity Monitor
        try {
          const audioTracks = mediaStream.getAudioTracks();
          if (audioTracks.length > 0) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            audioContext = new AudioCtx();
            if (audioContext.state === 'suspended') {
              void audioContext.resume();
            }
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            const source = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
            source.connect(analyser);
            const audioData = new Uint8Array(analyser.frequencyBinCount);

            let highAudioConsecutiveCount = 0;
            audioCheckInterval = setInterval(() => {
              if (isCancelled) return;
              try {
                analyser.getByteFrequencyData(audioData);
                let sum = 0;
                for (let i = 0; i < audioData.length; i++) sum += audioData[i];
                const avgVolume = sum / audioData.length;
                if (avgVolume > 85) {
                  highAudioConsecutiveCount++;
                  if (highAudioConsecutiveCount >= 5) { // 2.5s sustained loud noise
                    dispatchViolation('BACKGROUND_NOISE', 'High ambient audio activity detected', 'OBSERVED_EVENT');
                  }
                } else {
                  highAudioConsecutiveCount = 0;
                }
              } catch (_) {}
            }, 500);
          }
        } catch (_) {}

        // SECTION 2: HIGH-PERFORMANCE INFERENCE LOOP
        let lastTelemetryEmit = 0;

        const processFrame = async () => {
          if (isCancelled || !isMountedRef.current) return;

          const now = performance.now();

          // Camera FPS tracking
          cameraFrameTimesRef.current.push(now);
          if (cameraFrameTimesRef.current.length > 30) cameraFrameTimesRef.current.shift();

          // Check video decoded frame freshness and track liveness
          const videoTrack = mediaStream.getVideoTracks()[0];
          const cameraLive = !!videoTrack && videoTrack.readyState === 'live' && !videoTrack.muted;
          const currentVideoTime = video?.currentTime || 0;
          const freshFrame = currentVideoTime !== lastVideoTimeRef.current && (video?.readyState || 0) >= 2;
          lastVideoTimeRef.current = currentVideoTime;

          // Single-inference lock to drop stale frames
          if (isInferenceBusyRef.current) {
            droppedFramesRef.current += 1;
            scheduleNextFrame();
            return;
          }

          if (!video || video.readyState < 2 || !detectorRef.current) {
            // Update presence gate with camera state even when video isn't ready
            if (presenceGateRef.current) {
              presenceGateRef.current.update({
                tMs: now,
                freshFrame: false,
                cameraLive,
                landmarksFace: null,
                fallbackFace: null,
                personVisible: null,
                isCalibrating: isCalibratingRef.current || !autoCalibratedRef.current
              });
            }
            scheduleNextFrame();
            return;
          }

          isInferenceBusyRef.current = true;
          const inferenceStart = performance.now();

          try {
            // 1. Primary Landmark Estimation
            let faces: faceLandmarks.Face[] = [];
            let landmarksFace: boolean | null = null;
            let fallbackFace: boolean | null = null;
            let personVisible: boolean | null = null;

            try {
              faces = await detectorRef.current.estimateFaces(video, {
                staticImageMode: false,
                flipHorizontal: false
              });
              landmarksFace = faces.length > 0;
            } catch (landmarkErr) {
              console.warn('Landmark detection exception:', landmarkErr);
              landmarksFace = null;
            }

            // 2. Corroborating Fallback Detection when Primary Misses
            if (landmarksFace === false) {
              if (fallbackDetectorRef.current) {
                try {
                  const fbFaces = await fallbackDetectorRef.current.estimateFaces(video, { flipHorizontal: false });
                  fallbackFace = fbFaces.length > 0;
                } catch {
                  fallbackFace = null;
                }
              }
              // Check physical torso presence in video frame
              personVisible = checkTorsoPersonVisible(video);
            } else if (landmarksFace === true) {
              fallbackFace = null;
              personVisible = true;
            }

            // 3. Update Camera Observation State Machine
            const presenceDecision: PresenceDecision = presenceGateRef.current?.update({
              tMs: now,
              freshFrame,
              cameraLive,
              landmarksFace,
              fallbackFace,
              personVisible,
              isCalibrating: isCalibratingRef.current || !autoCalibratedRef.current
            }) || {
              state: 'INITIALIZING',
              changed: false,
              message: 'Initializing…',
              confirmedOutOfView: false,
              faceMissingMs: 0,
              positiveStreak: 0
            };

            const inferenceEnd = performance.now();
            const latency = inferenceEnd - inferenceStart;

            // Track performance metrics
            inferenceTimesRef.current.push(inferenceEnd);
            if (inferenceTimesRef.current.length > 30) inferenceTimesRef.current.shift();
            latencySamplesRef.current.push(latency);
            if (latencySamplesRef.current.length > 30) latencySamplesRef.current.shift();
            lastAnalyzedTimeRef.current = Date.now();

            let activeObservation: string | null = null;
            let missReason: string | null = null;
            let headPoseResult: HeadPoseResult | null = null;
            let eyeGazeResult: EyeGazeResult | null = null;

            // 4. Handle State Machine Decisions Calmly
            if (presenceDecision.state === 'CAMERA_CONNECTION_LOST') {
              activeObservation = 'Camera stream interrupted';
              missReason = 'Video track muted or frame decoding stalled';
              triggerVisualNotice('⚠️ Camera connection interrupted', 'CAMERA_LOST', 3000);
              dispatchViolation('FRAME_COVERAGE_GAP', 'Camera connection temporarily interrupted', 'OBSERVED_EVENT');
            } else if (presenceDecision.state === 'PERSON_OUT_OF_VIEW_CONFIRMED') {
              activeObservation = 'Person out of view confirmed';
              missReason = `Candidate and torso absent for ${(presenceDecision.faceMissingMs / 1000).toFixed(1)}s`;
              triggerVisualNotice('Please return to camera view', 'OUT_OF_VIEW', 3500);
              dispatchViolation('FACE_ABSENT', 'Candidate departed camera view (confirmed absence)', 'NEEDS_REVIEW');
            } else if (presenceDecision.state === 'FACE_NOT_VISIBLE') {
              activeObservation = 'Face not clearly visible';
              missReason = `Face missing for ${(presenceDecision.faceMissingMs / 1000).toFixed(1)}s while body is present`;
              triggerVisualNotice('Please adjust your position so your face is visible', 'FACE_NOT_VISIBLE', 3000);
              // Body is visibly present; do NOT dispatch FACE_ABSENT misconduct!
            } else if (presenceDecision.state === 'TRACKING_UNCERTAIN') {
              activeObservation = 'Checking camera view';
              missReason = 'Brief tracking loss or detector uncertainty';
              // Do not alarm the candidate during brief tracking uncertainty
              if (Date.now() > warningExpiryRef.current) {
                setWarning('');
                setWarningType('');
              }
            } else if (presenceDecision.state === 'INITIALIZING') {
              activeObservation = 'Initializing posture baseline…';
              missReason = 'Warming up detectors';
            } else if (presenceDecision.state === 'CALIBRATING') {
              activeObservation = 'Calibrating posture baseline…';
              missReason = 'Candidate baseline calibration active';
            } else if (presenceDecision.state === 'FACE_PRESENT') {
              // Clear absence warnings immediately upon face presence
              if (warningType === 'OUT_OF_VIEW' || warningType === 'FACE_NOT_VISIBLE' || warningType === 'CAMERA_LOST') {
                setWarning('');
                setWarningType('');
              }

              // Evaluate Multiple Faces with sustained temporal check
              if (faces.length > 1) {
                if (multipleFacesStartRef.current === null) multipleFacesStartRef.current = now;
                const multiDuration = now - multipleFacesStartRef.current;
                if (multiDuration > 2000) { // Sustained > 2.0s
                  activeObservation = `Multiple Participants Observed (${faces.length})`;
                  triggerVisualNotice('Multiple participants observed in camera view', 'MULTIPLE_PERSONS', 3000);
                  dispatchViolation('MULTIPLE_PERSONS', `Multiple participants observed (${faces.length} faces)`, 'NEEDS_REVIEW');
                }
              } else {
                multipleFacesStartRef.current = null;
              }

              // Evaluate Single Face Geometry
              if (faces.length === 1) {
                const keypoints = faces[0].keypoints as Keypoint3D[];

                // Initial Baseline Calibration Warmup (First 12 valid frames)
                if (!autoCalibratedRef.current) {
                  const rawPose = estimateHeadPose(keypoints, DEFAULT_CALIBRATION);
                  const rawGaze = estimateEyeGaze(keypoints, rawPose, DEFAULT_CALIBRATION);
                  autoCalibWarmupRef.current.push({
                    yaw: rawPose.yaw,
                    pitch: rawPose.pitch,
                    roll: rawPose.roll,
                    gazeX: rawGaze.gazeX,
                    gazeY: rawGaze.gazeY,
                  });

                  if (autoCalibWarmupRef.current.length >= 12) {
                    const s = autoCalibWarmupRef.current;
                    const n = s.length;
                    const avg = s.reduce((acc, curr) => ({
                      yaw: acc.yaw + curr.yaw,
                      pitch: acc.pitch + curr.pitch,
                      roll: acc.roll + curr.roll,
                      gazeX: acc.gazeX + curr.gazeX,
                      gazeY: acc.gazeY + curr.gazeY
                    }), { yaw: 0, pitch: 0, roll: 0, gazeX: 0, gazeY: 0 });

                    calibrationRef.current = {
                      baselineYaw: avg.yaw / n,
                      baselinePitch: avg.pitch / n,
                      baselineRoll: avg.roll / n,
                      baselineGazeX: avg.gazeX / n,
                      baselineGazeY: avg.gazeY / n
                    };
                    autoCalibratedRef.current = true;
                  }
                  activeObservation = 'Calibrating posture baseline…';
                  missReason = 'Auto-calibrating neutral posture';
                } else if (isCalibratingRef.current) {
                  // Manual Calibration Sampling
                  const rawPose = estimateHeadPose(keypoints, DEFAULT_CALIBRATION);
                  const rawGaze = estimateEyeGaze(keypoints, rawPose, DEFAULT_CALIBRATION);
                  calibrationSamplesRef.current.push({
                    yaw: rawPose.yaw,
                    pitch: rawPose.pitch,
                    roll: rawPose.roll,
                    gazeX: rawGaze.gazeX,
                    gazeY: rawGaze.gazeY
                  });
                  if (calibrationSamplesRef.current.length >= 15) {
                    const s = calibrationSamplesRef.current;
                    const n = s.length;
                    const avg = s.reduce((acc, curr) => ({
                      yaw: acc.yaw + curr.yaw,
                      pitch: acc.pitch + curr.pitch,
                      roll: acc.roll + curr.roll,
                      gazeX: acc.gazeX + curr.gazeX,
                      gazeY: acc.gazeY + curr.gazeY
                    }), { yaw: 0, pitch: 0, roll: 0, gazeX: 0, gazeY: 0 });

                    calibrationRef.current = {
                      baselineYaw: avg.yaw / n,
                      baselinePitch: avg.pitch / n,
                      baselineRoll: avg.roll / n,
                      baselineGazeX: avg.gazeX / n,
                      baselineGazeY: avg.gazeY / n
                    };
                    isCalibratingRef.current = false;
                    triggerVisualNotice('✓ Posture baseline calibrated', 'CALIBRATING', 2000);
                  }
                } else {
                  // Standard Frame Geometry Evaluation
                  headPoseResult = estimateHeadPose(keypoints, calibrationRef.current);
                  eyeGazeResult = estimateEyeGaze(keypoints, headPoseResult, calibrationRef.current);

                  // A. Head Pose Deviations: Requires sustained > 4.5s continuously
                  if (headPoseResult.direction !== 'CENTER') {
                    if (headTurnStartRef.current === null) headTurnStartRef.current = now;
                    const turnDuration = now - headTurnStartRef.current;
                    activeObservation = `Head turned ${headPoseResult.direction.toLowerCase()} (${Math.abs(headPoseResult.yaw)}°) for ${(turnDuration / 1000).toFixed(1)}s`;

                    if (turnDuration > 4500) {
                      triggerVisualNotice('Please look towards the interview screen', 'HEAD_TURN', 3000);
                      dispatchViolation('HEAD_TURN_PROLONGED', `Sustained head turn: ${headPoseResult.yaw}° (${(turnDuration / 1000).toFixed(1)}s)`, 'OBSERVED_EVENT');
                    }
                  } else {
                    headTurnStartRef.current = null;
                  }

                  // B. Eye Gaze Deviations: Requires sustained > 5.0s continuously (reading/thinking glances are allowed)
                  if (headPoseResult.direction === 'CENTER' && !eyeGazeResult.isBlinking && eyeGazeResult.direction !== 'CENTER') {
                    if (gazeDevStartRef.current === null) gazeDevStartRef.current = now;
                    const gazeDuration = now - gazeDevStartRef.current;
                    activeObservation = `Eyes looking ${eyeGazeResult.direction.toLowerCase()} for ${(gazeDuration / 1000).toFixed(1)}s`;

                    if (gazeDuration > 5000) {
                      triggerVisualNotice('Please look towards the interview screen', 'GAZE_DEVIATION', 3000);
                      dispatchViolation('GAZE_DEVIATION', `Sustained gaze offset (${(gazeDuration / 1000).toFixed(1)}s)`, 'OBSERVED_EVENT');
                    }
                  } else {
                    gazeDevStartRef.current = null;
                  }

                  // C. Candidate Centered & Attentive
                  if (headPoseResult.direction === 'CENTER' && (eyeGazeResult.direction === 'CENTER' || eyeGazeResult.isBlinking)) {
                    missReason = 'Posture centered and within natural reading deadband';
                    // Clear warning immediately upon returning to center
                    if (warningType === 'HEAD_TURN' || warningType === 'GAZE_DEVIATION') {
                      setWarning('');
                      setWarningType('');
                      warningExpiryRef.current = 0;
                    }
                  }
                }
              }

              // Optional Canvas Overlay Rendering
              if (overlayEnabled && canvasRef.current && video && faces.length > 0) {
                const canvas = canvasRef.current;
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  const keypoints = faces[0].keypoints as Keypoint3D[];
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.fillStyle = '#38bdf8';
                  for (let i = 0; i < keypoints.length; i += 10) {
                    ctx.beginPath();
                    ctx.arc(keypoints[i].x, keypoints[i].y, 1.5, 0, 2 * Math.PI);
                    ctx.fill();
                  }
                  ctx.fillStyle = '#f43f5e';
                  if (keypoints[468]) {
                    ctx.beginPath();
                    ctx.arc(keypoints[468].x, keypoints[468].y, 3, 0, 2 * Math.PI);
                    ctx.fill();
                  }
                  if (keypoints[473]) {
                    ctx.beginPath();
                    ctx.arc(keypoints[473].x, keypoints[473].y, 3, 0, 2 * Math.PI);
                    ctx.fill();
                  }
                }
              }
            }

            // SECTION 3: BOUNDED TELEMETRY & DIAGNOSTICS EMIT (5 Hz)
            if (now - lastTelemetryEmit > 200) {
              lastTelemetryEmit = now;

              // Camera FPS
              const cTimes = cameraFrameTimesRef.current;
              const camFps = cTimes.length > 1
                ? (cTimes.length - 1) / ((cTimes[cTimes.length - 1] - cTimes[0]) / 1000)
                : 0;

              // Inference FPS
              const iTimes = inferenceTimesRef.current;
              const infFps = iTimes.length > 1
                ? (iTimes.length - 1) / ((iTimes[iTimes.length - 1] - iTimes[0]) / 1000)
                : 0;

              // P50 & P95 Latencies
              const sorted = [...latencySamplesRef.current].sort((a, b) => a - b);
              const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
              const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;

              // Emit robust telemetry to parent
              onTelemetryRef.current?.({
                presenceState: presenceDecision.state,
                presenceMessage: presenceDecision.message,
                confirmedOutOfView: presenceDecision.confirmedOutOfView,
                faces: faces.length,
                gaze: eyeGazeResult ? (eyeGazeResult.isBlinking ? 'blink' : eyeGazeResult.direction === 'CENTER' ? 'focused' : 'away') : 'unknown',
                headPose: headPoseResult ? (headPoseResult.direction === 'CENTER' ? 'centered' : 'turned') : 'centered',
                audio: 'clean',
                yaw: headPoseResult?.yaw || 0,
                pitch: headPoseResult?.pitch || 0,
                roll: headPoseResult?.roll || 0,
                gazeX: eyeGazeResult?.gazeX || 0,
                gazeY: eyeGazeResult?.gazeY || 0
              });

              // Diagnostics Panel State
              setDiagMetrics({
                cameraFps: Math.min(60, camFps),
                inferenceFps: Math.min(60, infFps),
                latencyMs: latency,
                p50LatencyMs: p50,
                p95LatencyMs: p95,
                droppedFrames: droppedFramesRef.current,
                modelInitCount: modelInitCountRef.current,
                lastAnalyzedAgeMs: Math.max(0, Date.now() - lastAnalyzedTimeRef.current),
                modelReady: true,
                activeFaceCount: faces.length,
                presenceState: presenceDecision.state,
                presenceMessage: presenceDecision.message,
                confirmedOutOfView: presenceDecision.confirmedOutOfView,
                headPose: headPoseResult,
                eyeGaze: eyeGazeResult,
                activeObservation,
                missReason,
                overlayEnabled,
                calibrationActive: isCalibratingRef.current || !autoCalibratedRef.current
              });
            }
          } catch (err) {
            console.warn('Frame processing exception:', err);
          } finally {
            isInferenceBusyRef.current = false;
            scheduleNextFrame();
          }
        };

        // Frame scheduler using requestVideoFrameCallback when available
        const scheduleNextFrame = () => {
          if (isCancelled || !isMountedRef.current) return;
          if (video && 'requestVideoFrameCallback' in video) {
            videoCallbackHandle = (video as any).requestVideoFrameCallback(processFrame);
          } else {
            animFrameHandle = requestAnimationFrame(processFrame);
          }
        };

        scheduleNextFrame();
      } catch (err) {
        console.error('AI Proctor init failed:', err);
      } finally {
        isInitializingRef.current = false;
      }
    };

    void initDetectorAndLoop();

    // SECTION 4: ROBUST CLEANUP
    return () => {
      isCancelled = true;
      isMountedRef.current = false;

      if (videoCallbackHandle !== null && videoRef.current && 'cancelVideoFrameCallback' in videoRef.current) {
        (videoRef.current as any).cancelVideoFrameCallback(videoCallbackHandle);
      }
      if (animFrameHandle !== null) {
        cancelAnimationFrame(animFrameHandle);
      }
      if (audioCheckInterval) {
        clearInterval(audioCheckInterval);
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
      }
      if (detectorRef.current) {
        detectorRef.current.dispose?.();
        detectorRef.current = null;
      }
      if (fallbackDetectorRef.current) {
        fallbackDetectorRef.current.dispose?.();
        fallbackDetectorRef.current = null;
      }
    };
  }, [mediaStream?.id]);

  return (
    <>
      {/* Hidden processing video element */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{ display: 'none' }}
      />

      {/* Optional Debugging Canvas Overlay */}
      {overlayEnabled && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 20
          }}
        />
      )}

      {/* Immediate Visual Notice (Tier A: Polite Observation Aid) */}
      {warning && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            padding: '12px 20px',
            background: warningType === 'OUT_OF_VIEW' ? '#b91c1c' : warningType === 'MULTIPLE_PERSONS' ? '#ea580c' : 'rgba(15, 23, 42, 0.92)',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 10,
            zIndex: 99999,
            maxWidth: 380,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            animation: 'fadeIn 0.15s ease-in-out',
            backdropFilter: 'blur(6px)'
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>
            {warningType === 'OUT_OF_VIEW' ? '👤' : warningType === 'CALIBRATING' ? '🎯' : 'ℹ️'}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em', opacity: 0.8 }}>
              {warningType === 'CALIBRATING' ? 'Calibration' : 'Camera Guidance'}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, marginTop: 1 }}>{warning}</span>
          </div>
        </div>
      )}

      {/* Developer Diagnostics HUD */}
      <ProctorDiagnostics
        metrics={diagMetrics}
        onToggleOverlay={(enabled) => setOverlayEnabled(enabled)}
        onCalibrate={triggerCalibration}
        onResetCalibration={resetCalibration}
      />
    </>
  );
}
