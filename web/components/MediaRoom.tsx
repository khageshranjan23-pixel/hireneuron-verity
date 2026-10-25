'use client';
import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack, Track } from 'livekit-client';
import { api } from './api';
import {
  Camera,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Users,
  EyeOff,
  Activity,
  Eye,
  UserCheck,
  Volume2,
  VolumeX
} from 'lucide-react';
import dynamic from 'next/dynamic';
import BrowserProctor from './BrowserProctor';

const AIProctorEngine = dynamic(() => import('./AIProctorEngine'), { ssr: false });

export default function MediaRoom({
  sid,
  token,
  phone = false,
  viewer = false,
  onInterimTranscript,
  onDeviceStatus,
  onVolume,
  onSecondaryChange,
  onProctoringAlert
}: {
  sid: string;
  token: string;
  phone?: boolean;
  viewer?: boolean;
  onInterimTranscript?: (text: string) => void;
  onDeviceStatus?: (status: { camera: boolean; mic: boolean }) => void;
  onVolume?: (level: number) => void;
  onSecondaryChange?: (connected: boolean) => void;
  onProctoringAlert?: (alert: { type: string; message: string; severity: string; time: number }) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Connecting media…');
  const [hasSecondary, setHasSecondary] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<{ type: string; message: string; severity: string; time: number } | null>(null);
  const [motionLevel, setMotionLevel] = useState(0);

  // Live telemetry metrics
  const [gazeStatus, setGazeStatus] = useState<'focused' | 'away'>('focused');
  const [faceStatus, setFaceStatus] = useState<'normal' | 'multiple' | 'absent' | 'cropped'>('normal');
  const [audioStatus, setAudioStatus] = useState<'clean' | 'noisy'>('clean');

  // Node references for AIProctorEngine
  const [localMediaStream, setLocalMediaStream] = useState<MediaStream | null>(null);
  const [localVideoNode, setLocalVideoNode] = useState<HTMLVideoElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Trigger an alert and auto-clear after 4.5 seconds
  const triggerAlert = (type: string, message: string, severity: string) => {
    const alertObj = { type, message, severity, time: Date.now() };
    setCurrentAlert(alertObj);
    onProctoringAlert?.(alertObj);
    setTimeout(() => {
      setCurrentAlert((prev) => (prev?.time === alertObj.time ? null : prev));
    }, 4500);
  };

  useEffect(() => {
    let closed = false;
    let localStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let animationId: number | null = null;
    const room = new Room();
    const nodes = new Map<string, HTMLElement>();

    // 1. Remote track handling (e.g. secondary phone camera or remote feeds)
    const attachRemote = (track: any, identity: string) => {
      if (closed) return;
      if (track.kind === 'audio') {
        const audioEl = track.attach();
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        nodes.set('audio-' + (track.sid || identity), audioEl);
        return;
      }

      // Video track
      const isPhone = identity.startsWith('phone:');
      const isPrimary = identity.startsWith('candidate:');

      const el = track.attach();
      el.muted = true;
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', 'true');
      el.setAttribute('webkit-playsinline', 'true');

      const wrapper = document.createElement('div');
      wrapper.className = 'feedWrapper remoteFeed ' + (isPhone ? 'phoneFeedWrapper' : '');
      wrapper.id = 'feed-' + (track.sid || identity);

      const badge = document.createElement('div');
      badge.className = 'feedBadge';
      badge.innerHTML = isPhone
        ? '<span class="statusDot active"></span> Secondary Camera (Phone Live)'
        : isPrimary
        ? '<span class="statusDot active"></span> Primary Camera (Laptop)'
        : identity;

      wrapper.appendChild(badge);
      wrapper.appendChild(el);
      host.current?.appendChild(wrapper);
      nodes.set(track.sid || identity, wrapper);

      if (isPhone) {
        setHasSecondary(true);
        onSecondaryChange?.(true);
      }
    };

    room.on(RoomEvent.TrackSubscribed, (track, pub, p) => attachRemote(track, p.identity));
    room.on(RoomEvent.TrackUnsubscribed, (track, pub, p) => {
      if (track.sid) {
        const w = nodes.get(track.sid);
        if (w) {
          w.remove();
          nodes.delete(track.sid);
        }
      }
      track.detach().forEach((el: any) => el.remove());
      if (p?.identity.startsWith('phone:')) {
        setHasSecondary(false);
        onSecondaryChange?.(false);
      }
    });

    room.on(RoomEvent.Reconnecting, () => setStatus('Reconnecting media…'));
    room.on(RoomEvent.Reconnected, () => setStatus('Media reconnected'));
    room.on(RoomEvent.Disconnected, () => setStatus('Media disconnected'));

    // Real-time data channel messages (captions + proctoring alerts from workers)
    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try {
        const decoded = new TextDecoder().decode(payload);
        const msg = JSON.parse(decoded);
        if (msg.type === 'interim') {
          onInterimTranscript?.(msg.text);
        } else if (msg.type === 'final') {
          onInterimTranscript?.('');
        } else if (msg.type === 'proctoring') {
          let text = '⚠️ Proctoring Alert Observed';
          if (msg.event === 'MULTIPLE_PERSONS') {
            text = '🚨 CHEATING ALERT: Multiple Persons in Frame!';
            setFaceStatus('multiple');
          } else if (msg.event === 'FACE_ABSENT') {
            text = '⚠️ WARNING: Face Out of Camera View!';
            setFaceStatus('absent');
          } else if (msg.event === 'GAZE_DEVIATION' || msg.event === 'HEAD_TURN_PROLONGED') {
            text = '⚠️ SUSPICIOUS: Gaze Diverted / Looking Away from Screen!';
            setGazeStatus('away');
          } else if (msg.event === 'FRAME_COVERAGE_GAP') {
            text = '⚠️ Camera Coverage Gap Detected';
          }
          triggerAlert(msg.event, text, msg.severity || 'NEEDS_REVIEW');
        }
      } catch (_) {}
    });

    // 2. Immediate Local Media Acquisition & Preview
    (async () => {
      if (!viewer) {
        try {
          try {
            const constraints: MediaStreamConstraints = {
              video: phone
                ? { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
                : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: phone ? false : { echoCancellation: true, noiseSuppression: true }
            };
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
          } catch (initialErr) {
            localStream = await navigator.mediaDevices.getUserMedia(
              phone ? { video: true, audio: false } : { video: true, audio: true }
            );
          }

          if (closed) {
            localStream.getTracks().forEach((t) => t.stop());
            return;
          }

          setLocalMediaStream(localStream);

          onDeviceStatus?.({
            camera: localStream.getVideoTracks().length > 0,
            mic: localStream.getAudioTracks().length > 0
          });

          // Mount instant local video preview immediately
          const videoTrack = localStream.getVideoTracks()[0];
          let localVideoEl: HTMLVideoElement | null = null;
          if (videoTrack) {
            localVideoEl = document.createElement('video');
            localVideoEl.muted = true;
            localVideoEl.autoplay = true;
            localVideoEl.playsInline = true;
            localVideoEl.setAttribute('playsinline', 'true');
            localVideoEl.setAttribute('webkit-playsinline', 'true');
            localVideoEl.style.width = '100%';
            localVideoEl.style.height = '100%';
            localVideoEl.style.objectFit = 'cover';
            localVideoEl.srcObject = new MediaStream([videoTrack]);
            void localVideoEl.play().catch(() => {});

            setLocalVideoNode(localVideoEl);

            const wrapper = document.createElement('div');
            wrapper.className = 'feedWrapper localFeed';
            const badge = document.createElement('div');
            badge.className = 'feedBadge';
            badge.innerHTML = phone
              ? '<span class="statusDot active"></span> Phone Rear Camera (Live Stream)'
              : '<span class="statusDot active"></span> Primary Webcam (Live)';
            wrapper.appendChild(badge);
            wrapper.appendChild(localVideoEl);
            host.current?.appendChild(wrapper);
            nodes.set('local-video', wrapper);
          }

          // Audio Meter
          const audioTrack = localStream.getAudioTracks()[0];
          if (audioTrack && typeof window !== 'undefined') {
            try {
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
              audioContext = new AudioCtx();
              if (audioContext.state === 'suspended') {
                void audioContext.resume();
              }
              const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
              const analyser = audioContext.createAnalyser();
              analyser.fftSize = 64;
              source.connect(analyser);
              const dataArray = new Uint8Array(analyser.frequencyBinCount);

              const checkLevel = () => {
                if (closed) return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                const normalized = Math.min(100, Math.round((avg / 128) * 100));
                onVolume?.(normalized);
                animationId = requestAnimationFrame(checkLevel);
              };
              checkLevel();
            } catch (_) {}
          }

          // Consent-based MediaRecorder on candidate laptop
          if (!phone && typeof window !== 'undefined' && 'MediaRecorder' in window && localStream.getVideoTracks().length > 0) {
            try {
              const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
                ? 'video/webm;codecs=vp8,opus'
                : 'video/webm';
              const recorder = new MediaRecorder(localStream, { mimeType: mime });
              recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                  recordedChunksRef.current.push(e.data);
                }
              };
              recorder.start(1500);
              mediaRecorderRef.current = recorder;
            } catch (recErr) {
              console.warn('MediaRecorder notice:', recErr);
            }
          }
        } catch (mediaErr) {
          setStatus('Camera/Microphone permission denied or in use by another app.');
          onDeviceStatus?.({ camera: false, mic: false });
          return;
        }
      }

      // 3. Cloud LiveKit WebRTC Room Connection with explicit source metadata
      try {
        const creds = await api(`/sessions/${sid}/media`, token, 'POST');
        if (closed) return;
        await room.connect(creds.url, creds.token);
        if (closed) {
          await room.disconnect();
          return;
        }

        // Publish local tracks to LiveKit room with explicit source parameters
        if (localStream) {
          for (const track of localStream.getTracks()) {
            if (closed) break;
            if (track.kind === 'video') {
              const lvt = new LocalVideoTrack(track);
              await room.localParticipant.publishTrack(lvt, {
                name: phone ? 'secondary' : 'camera',
                source: Track.Source.Camera
              });
            } else if (track.kind === 'audio') {
              const lat = new LocalAudioTrack(track);
              await room.localParticipant.publishTrack(lat, {
                name: 'microphone',
                source: Track.Source.Microphone
              });
            }
          }
        }

        setStatus(
          phone
            ? 'Phone camera streaming live'
            : viewer
            ? 'Live inspection feeds connected'
            : 'Media connected · AI proctoring active'
        );
        await room.startAudio();
      } catch (err) {
        setStatus(`Connected locally (${(err as Error).message})`);
      }
    })();

    // Cleanup on unmount
    return () => {
      closed = true;
      if (animationId) cancelAnimationFrame(animationId);
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close();
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      void room.disconnect();

      // Finalize and upload local recording if chunks exist
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.stop();
        setTimeout(async () => {
          if (!recordedChunksRef.current.length) return;
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const fd = new FormData();
          fd.append('file', blob, `${sid}.webm`);
          try {
            await api(`/sessions/${sid}/recording/upload`, token, 'POST', fd);
          } catch (_) {}
        }, 500);
      }
    };
  }, [sid, token, phone, viewer]);

  return (
    <div className={`mediaCard ${currentAlert ? 'alertActive' : ''}`}>
      <div className="mediaCardHeader">
        <div className="mediaStatusBadge">
          <span className="livePulse"></span>
          <span>{status}</span>
        </div>
        {!phone && !viewer && (
          <div className="recBadge">
            <span className="recDot"></span>
            <span>PROCTORING &amp; RECORDING ACTIVE</span>
          </div>
        )}
      </div>

      {/* Embedded High-Precision AI Proctoring & Browser Violation Watchdog */}
      {!phone && !viewer && (
        <>
          <BrowserProctor
            onViolation={(msg, severity) => {
              triggerAlert('BROWSER_VIOLATION', msg, severity);
              void api(`/sessions/${sid}/events`, token, 'POST', {
                role: 'primary',
                type: 'BROWSER_NAVIGATION',
                severity,
                jpeg_b64: '',
                algorithm: 'browser-proctor-fullscreen-v1',
                frame_count: 1,
                start: Date.now() / 1000,
                end: Date.now() / 1000
              }).catch(() => {});
            }}
          />

          <AIProctorEngine
            mediaStream={localMediaStream}
            onViolation={(type, msg, severity, snapshotB64) => {
              triggerAlert(type, msg, severity);
              void api(`/sessions/${sid}/events`, token, 'POST', {
                role: 'primary',
                type,
                severity,
                jpeg_b64: snapshotB64 || '',
                algorithm: 'client-tfjs-facemesh-v1',
                frame_count: 1,
                start: Date.now() / 1000,
                end: Date.now() / 1000
              }).catch(() => {});
            }}
            onTelemetryUpdate={(metrics) => {
              setFaceStatus(metrics.faces === 0 ? 'absent' : metrics.faces > 1 ? 'multiple' : 'normal');
              setGazeStatus(metrics.gaze);
              setAudioStatus(metrics.audio === 'clean' ? 'clean' : 'noisy');
            }}
          />
        </>
      )}

      {/* Real-time On-Screen Proctoring HUD Alert Overlay */}
      {!phone && !viewer && (
        <div className="proctoringHudOverlay">
          {currentAlert ? (
            <div className={`proctoringAlertPill ${currentAlert.severity.toLowerCase()}`}>
              {currentAlert.type === 'MULTIPLE_PERSONS' ? (
                <Users size={16} className="alertPillIcon spinPulse" />
              ) : currentAlert.type === 'FACE_ABSENT' || currentAlert.type === 'GAZE_DEVIATION' || currentAlert.type === 'HEAD_TURN_PROLONGED' ? (
                <EyeOff size={16} className="alertPillIcon" />
              ) : currentAlert.type === 'BACKGROUND_NOISE' ? (
                <VolumeX size={16} className="alertPillIcon" />
              ) : (
                <Activity size={16} className="alertPillIcon" />
              )}
              <div className="alertPillContent">
                <strong>{currentAlert.message}</strong>
                <small>Evidence snapshot logged · Cryptographic HMAC sealed</small>
              </div>
            </div>
          ) : (
            <div className="proctoringCleanPill">
              <ShieldCheck size={14} className="cleanIcon" />
              <span>Verified 1 Candidate in Frame · Gaze Centered</span>
            </div>
          )}
        </div>
      )}

      <div className="feedsGrid" ref={host}></div>

      {/* Real-time Telemetry Status Matrix */}
      {!phone && !viewer && (
        <div className="proctoringTelemetryBar">
          <div className={`telemetryPill ${faceStatus === 'normal' ? 'good' : 'warning'}`}>
            <UserCheck size={12} />
            <span>
              {faceStatus === 'normal'
                ? 'Face: Centered'
                : faceStatus === 'multiple'
                ? 'Face: 2+ Persons'
                : faceStatus === 'cropped'
                ? 'Face: Edges Cut Off'
                : 'Face: Absent'}
            </span>
          </div>

          <div className={`telemetryPill ${gazeStatus === 'focused' ? 'good' : 'warning'}`}>
            <Eye size={12} />
            <span>{gazeStatus === 'focused' ? 'Gaze: On-Screen' : 'Gaze: Away'}</span>
          </div>

          <div className={`telemetryPill ${audioStatus === 'clean' ? 'good' : 'warning'}`}>
            <Volume2 size={12} />
            <span>{audioStatus === 'clean' ? 'Audio: Clean' : 'Audio: High Noise'}</span>
          </div>
        </div>
      )}

      {hasSecondary && (
        <div className="secondaryConnectedBanner">
          <CheckCircle2 size={16} />
          <span>Secondary smartphone camera is actively monitoring your workspace.</span>
        </div>
      )}
    </div>
  );
}
