'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronRight,
  ShieldCheck,
  Video,
  FileText,
  Clock,
  Sparkles,
  ArrowRight,
  RotateCcw,
  AlertCircle,
  Eye,
  CheckCircle2
} from 'lucide-react';
import RecruiterNav from '@/components/RecruiterNav';
import MediaRoom from '@/components/MediaRoom';
import { api, Session } from '@/components/api';

export default function RecruiterInterviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sid = params.id as string;
  const [token, setToken] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLiveFeeds, setShowLiveFeeds] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    const t = sessionStorage.getItem('rtpl_token') || sessionStorage.getItem('verity_recruiter') || '';
    if (!t) {
      router.push('/recruiter/login');
      return;
    }
    setToken(t);
    loadSession(t);
  }, [sid]);

  const loadSession = async (authToken: string) => {
    setLoading(true);
    try {
      const data = await api(`/sessions/${sid}`, authToken);
      setSession(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load session details.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestions = async () => {
    setActionBusy(true);
    try {
      await api(`/sessions/${sid}/questions`, token, 'POST');
      await loadSession(token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleTriggerEvaluation = async () => {
    setActionBusy(true);
    try {
      await api(`/sessions/${sid}/evaluate`, token, 'POST');
      setError('Evaluation queued with Gemini. Results will appear in the Evaluation Report.');
      await loadSession(token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="recruiterLayout">
      <RecruiterNav />

      <main className="recruiterMain">
        <header className="recruiterTopHeader">
          <div>
            <div className="breadcrumb">
              <Link href="/recruiter/interviews">Interviews</Link> <ChevronRight size={14} /> <strong>Session Monitor</strong>
            </div>
            <h1>{session?.config?.candidate_name || 'Interview Session'}</h1>
          </div>

          <div className="topHeaderActions">
            <Link href={`/recruiter/reports/${sid}`} className="btnHeaderAction primary">
              <FileText size={16} />
              <span>View Evaluation Report</span>
            </Link>
            <button onClick={() => loadSession(token)} className="btnHeaderAction secondary">
              <RotateCcw size={15} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <div className="dashboardContent">
          {error && (
            <div className="authErrorAlert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="tableLoading">Loading interview session details…</div>
          ) : !session ? (
            <div className="tableEmptyState">Session not found.</div>
          ) : (
            <>
              {/* Session Overview Card */}
              <div className="sessionMetaCard">
                <div className="metaRow">
                  <div>
                    <span className="metaLabel">Candidate Name</span>
                    <strong>{session.config.candidate_name}</strong>
                  </div>
                  <div>
                    <span className="metaLabel">Position</span>
                    <strong>{session.config.job_title}</strong>
                  </div>
                  <div>
                    <span className="metaLabel">Lifecycle State</span>
                    <span className={`statusPill ${session.state.toLowerCase()}`}>
                      {session.state.replace('_', ' ')}
                    </span>
                  </div>
                  <div>
                    <span className="metaLabel">Question Progress</span>
                    <strong>{session.current + 1} of {session.questions.length}</strong>
                  </div>
                </div>

                <div className="sessionActionBar">
                  {session.state === 'BLUEPRINT_FROZEN' && (
                    <button
                      className="btnPrimary compact"
                      disabled={actionBusy}
                      onClick={handleGenerateQuestions}
                    >
                      <Sparkles size={15} />
                      <span>Generate AI Questions with Gemini</span>
                    </button>
                  )}

                  {['COMPLETED', 'REVIEW_READY'].includes(session.state) && (
                    <button
                      className="btnPrimary compact"
                      disabled={actionBusy}
                      onClick={handleTriggerEvaluation}
                    >
                      <Sparkles size={15} />
                      <span>Evaluate Answers (Gemini Rubric)</span>
                    </button>
                  )}

                  <button
                    className="btnSecondary compact"
                    onClick={() => setShowLiveFeeds(!showLiveFeeds)}
                  >
                    <Video size={15} />
                    <span>{showLiveFeeds ? 'Hide Video Streams' : 'Inspect Live Camera Streams'}</span>
                  </button>

                  <Link href={`/recruiter/reports/${sid}`} className="btnSecondary compact">
                    <FileText size={15} />
                    <span>Candidate Report →</span>
                  </Link>
                </div>
              </div>

              {/* Live WebRTC Camera Streams Inspection */}
              {showLiveFeeds && (
                <div className="contentCard" style={{ marginBottom: 24 }}>
                  <div className="cardHeader">
                    <h4>Live WebRTC Dual-Camera Feed Monitor</h4>
                    <span className="badge">Viewer Mode</span>
                  </div>
                  <MediaRoom viewer sid={sid} token={token} />
                </div>
              )}

              {/* Questions Blueprint List */}
              <div className="contentCard" style={{ marginBottom: 24 }}>
                <div className="cardHeader">
                  <h4>Interview Blueprint Questions ({session.questions.length})</h4>
                  <span className="generationBadge">Source: {session.generation}</span>
                </div>

                <div className="questionsList">
                  {session.questions.map((q, idx) => (
                    <div key={q.id} className="questionItemCard">
                      <div className="qNumBadge">Q{idx + 1}</div>
                      <div className="qContent">
                        <div className="qMetaRow">
                          <span className="qCategoryTag">{q.category}</span>
                          <span className="qSkillTag">{q.skill}</span>
                          <span className={`qStatusTag ${q.status.toLowerCase()}`}>{q.status}</span>
                        </div>
                        <p className="qText">{q.text}</p>
                        {q.followup && (
                          <div className="followupBox">
                            <strong>Contextual Follow-up:</strong> {q.followup}
                          </div>
                        )}
                        {q.spans && q.spans.length > 0 && (
                          <div className="candidateAnswerPreview">
                            <strong>Candidate Spoken Response ({q.spans.length} segments):</strong>
                            <p>{q.spans.map((sp) => sp.text).join(' ')}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proctoring Observations & Coverage */}
              <div className="contentCard">
                <div className="cardHeader">
                  <h4>Computer Vision Proctoring Observations ({session.events.length})</h4>
                  <span className="statusPill low">HMAC-Sealed Chain</span>
                </div>

                {session.events.length === 0 ? (
                  <p className="muted" style={{ padding: '16px 0' }}>
                    No anomalous observations recorded during this session.
                  </p>
                ) : (
                  <div className="tableResponsive">
                    <table className="rtplTable">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Observation Type</th>
                          <th>Severity</th>
                          <th>Camera Source</th>
                          <th>Frames</th>
                          <th>Seal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.events.map((ev) => (
                          <tr key={ev.id}>
                            <td>{Math.round(ev.offset)}s</td>
                            <td><strong>{ev.type}</strong></td>
                            <td>
                              <span className={`statusPill ${ev.severity.toLowerCase().replace('_', '')}`}>
                                {ev.severity}
                              </span>
                            </td>
                            <td>{ev.role} camera</td>
                            <td>{ev.frame_count}</td>
                            <td><code>{ev.seal ? ev.seal.slice(0, 10) + '…' : 'HMAC'}</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
