'use client';
import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, createLocalTracks } from 'livekit-client';
import { api, BASE } from './api';
import { Camera, Mic, Smartphone, Video } from 'lucide-react';

export default function MediaRoom({
  sid,
  token,
  phone = false,
  viewer = false
}: {
  sid: string;
  token: string;
  phone?: boolean;
  viewer?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Connecting media…');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let closed = false;
    const room = new Room();
    const nodes = new Map<string, HTMLElement>();

    const attach = (track: any, identity: string) => {
      if (closed) return;
      const el = track.attach();
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      
      const isPhone = identity.startsWith('phone:');
      const isVoice = identity.startsWith('voice:');
      const isPrimary = identity.startsWith('candidate:');
      
      const wrapper = document.createElement('div');
      wrapper.className = 'feedWrapper';
      wrapper.id = 'feed-' + (track.sid || identity);
      
      const badge = document.createElement('div');
      badge.className = 'feedBadge';
      badge.innerText = isPhone
        ? 'Secondary Camera (Phone)'
        : isVoice
        ? 'AI Interviewer'
        : isPrimary
        ? 'Primary Camera (Laptop)'
        : identity;
      
      wrapper.appendChild(badge);
      wrapper.appendChild(el);
      host.current?.appendChild(wrapper);
      nodes.set(track.sid || identity, wrapper);
    };

    room.on(RoomEvent.TrackSubscribed, (track, pub, p) => attach(track, p.identity));
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.sid) {
        const w = nodes.get(track.sid);
        if (w) {
          w.remove();
          nodes.delete(track.sid);
        }
      }
      track.detach().forEach((el: any) => el.remove());
    });
    room.on(RoomEvent.Reconnecting, () => setStatus('Reconnecting media…'));
    room.on(RoomEvent.Reconnected, () => setStatus('Media reconnected'));
    room.on(RoomEvent.Disconnected, () => setStatus('Media disconnected'));
    room.on(RoomEvent.TrackMuted, () => setStatus('A media track was muted'));

    (async () => {
      try {
        const creds = await api(`/sessions/${sid}/media`, token, 'POST');
        if (closed) return;
        await room.connect(creds.url, creds.token);
        if (closed) {
          await room.disconnect();
          return;
        }

        if (!viewer) {
          const tracks = await createLocalTracks({
            audio: phone ? false : { echoCancellation: true, noiseSuppression: true },
            video: {
              facingMode: phone ? 'environment' : 'user',
              resolution: { width: 640, height: 480, frameRate: 15 }
            }
          });

          const localStream = new MediaStream();

          for (const t of tracks) {
            if (closed) {
              t.stop();
              continue;
            }
            await room.localParticipant.publishTrack(t);
            if (t.mediaStreamTrack) {
              localStream.addTrack(t.mediaStreamTrack);
            }
            if (t.kind === 'video') {
              const el = t.attach();
              el.muted = true;
              el.setAttribute('playsinline', '');
              
              const wrapper = document.createElement('div');
              wrapper.className = 'feedWrapper localFeed';
              const badge = document.createElement('div');
              badge.className = 'feedBadge';
              badge.innerText = phone ? 'Phone Rear Camera (Live)' : 'Your Primary Webcam';
              wrapper.appendChild(badge);
              wrapper.appendChild(el);
              host.current?.appendChild(wrapper);
              nodes.set('local-video', wrapper);
            }
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
              setIsRecording(true);
            } catch (recErr) {
              console.warn('MediaRecorder init notice:', recErr);
            }
          }
        }

        setStatus(phone ? 'Phone connected · video only' : viewer ? 'Live inspection feeds connected' : 'Media connected · proctoring active');
        await room.startAudio();
      } catch (e) {
        setStatus((e as Error).message);
      }
    })();

    return () => {
      closed = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
          const chunks = [...recordedChunksRef.current];
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const fd = new FormData();
            fd.append('file', blob, `${sid}.webm`);
            void fetch(`${BASE}/sessions/${sid}/recording/upload`, {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + token },
              body: fd
            });
          }
        } catch (stopErr) {
          console.debug('Recorder stop error:', stopErr);
        }
      }
      room.localParticipant.trackPublications.forEach((p) => p.track?.stop());
      void room.disconnect();
      host.current?.replaceChildren();
    };
  }, [sid, token, phone, viewer]);

  return (
    <section className="media">
      <div className="mediaHeader">
        <div className="mediaStatus">
          <span className="dot" />
          <span>{status}</span>
        </div>
        {isRecording && (
          <span className="pill recPill">
            <span className="recDot" /> REC SESSION
          </span>
        )}
      </div>
      <div ref={host} className="feeds" />
      <small>
        Server actively samples feeds for integrity verification. Camera events are reviewable observations, not cheating verdicts.
      </small>
    </section>
  );
}
