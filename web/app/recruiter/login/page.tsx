'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Briefcase, Lock, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { api } from '@/components/api';

export default function RecruiterLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('recruiter');
  const [password, setPassword] = useState('RTPLRecruiter2026!');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please provide both username and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api('/api/auth/recruiter/login', '', 'POST', {
        username: username.trim(),
        password: password.trim()
      });

      if (res.token) {
        sessionStorage.setItem('rtpl_token', res.token);
        sessionStorage.setItem('rtpl_user', JSON.stringify(res.user));
        // Also set legacy key for backwards compatibility
        sessionStorage.setItem('verity_recruiter', res.token);
        router.push('/recruiter/dashboard');
      } else {
        throw new Error('Authentication response missing token.');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
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
          <span className="portalBadge recruiter">Recruiter Portal</span>
        </div>

        <div className="authCard">
          <div className="authCardHeader">
            <div className="authIconWrapper recruiter">
              <Briefcase size={24} />
            </div>
            <h2>Sign in to Workspace</h2>
            <p>Access recruitment workflows, candidate pipelines, and interview reviews.</p>
          </div>

          {error && (
            <div className="authErrorAlert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="authForm">
            <div className="formGroup">
              <label htmlFor="recruiter-username">Username or Corporate Email</label>
              <input
                id="recruiter-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. recruiter or talent@rtpl.internal"
                required
              />
            </div>

            <div className="formGroup">
              <div className="labelRow">
                <label htmlFor="recruiter-password">Password</label>
              </div>
              <div className="passwordInputWrapper">
                <input
                  id="recruiter-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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

            <button type="submit" className="btnAuthSubmit primary" disabled={loading}>
              {loading ? (
                <span>Authenticating…</span>
              ) : (
                <>
                  <span>Sign In as Recruiter</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="authHelperNotice">
            <strong>Default Access Credentials:</strong>
            <p>Username: <code>recruiter</code> · Password: <code>RTPLRecruiter2026!</code></p>
            <p>Admin: <code>admin</code> · Password: <code>RTPLAdmin2026!</code></p>
          </div>

          <div className="authCardFooter">
            <Link href="/" className="backHomeLink">
              ← Back to RTPL Home
            </Link>
            <Link href="/candidate/login" className="switchPortalLink">
              Are you a Candidate? Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
