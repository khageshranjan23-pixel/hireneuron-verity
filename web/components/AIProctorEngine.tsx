'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarks from '@tensorflow-models/face-landmarks-detection';
import {
  estimateHeadPose,
  estimateEyeGaze,
  HeadPoseResult,
  EyeGazeResult,
  ProctorCalibration,
  DEFAULT_CALIBRATION,
  Keypoint3D
} from '../lib/proctorGeometry';
import ProctorDiagnostics, { DiagnosticsMetrics } from './ProctorDiagnostics';

export interface ProctorTelemetry {
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
}

export default function AIProctorEngine({
  mediaStream,
  onViolation,
  onTelemetryUpdate
}: AIProctorEngineProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Model & Inference Lifecycle Refs
  const detectorRef = useRef<faceLandmarks.FaceLandmarksDetector | null>(null);
  const isInitializingRef = useRef<boolean>(false);
  const isInferenceBusyRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const modelInitCountRef = useRef<number>(0);

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

  // Calibration state
  const calibrationRef = useRef<ProctorCalibration>({ ...DEFAULT_CALIBRATION });
  const calibrationSamplesRef = useRef<{ yaw: number; pitch: number; roll: number; gazeX: number; gazeY: number }[]>([]);
  const isCalibratingRef = useRef<boolean>(false);

  // Warning & Diagnostics UI State
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

  // Visual Warning with 1.2s Hold
  const triggerVisualWarning = useCallback((msg: string, type: string) => {
    setWarning(msg);
    setWarningType(type);
    warningExpiryRef.current = Date.now() + 1200;
  }, []);

  // Throttled Violation Dispatcher (2.5s debounce per type)
  const dispatchViolation = useCallback((type: string, message: string, severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT') => {
    const now = Date.now();
    const lastTime = lastViolationDispatchRef.current.get(type) || 0;
    if (now - lastTime > 2500) {
      lastViolationDispatchRef.current.set(type, now);
      const snapshot = captureSnapshot();
      onViolationRef.current?.(type, message, severity, snapshot);
    }
  }, [captureSnapshot]);

  // Calibration Trigger
  const triggerCalibration = useCallback(() => {
    calibrationSamplesRef.current = [];
    isCalibratingRef.current = true;
    triggerVisualWarning('🎯 Calibrating neutral straight-ahead pose…', 'CALIBRATING');
  }, [triggerVisualWarning]);

  const resetCalibration = useCallback(() => {
    calibrationRef.current = { ...DEFAULT_CALIBRATION };
    triggerVisualWarning('🔄 Calibration reset to defaults.', 'CALIBRATING');
  }, [triggerVisualWarning]);

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

    const initDetectorAndLoop = async () => {
      // Guard against concurrent initializations
      if (detectorRef.current || isInitializingRef.current) return;
      isInitializingRef.current = true;

      try {
        await tf.setBackend('webgl');
        await tf.ready();

        if (isCancelled || !isMountedRef.current) return;

        // Create FaceLandmarks detector with maxFaces: 5
        const detector = await faceLandmarks.createDetector(
          faceLandmarks.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: 'tfjs',
            refineLandmarks: true,
            maxFaces: 5
          }
        );

        if (isCancelled || !isMountedRef.current) {
          detector.dispose?.();
          return;
        }

        detectorRef.current = detector;
        modelInitCountRef.current += 1;

        // Attach stream to internal video element
        const video = videoRef.current;
        if (video) {
          video.srcObject = mediaStream;
          try {
            await video.play();
          } catch (_) {}
        }

        // Setup Ambient Audio Monitor
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

            audioCheckInterval = setInterval(() => {
              if (isCancelled) return;
              try {
                analyser.getByteFrequencyData(audioData);
                let sum = 0;
                for (let i = 0; i < audioData.length; i++) sum += audioData[i];
                const avgVolume = sum / audioData.length;
                if (avgVolume > 65) {
                  triggerVisualWarning('⚠️ High background audio activity', 'BACKGROUND_NOISE');
                  dispatchViolation('BACKGROUND_NOISE', 'High background audio noise detected', 'OBSERVED_EVENT');
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

          // Single-inference lock to drop stale frames
          if (isInferenceBusyRef.current) {
            droppedFramesRef.current += 1;
            scheduleNextFrame();
            return;
          }

          if (!video || video.readyState < 2 || !detectorRef.current) {
            scheduleNextFrame();
            return;
          }

          isInferenceBusyRef.current = true;
          const inferenceStart = performance.now();

          try {
            // High-speed video tracking mode (staticImageMode: false avoids redundant full-frame object detector)
            const faces = await detectorRef.current.estimateFaces(video, {
              staticImageMode: false,
              flipHorizontal: false
            });

            const inferenceEnd = performance.now();
            const latency = inferenceEnd - inferenceStart;

            // Track inference performance metrics
            inferenceTimesRef.current.push(inferenceEnd);
            if (inferenceTimesRef.current.length > 30) inferenceTimesRef.current.shift();
            latencySamplesRef.current.push(latency);
            if (latencySamplesRef.current.length > 30) latencySamplesRef.current.shift();

            lastAnalyzedTimeRef.current = Date.now();

            let activeObservation: string | null = null;
            let missReason: string | null = null;
            let headPoseResult: HeadPoseResult | null = null;
            let eyeGazeResult: EyeGazeResult | null = null;

            // 1. Multiple Faces Observation (Immediate)
            if (faces.length > 1) {
              activeObservation = `Multiple Persons Detected (${faces.length})`;
              triggerVisualWarning(`🚨 Multiple faces detected (${faces.length})`, 'MULTIPLE_PERSONS');
              dispatchViolation('MULTIPLE_PERSONS', `Cheating alert: ${faces.length} faces in frame`, 'NEEDS_REVIEW_HIGH');
            } else if (faces.length === 0) {
              // 2. Face Absent Observation
              activeObservation = 'Face Not Detected';
              missReason = 'No face detected in video frame';
              triggerVisualWarning('⚠️ Face not detected. Remain in frame.', 'FACE_ABSENT');
              dispatchViolation('FACE_ABSENT', 'Candidate face out of camera view', 'NEEDS_REVIEW');
            } else {
              // 3. Single Face: Geometry Analysis
              const keypoints = faces[0].keypoints as Keypoint3D[];
              headPoseResult = estimateHeadPose(keypoints, calibrationRef.current);
              eyeGazeResult = estimateEyeGaze(keypoints, headPoseResult, calibrationRef.current);

              // Handle Neutral Calibration Sampling
              if (isCalibratingRef.current) {
                calibrationSamplesRef.current.push({
                  yaw: headPoseResult.yaw,
                  pitch: headPoseResult.pitch,
                  roll: headPoseResult.roll,
                  gazeX: eyeGazeResult.gazeX,
                  gazeY: eyeGazeResult.gazeY
                });
                if (calibrationSamplesRef.current.length >= 15) {
                  const n = calibrationSamplesRef.current.length;
                  const avg = calibrationSamplesRef.current.reduce((acc, curr) => ({
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
                  triggerVisualWarning('✓ Neutral pose calibrated successfully!', 'CALIBRATING');
                }
              }

              // Evaluate Head Pose Direction
              if (headPoseResult.direction === 'LEFT') {
                activeObservation = `Head Turned Left (${headPoseResult.yaw}°)`;
                triggerVisualWarning('⚠️ Please look directly at screen (Head Left)', 'HEAD_TURN');
                dispatchViolation('HEAD_TURN_PROLONGED', `Head turned left: ${headPoseResult.yaw}°`, 'NEEDS_REVIEW');
              } else if (headPoseResult.direction === 'RIGHT') {
                activeObservation = `Head Turned Right (${headPoseResult.yaw}°)`;
                triggerVisualWarning('⚠️ Please look directly at screen (Head Right)', 'HEAD_TURN');
                dispatchViolation('HEAD_TURN_PROLONGED', `Head turned right: ${headPoseResult.yaw}°`, 'NEEDS_REVIEW');
              } else if (headPoseResult.direction === 'UP') {
                activeObservation = `Head Tilted Up (${headPoseResult.pitch}°)`;
                triggerVisualWarning('⚠️ Please keep head straight (Head Up)', 'HEAD_TURN');
                dispatchViolation('HEAD_TURN_PROLONGED', `Head tilted up: ${headPoseResult.pitch}°`, 'OBSERVED_EVENT');
              } else if (headPoseResult.direction === 'DOWN') {
                activeObservation = `Head Tilted Down (${headPoseResult.pitch}°)`;
                triggerVisualWarning('⚠️ Please keep head straight (Head Down)', 'HEAD_TURN');
                dispatchViolation('HEAD_TURN_PROLONGED', `Head tilted down: ${headPoseResult.pitch}°`, 'OBSERVED_EVENT');
              } else if (eyeGazeResult.isBlinking) {
                // Natural blink rejection
                missReason = 'Natural eye blink (rejected as non-violation)';
              } else if (eyeGazeResult.direction === 'LEFT') {
                // Eye-Only Gaze Left
                activeObservation = `Eye Gaze Left (X: ${eyeGazeResult.gazeX})`;
                triggerVisualWarning('⚠️ Looking away: Eyes Left', 'GAZE_DEVIATION');
                dispatchViolation('GAZE_DEVIATION', `Eyes looking left (iris offset: ${eyeGazeResult.gazeX})`, 'NEEDS_REVIEW');
              } else if (eyeGazeResult.direction === 'RIGHT') {
                // Eye-Only Gaze Right
                activeObservation = `Eye Gaze Right (X: ${eyeGazeResult.gazeX})`;
                triggerVisualWarning('⚠️ Looking away: Eyes Right', 'GAZE_DEVIATION');
                dispatchViolation('GAZE_DEVIATION', `Eyes looking right (iris offset: ${eyeGazeResult.gazeX})`, 'NEEDS_REVIEW');
              } else if (eyeGazeResult.direction === 'UP') {
                // Eye-Only Gaze Up
                activeObservation = `Eye Gaze Up (Y: ${eyeGazeResult.gazeY})`;
                triggerVisualWarning('⚠️ Looking away: Eyes Up', 'GAZE_DEVIATION');
                dispatchViolation('GAZE_DEVIATION', `Eyes looking up (iris offset: ${eyeGazeResult.gazeY})`, 'OBSERVED_EVENT');
              } else if (eyeGazeResult.direction === 'DOWN') {
                // Eye-Only Gaze Down
                activeObservation = `Eye Gaze Down (Y: ${eyeGazeResult.gazeY})`;
                triggerVisualWarning('⚠️ Looking away: Eyes Down', 'GAZE_DEVIATION');
                dispatchViolation('GAZE_DEVIATION', `Eyes looking down (iris offset: ${eyeGazeResult.gazeY})`, 'OBSERVED_EVENT');
              } else {
                missReason = 'Face neutral and within acceptable center deadband';
                // Clear warning once visual hold timer expires
                if (Date.now() > warningExpiryRef.current) {
                  setWarning('');
                  setWarningType('');
                }
              }

              // Optional Canvas Overlay Rendering
              if (overlayEnabled && canvasRef.current && video) {
                const canvas = canvasRef.current;
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.fillStyle = '#38bdf8';
                  // Draw keypoints
                  for (let i = 0; i < keypoints.length; i += 10) {
                    ctx.beginPath();
                    ctx.arc(keypoints[i].x, keypoints[i].y, 1.5, 0, 2 * Math.PI);
                    ctx.fill();
                  }
                  // Draw iris points in distinct color
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

            // SECTION 3: BOUNDED TELEMETRY & DIAGNOSTICS EMIT (5 Hz to prevent React churn)
            if (now - lastTelemetryEmit > 200) {
              lastTelemetryEmit = now;

              // Calculate Camera FPS
              const cTimes = cameraFrameTimesRef.current;
              const camFps = cTimes.length > 1
                ? (cTimes.length - 1) / ((cTimes[cTimes.length - 1] - cTimes[0]) / 1000)
                : 0;

              // Calculate Inference FPS
              const iTimes = inferenceTimesRef.current;
              const infFps = iTimes.length > 1
                ? (iTimes.length - 1) / ((iTimes[iTimes.length - 1] - iTimes[0]) / 1000)
                : 0;

              // Compute P50 and P95 Latencies
              const sorted = [...latencySamplesRef.current].sort((a, b) => a - b);
              const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
              const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;

              // Dispatch telemetry update to parent
              onTelemetryRef.current?.({
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

              // Update Diagnostics Panel State
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
                headPose: headPoseResult,
                eyeGaze: eyeGazeResult,
                activeObservation,
                missReason,
                overlayEnabled,
                calibrationActive: isCalibratingRef.current
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

    // SECTION 4: ROBUST CLEANUP (Effect owns all resources)
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
    };
  }, [mediaStream?.id]); // DEPENDS ONLY ON STREAM LIFECYCLE! Never on warning or callbacks!

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

      {/* Immediate Visual Warning Alert (Tier A: Human Observation Aid) */}
      {warning && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            padding: '14px 22px',
            background: warningType === 'MULTIPLE_PERSONS' ? '#dc2626' : warningType === 'BACKGROUND_NOISE' ? '#ea580c' : '#b91c1c',
            color: '#ffffff',
            fontSize: 15,
            fontWeight: 700,
            borderRadius: 12,
            zIndex: 99999,
            maxWidth: 380,
            boxShadow: '0 10px 25px -5px rgba(220, 38, 38, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            border: '2px solid rgba(255, 255, 255, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'fadeIn 0.15s ease-in-out'
          }}
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>
            {warningType === 'MULTIPLE_PERSONS' ? '🚨' : warningType === 'CALIBRATING' ? '🎯' : '⚠️'}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em', opacity: 0.9 }}>
              {warningType === 'MULTIPLE_PERSONS' ? 'Integrity Flag' : warningType === 'CALIBRATING' ? 'Calibration' : 'Proctoring Alert'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{warning}</span>
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
