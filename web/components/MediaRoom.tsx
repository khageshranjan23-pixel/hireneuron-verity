'use client';
import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';
import { api } from './api';
import { Camera, Smartphone, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function MediaRoom({
  sid,
  token,
  phone = false,
  viewer = false,
  onInterimTranscript,
  onDeviceStatus,
  onVolume,
  onSecondaryChange
}: {
  sid: string;
  token: string;
  phone?: boolean;
  viewer?: boolean;
  onInterimTranscript?: (text: string) => void;
  onDeviceStatus?: (status: { camera: boolean; mic: boolean }) => void;
  onVolume?: (level: number) => void;
  onSecondaryChange?: (connected: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Connecting media…');
  const [hasSecondary, setHasSecondary] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let closed = false;
    let localStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let animationId: number | null = null;
    const room = new Room();
    const nodes = new Map<string, HTMLElement>();

    // 1. Remote track handling
    const attachRemote = (track: any, identity: string) => {
      if (closed) return;
      if (track.kind === 'audio') {
        const audioEl = track.attach();
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        nodes.set('audio-' + (track.sid || identity), audioEl);
        return;
      }

      // Video track (e.g. from secondary smartphone or candidate laptop)
      const isPhone = identity.startsWith('phone:');
      const isPrimary = identity.startsWith('candidate:');

      const el = track.attach();
      el.muted = true;
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', 'true');
      el.setAttribute('webkit-playsinline', 'true');

      const wrapper = document.createElement('div');
      wrapper.className = 'feedWrapper remoteFeed';
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

    // Real-time interim captions
    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try {
        const decoded = new TextDecoder().decode(payload);
        const msg = JSON.parse(decoded);
        if (msg.type === 'interim') {
          onInterimTranscript?.(msg.text);
        } else if (msg.type === 'final') {
          onInterimTranscript?.('');
        }
      } catch (_) {}
    });

    // 2. Immediate Local Media Acquisition & Preview
    (async () => {
      if (!viewer) {
        try {
          const constraints: MediaStreamConstraints = {
            video: phone
              ? { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
              : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: phone ? false : { echoCancellation: true, noiseSuppression: true }
          };

          localStream = await navigator.mediaDevices.getUserMedia(constraints);
          if (closed) {
            localStream.getTracks().forEach((t) => t.stop());
            return;
          }

          onDeviceStatus?.({
            camera: localStream.getVideoTracks().length > 0,
            mic: localStream.getAudioTracks().length > 0
          });

          // Mount instant local video preview immediately
          const videoTrack = localStream.getVideoTracks()[0];
          if (videoTrack) {
            const videoEl = document.createElement('video');
            videoEl.muted = true;
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            videoEl.setAttribute('playsinline', 'true');
            videoEl.setAttribute('webkit-playsinline', 'true');
            videoEl.style.width = '100%';
            videoEl.style.height = '100%';
            videoEl.style.objectFit = 'cover';
            videoEl.srcObject = new MediaStream([videoTrack]);
            void videoEl.play().catch(() => {});

            const wrapper = document.createElement('div');
            wrapper.className = 'feedWrapper localFeed';
            const badge = document.createElement('div');
            badge.className = 'feedBadge';
            badge.innerHTML = phone
              ? '<span class="statusDot active"></span> Phone Rear Camera (Live Preview)'
              : '<span class="statusDot active"></span> Your Primary Webcam (Live)';
            wrapper.appendChild(badge);
            wrapper.appendChild(videoEl);
            host.current?.appendChild(wrapper);
            nodes.set('local-video', wrapper);
          }

          // Audio meter analysis
          const audioTrack = localStream.getAudioTracks()[0];
          if (audioTrack && onVolume && typeof window !== 'undefined') {
            try {
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
              audioContext = new AudioCtx();
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
                onVolume(Math.min(100, Math.round((avg / 128) * 100)));
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

      // 3. Cloud LiveKit WebRTC Room Connection
      try {
        const creds = await api(`/sessions/${sid}/media`, token, 'POST');
        if (closed) return;
        await room.connect(creds.url, creds.token);
        if (closed) {
          await room.disconnect();
          return;
        }

        // Publish local tracks to LiveKit room
        if (localStream) {
          for (const track of localStream.getTracks()) {
            if (closed) break;
            if (track.kind === 'video') {
              const lvt = new LocalVideoTrack(track);
              await room.localParticipant.publishTrack(lvt);
            } else if (track.kind === 'audio') {
              const lat = new LocalAudioTrack(track);
              await room.localParticipant.publishTrack(lat);
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
    <div className="mediaCard">
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

      <div className="feedsGrid" ref={host}></div>

      {hasSecondary && (
        <div className="secondaryConnectedBanner">
          <CheckCircle2 size={16} />
          <span>Secondary smartphone camera is actively monitoring your workspace.</span>
        </div>
      )}
    </div>
  );
}
