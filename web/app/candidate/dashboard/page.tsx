'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  Briefcase,
  ShieldCheck,
  Video,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Smartphone,
  Mic,
  Camera
} from 'lucide-react';
import CandidateNav from '@/components/CandidateNav';
import { api, InterviewSchedule } from '@/components/api';

export default function CandidateDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [candidate, setCandidate] = useState<any>(null);
  const [schedules, setSchedules] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = sessionStorage.getItem('rtpl_token') || '';
    if (!t) {
      router.push('/candidate/login');
      return;
    }
    setToken(t);

    const candStr = sessionStorage.getItem('rtpl_candidate');
    if (candStr) {
      try {
        setCandidate(JSON.parse(candStr));
      } catch (_) {}
    }

    loadInterviews(t);
  }, []);

  const loadInterviews = async (authToken: string) => {
    setLoading(true);
    try {
      const data = await api('/api/candidate/interviews', authToken);
      setSchedules(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load assigned interviews.');
    } finally {
      setLoading(false);
    }
  };

  const upcoming = schedules.find((s) => s.status !== 'COMPLETED' && s.status !== 'CANCELLED');
  const past = schedules.filter((s) => s.status === 'COMPLETED' || s.status === 'CANCELLED');

  return (
    <div className="candidatePortalLayout">
      <CandidateNav />

      <main className="candidateMain">
        <div className="candidateContainer">
          {/* Welcome Banner */}
          <section className="candWelcomeBanner">
            <div className="candWelcomeText">
              <span className="candEyebrow">RTPL INTERVIEW PORTAL</span>
              <h1>Welcome, {candidate?.full_name || 'Candidate'}</h1>
              <p>
                Candidate ID: <code>{candidate?.candidate_code || 'RTPL-CND-XXXXXX'}</code>
              </p>
            </div>
          </section>

          {error && (
            <div className="authErrorAlert" style={{ marginBottom: 24 }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="tableLoading">Loading your interview schedule…</div>
          ) : upcoming ? (
            /* Upcoming Interview Hero Card */
            <section className="upcomingInterviewCard">
              <div className="upcomingCardHeader">
                <span className="liveBadge">
                  <span className="liveDot" />
                  Upcoming Assessment
                </span>
                <span className={`statusPill ${upcoming.status.toLowerCase()}`}>
                  {upcoming.status.replace('_', ' ')}
                </span>
              </div>

              <div className="upcomingCardBody">
                <div className="jobRoleHeading">
                  <h2>{upcoming.job_title || 'Software Engineer'}</h2>
                  <span className="companyTag">RTPL · {upcoming.job_department || 'Engineering'}</span>
                </div>

                <div className="scheduleDetailsGrid">
                  <div className="detailItem">
                    <Calendar size={18} />
                    <div>
                      <span className="label">Scheduled Date</span>
                      <strong>
                        {new Date(upcoming.scheduled_time * 1000).toLocaleDateString('en-IN', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: 'Asia/Kolkata'
                        })}
                      </strong>
                    </div>
                  </div>

                  <div className="detailItem">
                    <Clock size={18} />
                    <div>
                      <span className="label">Start Time</span>
                      <strong>
                        {new Date(upcoming.scheduled_time * 1000).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Kolkata'
                        })} (IST)
                      </strong>
                    </div>
                  </div>

                  <div className="detailItem">
                    <Video size={18} />
                    <div>
                      <span className="label">Expected Duration</span>
                      <strong>{upcoming.duration_minutes} minutes</strong>
                    </div>
                  </div>
                </div>

                <div className="onboardingCallout">
                  <ShieldCheck size={24} />
                  <div>
                    <strong>Check-in & Device Setup</strong>
                    <p>
                      You will verify your laptop webcam, microphone, audio playback, and pair your smartphone as a secondary camera before the interview starts.
                    </p>
                  </div>
                </div>

                <div className="upcomingActions">
                  <Link
                    href={`/candidate/interviews/${upcoming.session_id}/setup`}
                    className="btnCandidateCta"
                  >
                    <span>Prepare & Start Interview</span>
                    <ArrowRight size={18} />
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <div className="tableEmptyState" style={{ background: 'white', borderRadius: 12, padding: '48px 24px' }}>
              <CheckCircle2 size={48} style={{ color: '#16a34a', margin: '0 auto 16px' }} />
              <h3>All Scheduled Interviews Completed</h3>
              <p>You have no pending interviews at this time. Thank you for interviewing with RTPL!</p>
            </div>
          )}

          {/* Technical Requirements & Guidelines */}
          <section className="candGuidelinesSection">
            <h3>Technical Requirements & Preparation</h3>
            <div className="guidelinesGrid">
              <div className="guidelineCard">
                <Camera size={24} />
                <h4>Webcam & Microphone</h4>
                <p>Ensure your laptop camera is positioned at eye level in a well-lit environment with clear microphone audio.</p>
              </div>

              <div className="guidelineCard">
                <Smartphone size={24} />
                <h4>Secondary Smartphone Camera</h4>
                <p>Have your smartphone ready to scan a QR code. It provides an environmental view during the session.</p>
              </div>

              <div className="guidelineCard">
                <ShieldCheck size={24} />
                <h4>Autonomous AI Voice Agent</h4>
                <p>Questions will be read out loud. Speak your answers naturally. Real-time captions will verify your speech.</p>
              </div>
            </div>
          </section>

          {/* Past Interviews History */}
          {past.length > 0 && (
            <section className="pastInterviewsSection" style={{ marginTop: 32 }}>
              <h3>Completed Interviews</h3>
              <div className="pastList">
                {past.map((item) => (
                  <div key={item.id} className="pastItemCard">
                    <div>
                      <strong>{item.job_title}</strong>
                      <small style={{ display: 'block', color: '#64748b' }}>
                        {new Date(item.scheduled_time * 1000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="statusPill completed">COMPLETED</span>
                      <button
                        onClick={async () => {
                          try {
                            const t = sessionStorage.getItem('rtpl_token') || '';
                            await api(`/api/candidate/interviews/${item.session_id}/reset`, t, 'POST');
                            router.push(`/candidate/interviews/${item.session_id}/setup`);
                          } catch (_) {
                            router.push(`/candidate/interviews/${item.session_id}/setup`);
                          }
                        }}
                        className="btnSecondary compact"
                        style={{ fontSize: 12, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        🔄 Retake Interview
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
