'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, Smartphone, CheckCircle2, AlertCircle, Video } from 'lucide-react';
import { api } from '../../components/api';
import MediaRoom from '../../components/MediaRoom';

export default function PhonePairingPage() {
  const [nonce, setNonce] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [creds, setCreds] = useState<{ session_id: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // Read from query param or hash
    const params = new URLSearchParams(window.location.search);
    const qNonce = params.get('nonce');
    const hashNonce = location.hash.slice(1);
    const n = qNonce || hashNonce || '';
    if (n) {
      setNonce(n);
      history.replaceState(null, '', location.pathname);
    }
    const saved = sessionStorage.getItem('verity_phone');
    if (saved && !n) {
      try {
        setCreds(JSON.parse(saved));
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (!creds) return;
    const timer = setInterval(() => {
      void api(`/sessions/${creds.session_id}/phone-status`, creds.token)
        .then((r) => {
          if (!r.active) {
            setCreds(null);
            sessionStorage.removeItem('verity_phone');
            setError('Interview ended. Phone camera stopped.');
          }
        })
        .catch(() => {
          setCreds(null);
          sessionStorage.removeItem('verity_phone');
          setError('Session ended or camera disconnected. Please pair again if required.');
        });
    }, 3000);
    return () => clearInterval(timer);
  }, [creds]);

  async function connect() {
    setConnecting(true);
    setError('');
    try {
      const r = await api('/pair/redeem', '', 'POST', { nonce, accepted });
      setCreds(r);
      sessionStorage.setItem('verity_phone', JSON.stringify(r));
    } catch (e) {
      setError((e as Error).message || 'Failed to pair phone. The QR code may have expired (valid for 3 minutes).');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <main className="phoneContainer">
      <header className="phoneHeader">
        <div className="phoneBrand">
          <ShieldCheck size={22} className="brandIconSvg" />
          <span>HireNeuron Verity</span>
        </div>
        <span className="phoneStatusBadge">Secondary Camera</span>
      </header>

      <div className="phoneContentCard">
        {error && (
          <div className="alertBanner">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {creds ? (
          <div className="phoneActiveRoom">
            <div className="phoneRoomTop">
              <CheckCircle2 size={24} style={{ color: '#16a34a' }} />
              <div>
                <strong>Streaming Live to Interview</strong>
                <p className="muted">Rear camera is actively monitoring your workspace.</p>
              </div>
            </div>

            <div className="phoneStreamWrapper">
              <MediaRoom sid={creds.session_id} token={creds.token} phone />
            </div>

            <button
              className="btnSecondary"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => {
                setCreds(null);
                sessionStorage.removeItem('verity_phone');
              }}
            >
              Disconnect Phone Camera
            </button>
          </div>
        ) : (
          <div className="phoneOnboarding">
            <div className="phoneIconCircle">
              <Smartphone size={36} />
            </div>

            <h2>Secondary Workspace Camera</h2>
            <p className="phoneSub">
              Position your phone sideways on your desk to provide visibility of your keyboard, hands, and immediate workspace.
            </p>

            <div className="phoneRulesBox">
              <div className="ruleItem">
                <span className="ruleDot"></span>
                <span>Microphone is permanently disabled on this device (video-only).</span>
              </div>
              <div className="ruleItem">
                <span className="ruleDot"></span>
                <span>Rear camera is used to capture a wide-angle desk view.</span>
              </div>
              <div className="ruleItem">
                <span className="ruleDot"></span>
                <span>Periodic frames are sampled by server proctoring algorithms.</span>
              </div>
            </div>

            <label className="checkboxLabel" style={{ marginTop: 20 }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>I consent to secondary camera streaming and evidence snapshots.</span>
            </label>

            <button
              className="btnLargePrimary"
              disabled={!accepted || !nonce || connecting}
              onClick={() => void connect()}
              style={{ width: '100%', marginTop: 20 }}
            >
              <span>{connecting ? 'Connecting Camera…' : 'Start Camera Stream'}</span>
              <Video size={18} />
            </button>

            {!nonce && (
              <p className="muted center" style={{ fontSize: 12, marginTop: 12 }}>
                Scan the QR code on your laptop screen to initialize pairing.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
