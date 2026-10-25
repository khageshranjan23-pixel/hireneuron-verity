'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, Smartphone, CheckCircle2, AlertCircle, Video, ArrowRight } from 'lucide-react';
import { api } from '@/components/api';
import MediaRoom from '@/components/MediaRoom';

export default function PhonePairingPage() {
  const [nonce, setNonce] = useState('');
  const [accepted, setAccepted] = useState(true);
  const [creds, setCreds] = useState<{ session_id: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // Read from query param or hash fragment
    const params = new URLSearchParams(window.location.search);
    const qNonce = params.get('nonce');
    const hashNonce = location.hash.slice(1);
    const n = qNonce || hashNonce || '';
    if (n) {
      setNonce(n);
      sessionStorage.setItem('verity_phone_nonce', n);
    } else {
      const savedNonce = sessionStorage.getItem('verity_phone_nonce');
      if (savedNonce) setNonce(savedNonce);
    }

    const savedCreds = sessionStorage.getItem('verity_phone');
    if (savedCreds) {
      try {
        setCreds(JSON.parse(savedCreds));
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (!creds) return;
    let failCount = 0;
    const timer = setInterval(() => {
      void api(`/sessions/${creds.session_id}/phone-status`, creds.token)
        .then((r) => {
          failCount = 0;
          if (!r.active) {
            setCreds(null);
            sessionStorage.removeItem('verity_phone');
            setError('Interview ended. Phone camera streaming stopped.');
          }
        })
        .catch(() => {
          failCount++;
          if (failCount >= 4) {
            setCreds(null);
            sessionStorage.removeItem('verity_phone');
            setError('Session ended or disconnected. Please scan QR code again if required.');
          }
        });
    }, 4000);
    return () => clearInterval(timer);
  }, [creds]);

  async function connect() {
    const activeNonce = nonce || sessionStorage.getItem('verity_phone_nonce');
    if (!activeNonce) {
      setError('Missing pairing nonce. Please scan the QR code on your interview screen.');
      return;
    }
    setConnecting(true);
    setError('');
    try {
      const r = await api('/pair/redeem', '', 'POST', { nonce: activeNonce, accepted: true });
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
          <span>RTPL · HireNeuron Verity</span>
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

            <div className="phoneTipsBox">
              <p>💡 <strong>Tip:</strong> Prop your phone upright against a cup or stand at a 45° angle to capture your keyboard and desk area.</p>
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
              Connect this phone as a secondary camera to verify your keyboard and desk workspace.
            </p>

            <div className="phoneRulesBox">
              <div className="ruleItem">
                <span className="ruleDot"></span>
                <span><strong>Microphone is disabled:</strong> Video-only stream (zero audio echo).</span>
              </div>
              <div className="ruleItem">
                <span className="ruleDot"></span>
                <span><strong>Rear Camera:</strong> Captures your desk area.</span>
              </div>
              <div className="ruleItem">
                <span className="ruleDot"></span>
                <span><strong>Encrypted &amp; Sealed:</strong> Streamed directly to your active interview session.</span>
              </div>
            </div>

            <div className="consentNotice">
              <label className="checkboxLabel" style={{ marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>I consent to streaming this secondary camera feed for the duration of this interview.</span>
              </label>
            </div>

            <button
              className="btnLargePrimary"
              disabled={!accepted || connecting}
              onClick={() => void connect()}
              style={{ width: '100%', marginTop: 20 }}
            >
              <span>{connecting ? 'Starting Camera…' : 'Connect Smartphone Camera'}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
