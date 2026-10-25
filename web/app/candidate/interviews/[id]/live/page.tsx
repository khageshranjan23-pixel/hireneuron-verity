'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CandidateInterview from '@/app/interview/page';
import { api } from '@/components/api';

export default function CandidateLiveInterviewPage() {
  const params = useParams();
  const router = useRouter();
  const sid = params.id as string;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const candidateAuthToken = sessionStorage.getItem('rtpl_token') || '';
    const saved = sessionStorage.getItem('verity_candidate') || '';

    if (saved && saved.startsWith(sid + ':')) {
      setReady(true);
      return;
    }

    if (!candidateAuthToken) {
      router.push('/candidate/login');
      return;
    }

    // Auto-enter and acquire token
    api(`/api/candidate/interviews/${sid}/enter`, candidateAuthToken)
      .then((res) => {
        sessionStorage.setItem('verity_candidate', `${res.session_id}:${res.token}`);
        setReady(true);
      })
      .catch((err) => {
        setError(err.message || 'Unable to join interview room.');
      });
  }, [sid]);

  if (error) {
    return (
      <div className="authPageLayout">
        <div className="authCard" style={{ textAlign: 'center', padding: 32 }}>
          <h3 style={{ color: '#ef4444' }}>Interview Access Notice</h3>
          <p style={{ margin: '12px 0 20px', color: '#475569' }}>{error}</p>
          <button onClick={() => router.push('/candidate/dashboard')} className="btnPrimary">
            Return to Candidate Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <p style={{ color: '#4338ca', fontWeight: 600 }}>Connecting to RTPL Live Interview Room…</p>
      </div>
    );
  }

  return <CandidateInterview />;
}
