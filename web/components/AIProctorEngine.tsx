'use client';
import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarks from '@tensorflow-models/face-landmarks-detection';
import { AlertTriangle, Users, EyeOff, Activity, ShieldCheck, Volume2, Eye } from 'lucide-react';

export default function AIProctorEngine({
  videoElement,
  mediaStream,
  onViolation,
  onTelemetryUpdate
}: {
  videoElement: HTMLVideoElement | null;
  mediaStream: MediaStream | null;
  onViolation?: (type: string, message: string, severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT') => void;
  onTelemetryUpdate?: (metrics: {
    faces: number;
    gaze: 'focused' | 'away';
    headPose: 'centered' | 'turned';
    audio: 'clean' | 'multiple_voices' | 'noisy';
  }) => void;
}) {
  const [warning, setWarning] = useState<string>('');
  const [warningSeverity, setWarningSeverity] = useState<'high' | 'medium' | 'low'>('medium');
  const [engineReady, setEngineReady] = useState(false);

  const lastViolationTimeRef = useRef<Map<string, number>>(new Map());
  const multiFaceFramesRef = useRef<number>(0);
  const noFaceFramesRef = useRef<number>(0);
  const gazeAwayFramesRef = useRef<number>(0);
  const multipleVoicesFramesRef = useRef<number>(0);

  // Rate-limited violation dispatcher to prevent spamming while guaranteeing rapid captures
  const reportViolation = (
    type: string,
    message: string,
    severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT'
  ) => {
    setWarning(message);
    setWarningSeverity(severity === 'NEEDS_REVIEW_HIGH' ? 'high' : severity === 'NEEDS_REVIEW' ? 'medium' : 'low');

    const now = Date.now();
    const lastTime = lastViolationTimeRef.current.get(type) || 0;
    // Debounce duplicate backend logs to every 6 seconds per event type
    if (now - lastTime > 6000) {
      lastViolationTimeRef.current.set(type, now);
      onViolation?.(type, message, severity);
    }
  };

  useEffect(() => {
    if (!videoElement || !mediaStream) return;

    let detector: faceLandmarks.FaceLandmarksDetector | null = null;
    let audioContext: AudioContext | null = null;
    let running = true;
    let animationFrameId: number;

    const initEngine = async () => {
      try {
        await tf.setBackend('webgl');
        await tf.ready();

        detector = await faceLandmarks.createDetector(faceLandmarks.SupportedModels.MediaPipeFaceMesh, {
          runtime: 'tfjs',
          refineLandmarks: true
        });

        // Audio analysis setup for multiple voices and background noise
        const audioTracks = mediaStream.getAudioTracks();
        if (audioTracks.length > 0) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          audioContext = new AudioCtx();
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 2048;
          const source = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          // Real-time audio spectral monitor
          setInterval(() => {
            if (!running) return;
            try {
              analyser.getByteFrequencyData(dataArray);
              const threshold = 50;
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
                multipleVoicesFramesRef.current++;
                if (multipleVoicesFramesRef.current >= 3) {
                  reportViolation('BACKGROUND_NOISE', '⚠️ Multiple voices / Background chatter detected', 'OBSERVED_EVENT');
                }
              } else {
                multipleVoicesFramesRef.current = Math.max(0, multipleVoicesFramesRef.current - 1);
              }
            } catch (_) {}
          }, 400);
        }

        setEngineReady(true);

        let lastRun = 0;
        const TARGET_FPS = 12; // 12 FPS for ultra-responsive, zero-latency proctoring

        const detectLoop = async () => {
          if (!running) return;

          const now = Date.now();
          if (now - lastRun < 1000 / TARGET_FPS) {
            animationFrameId = requestAnimationFrame(detectLoop);
            return;
          }
          lastRun = now;

          if (videoElement.readyState >= 2 && detector) {
            try {
              const faces = await detector.estimateFaces(videoElement);

              // 1. Multiple Faces Detection (Immediate Cheating Catch)
              if (faces.length > 1) {
                multiFaceFramesRef.current++;
                // Instant trigger: 2 frames (~150ms) is enough to catch a second person!
                if (multiFaceFramesRef.current >= 2) {
                  reportViolation(
                    'MULTIPLE_PERSONS',
                    `🚨 CHEATING ALERT: ${faces.length} Persons Detected in Camera Frame!`,
                    'NEEDS_REVIEW_HIGH'
                  );
                  onTelemetryUpdate?.({
                    faces: faces.length,
                    gaze: 'focused',
                    headPose: 'centered',
                    audio: 'clean'
                  });
                }
                animationFrameId = requestAnimationFrame(detectLoop);
                return;
              } else {
                multiFaceFramesRef.current = 0;
              }

              // 2. Face Absence Detection
              if (faces.length === 0) {
                noFaceFramesRef.current++;
                if (noFaceFramesRef.current >= 8) {
                  reportViolation('FACE_ABSENT', '⚠️ Face not detected. Please remain in camera view.', 'NEEDS_REVIEW');
                  onTelemetryUpdate?.({
                    faces: 0,
                    gaze: 'away',
                    headPose: 'turned',
                    audio: 'clean'
                  });
                }
                animationFrameId = requestAnimationFrame(detectLoop);
                return;
              } else {
                noFaceFramesRef.current = 0;
              }

              // 3. Face Landmark Analysis: Gaze & Head Pose
              const keypoints = faces[0].keypoints;
              const nose = keypoints[1];
              const leftEye = keypoints[33];
              const rightEye = keypoints[263];

              if (!nose || !leftEye || !rightEye) {
                reportViolation('FACE_ABSENT', '⚠️ Face partially obscured. Keep full face visible.', 'NEEDS_REVIEW');
                animationFrameId = requestAnimationFrame(detectLoop);
                return;
              }

              // Geometric ratio for horizontal head yaw
              const leftDist = Math.abs(nose.x - leftEye.x);
              const rightDist = Math.abs(rightEye.x - nose.x);
              const ratio = leftDist / (rightDist + 1e-4);

              // Vertical head pitch
              const centerY = (videoElement.videoHeight || 480) / 2;
              const noseVerticalOffset = Math.abs(nose.y - centerY);

              // 4. Eye Gaze Tracking via Iris Landmarks
              const leftIris = keypoints[468];
              const rightIris = keypoints[473];
              const leftEyeOuter = keypoints[33];
              const leftEyeInner = keypoints[133];
              const rightEyeInner = keypoints[362];
              const rightEyeOuter = keypoints[263];

              let gazeIssue = '';
              if (leftIris && rightIris && leftEyeOuter && leftEyeInner && rightEyeInner && rightEyeOuter) {
                const leftEyeMinX = Math.min(leftEyeOuter.x, leftEyeInner.x);
                const leftEyeMaxX = Math.max(leftEyeOuter.x, leftEyeInner.x);
                const leftIrisRelative = (leftIris.x - leftEyeMinX) / (leftEyeMaxX - leftEyeMinX + 1e-4);

                const rightEyeMinX = Math.min(rightEyeInner.x, rightEyeOuter.x);
                const rightEyeMaxX = Math.max(rightEyeInner.x, rightEyeOuter.x);
                const rightIrisRelative = (rightIris.x - rightEyeMinX) / (rightEyeMaxX - rightEyeMinX + 1e-4);

                const irisThresholdX = 0.22;
                if (leftIrisRelative < irisThresholdX || rightIrisRelative < irisThresholdX) {
                  gazeIssue = 'eyes looking left (diverted from screen)';
                } else if (leftIrisRelative > 1 - irisThresholdX || rightIrisRelative > 1 - irisThresholdX) {
                  gazeIssue = 'eyes looking right (diverted from screen)';
                }
              }

              // Evaluate violations and update telemetry
              if (ratio > 1.38 || ratio < 0.72) {
                gazeAwayFramesRef.current++;
                if (gazeAwayFramesRef.current >= 4) {
                  reportViolation('HEAD_TURN_PROLONGED', '⚠️ Please look directly at the screen (head turned away)', 'NEEDS_REVIEW');
                  onTelemetryUpdate?.({
                    faces: 1,
                    gaze: 'away',
                    headPose: 'turned',
                    audio: 'clean'
                  });
                }
              } else if (gazeIssue) {
                gazeAwayFramesRef.current++;
                if (gazeAwayFramesRef.current >= 4) {
                  reportViolation('GAZE_DEVIATION', `⚠️ Gaze Diverted: ${gazeIssue}`, 'NEEDS_REVIEW');
                  onTelemetryUpdate?.({
                    faces: 1,
                    gaze: 'away',
                    headPose: 'centered',
                    audio: 'clean'
                  });
                }
              } else if (noseVerticalOffset > 75) {
                reportViolation('HEAD_TURN_PROLONGED', '⚠️ Please keep your head straight (looking up/down)', 'OBSERVED_EVENT');
              } else {
                // Completely clean
                gazeAwayFramesRef.current = 0;
                setWarning('');
                onTelemetryUpdate?.({
                  faces: 1,
                  gaze: 'focused',
                  headPose: 'centered',
                  audio: 'clean'
                });
              }
            } catch (_) {}
          }

          animationFrameId = requestAnimationFrame(detectLoop);
        };

        detectLoop();
      } catch (err) {
        console.warn('AIProctorEngine fallback:', err);
      }
    };

    void initEngine();

    return () => {
      running = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (detector) {
        try {
          detector.dispose();
        } catch (_) {}
      }
      if (audioContext && audioContext.state !== 'closed') {
        try {
          audioContext.close();
        } catch (_) {}
      }
    };
  }, [videoElement, mediaStream]);

  return (
    <>
      {warning && (
        <div className={`proctoringFloatingBanner ${warningSeverity}`}>
          <div className="bannerContent">
            <span className="pulsingAlertDot"></span>
            <strong>{warning}</strong>
          </div>
          <small className="bannerSubtitle">Live AI Proctoring Active · Cryptographic Evidence Sealed</small>
        </div>
      )}
    </>
  );
}
