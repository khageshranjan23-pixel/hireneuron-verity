'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function PhonePairTokenPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  useEffect(() => {
    if (token) {
      router.replace(`/phone?nonce=${encodeURIComponent(token)}`);
    } else {
      router.replace('/phone');
    }
  }, [token, router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#4338ca', fontWeight: 600 }}>Connecting RTPL Smartphone Camera…</p>
    </div>
  );
}
