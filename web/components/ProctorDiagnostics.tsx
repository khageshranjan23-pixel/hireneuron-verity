'use client';

import React, { useState, useEffect } from 'react';
import { Activity, X, Eye, Compass, ShieldAlert, Cpu, Layers } from 'lucide-react';
import { HeadPoseResult, EyeGazeResult } from '../lib/proctorGeometry';

export interface DiagnosticsMetrics {
  cameraFps: number;
  inferenceFps: number;
  latencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  droppedFrames: number;
  modelInitCount: number;
  lastAnalyzedAgeMs: number;
  modelReady: boolean;
  activeFaceCount: number;
  presenceState?: string;
  presenceMessage?: string;
  confirmedOutOfView?: boolean;
  lookAwayState?: string;
  lookAwayDurationMs?: number;
  headPose: HeadPoseResult | null;
  eyeGaze: EyeGazeResult | null;
  activeObservation: string | null;
  missReason: string | null;
  overlayEnabled: boolean;
  calibrationActive: boolean;
}

export default function ProctorDiagnostics({
  metrics,
  onToggleOverlay,
  onCalibrate,
  onResetCalibration
}: {
  metrics: DiagnosticsMetrics;
  onToggleOverlay?: (enabled: boolean) => void;
  onCalibrate?: () => void;
  onResetCalibration?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Toggle on Ctrl+Shift+D keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      {/* Floating Toggle Button (visible in bottom-left) */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          background: isOpen ? '#0f172a' : 'rgba(15, 23, 42, 0.85)',
          color: '#38bdf8',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          zIndex: 99999,
          backdropFilter: 'blur(4px)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
        }}
        title="Toggle Proctoring Diagnostics HUD (Ctrl+Shift+D)"
      >
        <Activity size={14} />
        <span>Diagnostics (Ctrl+Shift+D)</span>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: metrics.modelReady ? '#22c55e' : '#eab308'
          }}
        />
      </button>

      {/* Diagnostics HUD Panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            left: 24,
            width: 360,
            background: '#090d16',
            color: '#f8fafc',
            border: '1px solid #1e293b',
            borderRadius: 12,
            padding: 16,
            zIndex: 100000,
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 12,
            maxHeight: '90vh',
            overflowY: 'auto'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8' }}>
              <Cpu size={16} />
              <strong style={{ fontSize: 13, letterSpacing: '0.05em' }}>PROCTOR DIAGNOSTICS</strong>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Section 0: Presence State Machine */}
          <div style={{ marginBottom: 14, background: '#111827', padding: 8, borderRadius: 6, border: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>
              Presence State Machine
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                fontWeight: 700,
                fontSize: 13,
                color: metrics.presenceState === 'FACE_PRESENT' ? '#4ade80' :
                       metrics.presenceState === 'TRACKING_UNCERTAIN' ? '#fbbf24' :
                       metrics.presenceState === 'CALIBRATING' ? '#38bdf8' :
                       metrics.presenceState === 'FACE_NOT_VISIBLE' ? '#f97316' :
                       metrics.presenceState === 'PERSON_OUT_OF_VIEW_CONFIRMED' ? '#ef4444' : '#94a3b8'
              }}>
                {metrics.presenceState || 'INITIALIZING'}
              </span>
              <span style={{ fontSize: 10, color: '#64748b' }}>
                {metrics.confirmedOutOfView ? '🚨 Out-of-View Confirmed' : '✓ In-Frame'}
              </span>
            </div>
            {metrics.presenceMessage && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                {metrics.presenceMessage}
              </div>
            )}
            {metrics.lookAwayState && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 4, borderTop: '1px dashed #334155' }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>Gaze Gate (1.0s):</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: metrics.lookAwayState === 'LOOKING_FORWARD' ? '#4ade80' :
                         metrics.lookAwayState === 'LOOK_AWAY_CONFIRMED' ? '#f59e0b' : '#38bdf8'
                }}>
                  {metrics.lookAwayState} ({metrics.lookAwayDurationMs || 0}ms)
                </span>
              </div>
            )}
          </div>

          {/* Section 1: Performance & Latency */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', marginBottom: 6 }}>
              Inference &amp; Video Performance
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div style={{ background: '#111827', padding: '6px 8px', borderRadius: 6 }}>
                <span style={{ color: '#64748b', fontSize: 10 }}>Camera Rate:</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: metrics.cameraFps >= 12 ? '#4ade80' : '#f87171' }}>
                  {metrics.cameraFps.toFixed(1)} <small style={{ fontSize: 10, fontWeight: 400 }}>FPS</small>
                </div>
              </div>
              <div style={{ background: '#111827', padding: '6px 8px', borderRadius: 6 }}>
                <span style={{ color: '#64748b', fontSize: 10 }}>Inference Rate:</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: metrics.inferenceFps >= 10 ? '#4ade80' : '#fbbf24' }}>
                  {metrics.inferenceFps.toFixed(1)} <small style={{ fontSize: 10, fontWeight: 400 }}>FPS</small>
                </div>
              </div>
              <div style={{ background: '#111827', padding: '6px 8px', borderRadius: 6 }}>
                <span style={{ color: '#64748b', fontSize: 10 }}>Latency (P50 / P95):</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>
                  {metrics.p50LatencyMs.toFixed(0)}ms / {metrics.p95LatencyMs.toFixed(0)}ms
                </div>
              </div>
              <div style={{ background: '#111827', padding: '6px 8px', borderRadius: 6 }}>
                <span style={{ color: '#64748b', fontSize: 10 }}>Dropped Frames:</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: metrics.droppedFrames > 50 ? '#fbbf24' : '#94a3b8' }}>
                  {metrics.droppedFrames}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Model & Lifecycle State */}
          <div style={{ marginBottom: 14, background: '#111827', padding: 8, borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#64748b', fontSize: 10 }}>Model Initializations:</span>
              <strong style={{ color: metrics.modelInitCount === 1 ? '#4ade80' : '#f87171' }}>
                {metrics.modelInitCount} {metrics.modelInitCount === 1 ? '✓ (Stable)' : '⚠ (Multiple inits!)'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#64748b', fontSize: 10 }}>Faces in Frame:</span>
              <strong style={{ color: metrics.activeFaceCount === 1 ? '#4ade80' : metrics.activeFaceCount > 1 ? '#f87171' : '#fbbf24' }}>
                {metrics.activeFaceCount}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b', fontSize: 10 }}>Frame Age:</span>
              <span style={{ color: metrics.lastAnalyzedAgeMs < 150 ? '#4ade80' : '#f87171' }}>
                {metrics.lastAnalyzedAgeMs}ms
              </span>
            </div>
          </div>

          {/* Section 3: Head Pose (Yaw, Pitch, Roll) */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', marginBottom: 6 }}>
              <Compass size={12} />
              <span>3D Head Orientation</span>
            </div>
            <div style={{ background: '#111827', padding: 8, borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span>Yaw (L/R):</span>
                <strong style={{ color: Math.abs(metrics.headPose?.yaw || 0) > 16 ? '#f87171' : '#4ade80' }}>
                  {metrics.headPose ? `${metrics.headPose.yaw > 0 ? '+' : ''}${metrics.headPose.yaw}°` : 'N/A'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span>Pitch (U/D):</span>
                <strong style={{ color: Math.abs(metrics.headPose?.pitch || 0) > 14 ? '#f87171' : '#4ade80' }}>
                  {metrics.headPose ? `${metrics.headPose.pitch > 0 ? '+' : ''}${metrics.headPose.pitch}°` : 'N/A'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span>Roll (Tilt):</span>
                <strong style={{ color: Math.abs(metrics.headPose?.roll || 0) > 15 ? '#fbbf24' : '#4ade80' }}>
                  {metrics.headPose ? `${metrics.headPose.roll > 0 ? '+' : ''}${metrics.headPose.roll}°` : 'N/A'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Pose Direction:</span>
                <span style={{ color: metrics.headPose?.direction === 'CENTER' ? '#4ade80' : '#38bdf8', fontWeight: 600 }}>
                  {metrics.headPose?.direction || 'UNKNOWN'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Eye-Only Gaze Tracking */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', marginBottom: 6 }}>
              <Eye size={12} />
              <span>Eye-Only Gaze &amp; Iris Geometry</span>
            </div>
            <div style={{ background: '#111827', padding: 8, borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span>Gaze Vector (X, Y):</span>
                <strong>
                  {metrics.eyeGaze ? `(${metrics.eyeGaze.gazeX.toFixed(2)}, ${metrics.eyeGaze.gazeY.toFixed(2)})` : 'N/A'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span>Eye Openness (EAR L/R):</span>
                <span style={{ color: metrics.eyeGaze?.isBlinking ? '#fbbf24' : '#4ade80' }}>
                  {metrics.eyeGaze ? `${metrics.eyeGaze.leftEAR.toFixed(2)} / ${metrics.eyeGaze.rightEAR.toFixed(2)}` : 'N/A'}
                  {metrics.eyeGaze?.isBlinking ? ' (Blinking)' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span>Gaze Direction:</span>
                <strong style={{ color: metrics.eyeGaze?.direction === 'CENTER' ? '#4ade80' : '#f87171' }}>
                  {metrics.eyeGaze?.direction || 'UNKNOWN'}
                </strong>
              </div>
              {/* v2: Lip & Mouth Tracking */}
              <div style={{ borderTop: '1px dashed #334155', paddingTop: 4, marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>Lip Movement:</span>
                  <span style={{ color: metrics.eyeGaze?.isSpeaking ? '#f87171' : '#4ade80' }}>
                    {metrics.eyeGaze ? `${(metrics.eyeGaze.lipMovement * 100).toFixed(0)}%` : 'N/A'}
                    {metrics.eyeGaze?.isSpeaking ? ' 🗣️ SPEAKING' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Mouth Open:</span>
                  <span style={{ color: metrics.eyeGaze?.mouthOpen ? '#f87171' : '#4ade80' }}>
                    {metrics.eyeGaze?.mouthOpen ? '⚠️ WIDE OPEN' : 'Normal'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Observation & Miss Diagnostics */}
          <div style={{ marginBottom: 14, background: '#111827', padding: 8, borderRadius: 6 }}>
            <div style={{ color: '#64748b', fontSize: 10, marginBottom: 3 }}>Active Observation:</div>
            <div style={{ fontWeight: 600, color: metrics.activeObservation ? '#f87171' : '#4ade80', marginBottom: 6 }}>
              {metrics.activeObservation || 'None (Normal Neutral Behavior)'}
            </div>
            {metrics.missReason && (
              <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px solid #1e293b', paddingTop: 4 }}>
                <span style={{ color: '#fbbf24' }}>Diagnostic: </span>
                {metrics.missReason}
              </div>
            )}
          </div>

          {/* Actions & Calibration */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => onCalibrate?.()}
              type="button"
              style={{
                flex: 1,
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Calibrate Neutral
            </button>
            <button
              onClick={() => onResetCalibration?.()}
              type="button"
              style={{
                background: '#334155',
                color: '#f8fafc',
                border: 'none',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
            <button
              onClick={() => onToggleOverlay?.(!metrics.overlayEnabled)}
              type="button"
              style={{
                background: metrics.overlayEnabled ? '#059669' : '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              {metrics.overlayEnabled ? 'Hide Canvas' : 'Show Canvas'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
