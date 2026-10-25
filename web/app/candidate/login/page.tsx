'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Users, Lock, ArrowRight, AlertCircle, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { api } from '@/components/api';

export default function CandidateLoginPage() {
  const router = useRouter();
  const [candidateCode, setCandidateCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateCode.trim() || !password.trim()) {
      setError('Please provide both Candidate ID and your password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api('/api/auth/candidate/login', '', 'POST', {
        candidate_code: candidateCode.trim().toUpperCase(),
        password: password.trim()
      });

      if (res.token) {
        sessionStorage.setItem('rtpl_token', res.token);
        sessionStorage.setItem('rtpl_candidate', JSON.stringify(res.candidate));
        router.push('/candidate/dashboard');
      } else {
        throw new Error('Authentication response missing token.');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your Candidate ID and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authPageLayout">
      <div className="authContainer">
        <div className="authBrandHeader">
          <Link href="/" className="authBrandLink">
            <div className="brandBadge">
              <ShieldCheck size={22} />
            </div>
            <div>
              <span className="brandName">RTPL</span>
              <span className="brandTag">HireNeuron Verity</span>
            </div>
          </Link>
          <span className="portalBadge candidate">Candidate Portal</span>
        </div>

        <div className="authCard">
          <div className="authCardHeader">
            <div className="authIconWrapper candidate">
              <Users size={24} />
            </div>
            <h2>Candidate Sign In</h2>
            <p>Access your scheduled interview session, test your devices, and start your assessment.</p>
          </div>

          {error && (
            <div className="authErrorAlert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="authForm">
            <div className="formGroup">
              <label htmlFor="candidate-code">Unique Candidate ID</label>
              <input
                id="candidate-code"
                type="text"
                value={candidateCode}
                onChange={(e) => setCandidateCode(e.target.value.toUpperCase())}
                placeholder="e.g. RTPL-CND-000001"
                required
                style={{ textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'monospace' }}
              />
              <span className="fieldHint">Provided in your RTPL interview invitation</span>
            </div>

            <div className="formGroup">
              <div className="labelRow">
                <label htmlFor="candidate-password">Password</label>
              </div>
              <div className="passwordInputWrapper">
                <input
                  id="candidate-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your invitation password"
                  required
                />
                <button
                  type="button"
                  className="togglePasswordBtn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btnAuthSubmit candidateBtn" disabled={loading}>
              {loading ? (
                <span>Checking Credentials…</span>
              ) : (
                <>
                  <span>Sign In to Candidate Portal</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="candidateHelpCard">
            <div className="helpCardHeader">
              <HelpCircle size={16} />
              <strong>Candidate Guidance</strong>
            </div>
            <p>
              Your credentials were generated when the recruiter scheduled your interview. If you need your credentials resent, please reach out to your RTPL talent partner.
            </p>
          </div>

          <div className="authCardFooter">
            <Link href="/" className="backHomeLink">
              ← Back to RTPL Home
            </Link>
            <Link href="/recruiter/login" className="switchPortalLink">
              Recruiter login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
