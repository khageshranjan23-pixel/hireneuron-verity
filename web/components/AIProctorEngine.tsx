'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarks from '@tensorflow-models/face-landmarks-detection';

export interface ProctorTelemetry {
  faces: number;
  gaze: 'focused' | 'away';
  headPose: 'centered' | 'turned';
  audio: 'clean' | 'multiple_voices' | 'noisy';
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
  const [warning, setWarning] = useState<string>('');
  const [warningType, setWarningType] = useState<string>('');
  const [engineReady, setEngineReady] = useState(false);

  const lastWarningRef = useRef<string>('');
  const lastViolationDispatchRef = useRef<Map<string, number>>(new Map());
  const multiFaceFramesRef = useRef<number>(0);
  const noFaceFramesRef = useRef<number>(0);
  const gazeAwayFramesRef = useRef<number>(0);
  const lastMultiVoiceTimeRef = useRef<number>(0);
  const isMultiVoiceActiveRef = useRef<boolean>(false);

  // Helper to capture base64 snapshot from current video frame
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
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      return dataUrl.split(',')[1] || '';
    } catch {
      return '';
    }
  }, []);

  // Dispatch violation with 2-second rate-limiting per violation type
  const dispatchViolation = useCallback((type: string, message: string, severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT') => {
    const now = Date.now();
    const lastTime = lastViolationDispatchRef.current.get(type) || 0;
    if (now - lastTime > 2000) {
      lastViolationDispatchRef.current.set(type, now);
      const snapshot = captureSnapshot();
      onViolation?.(type, message, severity, snapshot);
    }
  }, [captureSnapshot, onViolation]);

  useEffect(() => {
    if (!mediaStream || mediaStream.getVideoTracks().length === 0) return;

    let detector: faceLandmarks.FaceLandmarksDetector | null = null;
    let audioContext: AudioContext | null = null;
    let running = true;
    let animationFrameId: number;

    const start = async () => {
      try {
        await tf.setBackend('webgl');
        await tf.ready();

        // Initialize MediaPipe FaceMesh with maxFaces: 5 for multi-person detection
        detector = await faceLandmarks.createDetector(
          faceLandmarks.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: 'tfjs',
            refineLandmarks: true,
            maxFaces: 5 // Crucial: detects up to 5 simultaneous faces in the frame
          }
        );

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = mediaStream;
        try {
          await video.play();
        } catch (_) {}

        // Setup Audio Analyser for multi-voice and background noise detection
        try {
          const audioTracks = mediaStream.getAudioTracks();
          if (audioTracks.length > 0) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            audioContext = new AudioCtx();
            if (audioContext.state === 'suspended') {
              void audioContext.resume();
            }
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            const source = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            // Spectral peak analysis for multi-voice detection
            const checkAudio = () => {
              if (!running) return;
              try {
                analyser.getByteFrequencyData(dataArray);
                const threshold = 45;
                let peakCount = 0;
                let lastPeakFreq = 0;

                for (let i = 0; i < dataArray.length; i++) {
                  if (dataArray[i] > threshold) {
                    if (i - lastPeakFreq > 45) {
                      peakCount++;
                      lastPeakFreq = i;
                    }
                  }
                }

                if (peakCount > 2) {
                  if (!isMultiVoiceActiveRef.current) {
                    isMultiVoiceActiveRef.current = true;
                    setWarning('⚠️ Multiple voices detected in background');
                    setWarningType('BACKGROUND_NOISE');
                    dispatchViolation('BACKGROUND_NOISE', 'Multiple voices detected in background', 'OBSERVED_EVENT');
                    lastMultiVoiceTimeRef.current = Date.now();
                  } else {
                    const now = Date.now();
                    if (now - lastMultiVoiceTimeRef.current > 2000) {
                      dispatchViolation('BACKGROUND_NOISE', 'Multiple voices detected in background', 'OBSERVED_EVENT');
                      lastMultiVoiceTimeRef.current = now;
                    }
                  }
                } else if (isMultiVoiceActiveRef.current) {
                  isMultiVoiceActiveRef.current = false;
                  if (lastWarningRef.current === '⚠️ Multiple voices detected in background') {
                    setWarning('');
                    setWarningType('');
                  }
                }
              } catch (_) {}
            };

            const audioInterval = setInterval(checkAudio, 300);
            return () => clearInterval(audioInterval);
          }
        } catch (audioErr) {
          console.warn('Audio proctor init skipped:', audioErr);
        }

        setEngineReady(true);

        let lastRun = 0;
        const TARGET_FPS = 10; // 10 FPS for instantaneous reaction without GPU lag

        const detect = async () => {
          if (!running) return;

          const now = Date.now();
          if (now - lastRun < 1000 / TARGET_FPS) {
            animationFrameId = requestAnimationFrame(detect);
            return;
          }
          lastRun = now;

          if (!video || video.readyState < 2 || !detector) {
            animationFrameId = requestAnimationFrame(detect);
            return;
          }

          try {
            const faces = await detector.estimateFaces(video);

            // 1. Face Absence Detection
            if (faces.length === 0) {
              noFaceFramesRef.current++;
              if (noFaceFramesRef.current >= 3) {
                const msg = '⚠️ Face not detected. Please stay in camera view.';
                setWarning(msg);
                setWarningType('FACE_ABSENT');
                lastWarningRef.current = msg;
                dispatchViolation('FACE_ABSENT', msg, 'NEEDS_REVIEW');
                onTelemetryUpdate?.({
                  faces: 0,
                  gaze: 'away',
                  headPose: 'turned',
                  audio: isMultiVoiceActiveRef.current ? 'multiple_voices' : 'clean'
                });
              }
              animationFrameId = requestAnimationFrame(detect);
              return;
            } else {
              noFaceFramesRef.current = 0;
            }

            // 2. Multiple Faces Detection (Instant Catch - 2 consecutive frames ~200ms)
            if (faces.length > 1) {
              multiFaceFramesRef.current++;
              if (multiFaceFramesRef.current >= 2) {
                const msg = `🚨 Cheating Alert: Multiple faces detected (${faces.length})`;
                setWarning(msg);
                setWarningType('MULTIPLE_PERSONS');
                lastWarningRef.current = msg;
                dispatchViolation('MULTIPLE_PERSONS', msg, 'NEEDS_REVIEW_HIGH');
                onTelemetryUpdate?.({
                  faces: faces.length,
                  gaze: 'focused',
                  headPose: 'centered',
                  audio: isMultiVoiceActiveRef.current ? 'multiple_voices' : 'clean'
                });
              }
              animationFrameId = requestAnimationFrame(detect);
              return;
            } else {
              multiFaceFramesRef.current = 0;
            }

            // 3. Landmarks Analysis for Single Face
            const keypoints = faces[0].keypoints as any[];
            const nose = keypoints[1];
            const leftEye = keypoints[33];
            const rightEye = keypoints[263];

            if (!nose || !leftEye || !rightEye) {
              const msg = '⚠️ Face partially covered. Please keep full face visible.';
              setWarning(msg);
              setWarningType('FACE_ABSENT');
              lastWarningRef.current = msg;
              dispatchViolation('FACE_ABSENT', msg, 'NEEDS_REVIEW');
              animationFrameId = requestAnimationFrame(detect);
              return;
            }

            // Horizontal head turn (yaw) ratio
            const leftDist = Math.abs(nose.x - leftEye.x);
            const rightDist = Math.abs(rightEye.x - nose.x);
            const ratio = leftDist / (rightDist || 1);

            // Vertical head pitch (up/down)
            const centerY = video.videoHeight / 2;
            const noseVerticalOffset = Math.abs(nose.y - centerY);
            const topThreshold = video.videoHeight * 0.22;
            const bottomThreshold = video.videoHeight * 0.78;
            const isLookingUp = nose.y < topThreshold;
            const isLookingDown = nose.y > bottomThreshold;

            // Eye Gaze Tracking via Iris Landmarks (468: left iris, 473: right iris)
            const leftIris = keypoints[468];
            const rightIris = keypoints[473];
            const leftEyeOuter = keypoints[33];
            const leftEyeInner = keypoints[133];
            const rightEyeInner = keypoints[362];
            const rightEyeOuter = keypoints[263];

            let eyeGazeWarning = '';
            if (leftIris && rightIris && leftEyeOuter && leftEyeInner && rightEyeInner && rightEyeOuter) {
              const leftEyeMinX = Math.min(leftEyeOuter.x, leftEyeInner.x);
              const leftEyeMaxX = Math.max(leftEyeOuter.x, leftEyeInner.x);
              const leftIrisRelative = (leftIris.x - leftEyeMinX) / ((leftEyeMaxX - leftEyeMinX) || 1);

              const rightEyeMinX = Math.min(rightEyeInner.x, rightEyeOuter.x);
              const rightEyeMaxX = Math.max(rightEyeInner.x, rightEyeOuter.x);
              const rightIrisRelative = (rightIris.x - rightEyeMinX) / ((rightEyeMaxX - rightEyeMinX) || 1);

              const leftEyeMinY = Math.min(keypoints[159]?.y || leftEyeOuter.y, keypoints[145]?.y || leftEyeOuter.y);
              const leftEyeMaxY = Math.max(keypoints[159]?.y || leftEyeOuter.y, keypoints[145]?.y || leftEyeOuter.y);
              const leftIrisVerticalRelative = (leftIris.y - leftEyeMinY) / ((leftEyeMaxY - leftEyeMinY) || 1);

              const irisThresholdX = 0.22;
              const irisThresholdY = 0.25;

              if (leftIrisRelative < irisThresholdX || rightIrisRelative < irisThresholdX) {
                eyeGazeWarning = 'eyes looking left';
              } else if (leftIrisRelative > (1 - irisThresholdX) || rightIrisRelative > (1 - irisThresholdX)) {
                eyeGazeWarning = 'eyes looking right';
              } else if (leftIrisVerticalRelative < irisThresholdY) {
                eyeGazeWarning = 'eyes looking up';
              } else if (leftIrisVerticalRelative > (1 - irisThresholdY)) {
                eyeGazeWarning = 'eyes looking down';
              }
            }

            // Evaluate Head Movement & Gaze
            if (ratio > 1.38 || ratio < 0.72) {
              gazeAwayFramesRef.current++;
              if (gazeAwayFramesRef.current >= 2) {
                const msg = '⚠️ Please look directly at the screen';
                setWarning(msg);
                setWarningType('GAZE_DEVIATION');
                lastWarningRef.current = msg;
                dispatchViolation('GAZE_DEVIATION', msg, 'NEEDS_REVIEW');
                onTelemetryUpdate?.({
                  faces: 1,
                  gaze: 'away',
                  headPose: 'turned',
                  audio: isMultiVoiceActiveRef.current ? 'multiple_voices' : 'clean'
                });
              }
            } else if (noseVerticalOffset > 75 || isLookingUp || isLookingDown) {
              const msg = '⚠️ Please keep your head straight';
              setWarning(msg);
              setWarningType('HEAD_TURN_PROLONGED');
              lastWarningRef.current = msg;
              dispatchViolation('HEAD_TURN_PROLONGED', msg, 'OBSERVED_EVENT');
              onTelemetryUpdate?.({
                faces: 1,
                gaze: 'away',
                headPose: 'turned',
                audio: isMultiVoiceActiveRef.current ? 'multiple_voices' : 'clean'
              });
            } else if (eyeGazeWarning) {
              gazeAwayFramesRef.current++;
              if (gazeAwayFramesRef.current >= 2) {
                const msg = `⚠️ Looking away: ${eyeGazeWarning}`;
                setWarning(msg);
                setWarningType('GAZE_DEVIATION');
                lastWarningRef.current = msg;
                dispatchViolation('GAZE_DEVIATION', msg, 'NEEDS_REVIEW');
                onTelemetryUpdate?.({
                  faces: 1,
                  gaze: 'away',
                  headPose: 'centered',
                  audio: isMultiVoiceActiveRef.current ? 'multiple_voices' : 'clean'
                });
              }
            } else {
              // Completely clean frame
              gazeAwayFramesRef.current = 0;
              if (warningType !== 'BACKGROUND_NOISE') {
                setWarning('');
                setWarningType('');
                lastWarningRef.current = '';
              }
              onTelemetryUpdate?.({
                faces: 1,
                gaze: 'focused',
                headPose: 'centered',
                audio: isMultiVoiceActiveRef.current ? 'multiple_voices' : 'clean'
              });
            }
          } catch (detectionErr) {
            console.warn('Face estimation error:', detectionErr);
          }

          animationFrameId = requestAnimationFrame(detect);
        };

        detect();
      } catch (err) {
        console.error('AI Proctor init failed:', err);
      }
    };

    start();

    return () => {
      running = false;
      cancelAnimationFrame(animationFrameId);
      if (detector && typeof detector.dispose === 'function') {
        detector.dispose();
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
      }
    };
  }, [mediaStream, dispatchViolation, onTelemetryUpdate, warningType]);

  return (
    <>
      {/* Hidden dedicated high-performance video capture element */}
      <video
        ref={videoRef}
        width={640}
        height={480}
        muted
        playsInline
        autoPlay
        style={{ display: 'none' }}
      />

      {/* Prominent High-Contrast Real-time Warning Banner (Reference Styling) */}
      {warning && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            padding: '16px 24px',
            background: warningType === 'MULTIPLE_PERSONS' ? '#dc2626' : warningType === 'BACKGROUND_NOISE' ? '#ea580c' : '#b91c1c',
            color: '#ffffff',
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 12,
            zIndex: 99999,
            maxWidth: 380,
            boxShadow: '0 10px 25px -5px rgba(220, 38, 38, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            border: '2px solid rgba(255, 255, 255, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'fadeIn 0.2s ease-in-out'
          }}
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>
            {warningType === 'MULTIPLE_PERSONS' ? '🚨' : '⚠️'}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em', opacity: 0.9 }}>
              {warningType === 'MULTIPLE_PERSONS' ? 'Integrity Violation' : 'Proctoring Warning'}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{warning}</span>
          </div>
        </div>
      )}
    </>
  );
}
