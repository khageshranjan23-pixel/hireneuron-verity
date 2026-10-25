'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronRight,
  ShieldCheck,
  FileText,
  Download,
  Printer,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Award,
  Video,
  Eye,
  Check,
  X
} from 'lucide-react';
import RecruiterNav from '@/components/RecruiterNav';
import { api, Session } from '@/components/api';

export default function CandidateEvaluationReportPage() {
  const params = useParams();
  const router = useRouter();
  const sid = params.id as string;
  const [token, setToken] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<'assessment' | 'overview' | 'integrity' | 'recording' | 'audit'>('assessment');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = sessionStorage.getItem('rtpl_token') || sessionStorage.getItem('verity_recruiter') || '';
    if (!t) {
      router.push('/recruiter/login');
      return;
    }
    setToken(t);
    loadReport(t);
  }, [sid]);

  const loadReport = async (authToken: string) => {
    setLoading(true);
    try {
      const data = await api(`/sessions/${sid}`, authToken);
      setSession(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/sessions/${sid}/evaluate`, token, 'POST');
      setError('Evaluation initiated with Gemini. Please refresh in a few moments.');
      await loadReport(token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleOverride = async (targetId: string, isEvent = false) => {
    const reason = prompt('Reason for this audit override (minimum 8 characters):');
    if (!reason || reason.trim().length < 8) {
      alert('Audit log policy requires a reason of at least 8 characters.');
      return;
    }

    const value = prompt(
      isEvent
        ? 'Reviewed disposition (confirmed, dismissed, needs_review):'
        : 'Reviewed competency score (1 to 5):'
    );
    if (!value) return;

    try {
      await api(`/sessions/${sid}/override`, token, 'POST', {
        target_id: targetId,
        reason,
        ...(isEvent ? { disposition: value } : { score: Number(value) })
      });
      await loadReport(token);
    } catch (e: any) {
      alert('Override failed: ' + e.message);
    }
  };

  const exportJSON = () => {
    if (!session) return;
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RTPL-Verity-Report-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="recruiterLayout">
      <RecruiterNav />

      <main className="recruiterMain">
        <header className="recruiterTopHeader">
          <div>
            <div className="breadcrumb">
              <Link href="/recruiter/interviews">Interviews</Link> <ChevronRight size={14} /> <strong>Evaluation Report</strong>
            </div>
            <h1>{session?.config?.candidate_name || 'Candidate'} · Assessment Report</h1>
          </div>

          <div className="topHeaderActions">
            {['COMPLETED', 'REVIEW_READY'].includes(session?.state || '') && (
              <button onClick={handleEvaluate} className="btnHeaderAction primary" disabled={busy}>
                <Sparkles size={16} />
                <span>Evaluate with Gemini</span>
              </button>
            )}
            <button onClick={exportJSON} className="btnHeaderAction secondary">
              <Download size={15} />
              <span>Export JSON</span>
            </button>
            <button onClick={() => window.print()} className="btnHeaderAction secondary">
              <Printer size={15} />
              <span>Print / PDF</span>
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
            <div className="tableLoading">Loading candidate assessment report…</div>
          ) : !session ? (
            <div className="tableEmptyState">Report not found.</div>
          ) : (
            <>
              {/* Header Banner */}
              <div className="reportBanner">
                <div className="reportBannerIcon">
                  <Award size={32} />
                </div>
                <div>
                  <h3>RTPL Technical Assessment Review</h3>
                  <p>
                    Position: <strong>{session.config.job_title}</strong> · Questions: <strong>{session.questions.length}</strong> · State: <span className="statusPill completed">{session.state}</span>
                  </p>
                  <small style={{ color: '#64748b' }}>
                    Non-disqualifying AI evaluation. Human recruiters retain full authority to confirm, modify, or override.
                  </small>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="reportTabs">
                <button
                  className={tab === 'assessment' ? 'tab active' : 'tab'}
                  onClick={() => setTab('assessment')}
                >
                  Question-by-Question Evaluation
                </button>
                <button
                  className={tab === 'overview' ? 'tab active' : 'tab'}
                  onClick={() => setTab('overview')}
                >
                  Skill Alignment & Profile
                </button>
                <button
                  className={tab === 'integrity' ? 'tab active' : 'tab'}
                  onClick={() => setTab('integrity')}
                >
                  Proctoring Events ({session.events.length})
                </button>
                <button
                  className={tab === 'recording' ? 'tab active' : 'tab'}
                  onClick={() => setTab('recording')}
                >
                  Session Recording
                </button>
                <button
                  className={tab === 'audit' ? 'tab active' : 'tab'}
                  onClick={() => setTab('audit')}
                >
                  Audit Trail ({session.audit.length})
                </button>
              </div>

              {/* ── TAB 1: QUESTION ASSESSMENT ─────────────────────────────── */}
              {tab === 'assessment' && (
                <div className="reportTabContent">
                  {session.questions.map((q, idx) => {
                    const sc = q.scores;
                    return (
                      <div key={q.id} className="evaluationCard">
                        <div className="evalCardHeader">
                          <div className="evalSlot">Slot {idx + 1} · {q.category.toUpperCase()}</div>
                          <span className="evalSkillTag">{q.skill}</span>
                          <button
                            className="btnOverrideSmall"
                            onClick={() => handleOverride(q.id)}
                            title="Recruiter override score"
                          >
                            ✎ Recruiter Override
                          </button>
                        </div>

                        <h4 className="evalQuestionText">{q.text}</h4>

                        {q.followup && (
                          <div className="followupNotice" style={{ margin: '8px 0 16px' }}>
                            <strong>Follow-up Probe:</strong> {q.followup}
                          </div>
                        )}

                        {/* Spoken Response */}
                        <div className="transcriptExcerpt">
                          <strong>Spoken Candidate Answer ({q.spans.length} segments):</strong>
                          {q.spans.length === 0 ? (
                            <p className="muted">No candidate response recorded for this question.</p>
                          ) : (
                            <p className="transcriptText">
                              "{q.spans.map((sp) => sp.text).join(' ')}"
                            </p>
                          )}
                        </div>

                        {/* Evaluation Breakdown */}
                        {sc && sc.scores ? (
                          <div className="evaluationDetailsBox">
                            <div className="scoresRow">
                              {Object.entries(sc.scores).map(([k, v]) => (
                                <div key={k} className="scorePillBox">
                                  <span className="scoreLabel">{k}</span>
                                  <strong className="scoreVal">{v} / 5</strong>
                                </div>
                              ))}
                            </div>

                            {sc.rationale && (
                              <div className="evalRationale">
                                <strong>Evaluation Rationale:</strong>
                                <p>{sc.rationale}</p>
                              </div>
                            )}

                            {sc.evidence && sc.evidence.length > 0 && (
                              <div className="evidenceQuotes">
                                <strong>Transcript Citations:</strong>
                                <ul>
                                  {sc.evidence.map((ev, i) => (
                                    <li key={i}>"{ev.quote}"</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {sc.strengths && sc.strengths.length > 0 && (
                              <div className="evalStrengths">
                                <strong>Demonstrated Strengths:</strong>
                                <ul>{sc.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                              </div>
                            )}

                            {sc.gaps && sc.gaps.length > 0 && (
                              <div className="evalGaps">
                                <strong>Knowledge Gaps Identified:</strong>
                                <ul>{sc.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="pendingEvalNotice">
                            <span>Pending evaluation. Click "Evaluate with Gemini" above to generate transcript-grounded scores.</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── TAB 2: OVERVIEW & ALIGNMENT ────────────────────────────── */}
              {tab === 'overview' && (
                <div className="reportTabContent">
                  {session.alignment && (
                    <div className="contentCard" style={{ marginBottom: 20 }}>
                      <h4>Job-Candidate Skill Alignment Matrix</h4>
                      <p>{session.alignment.alignment_summary}</p>
                      <div className="skillsPillsWrapper" style={{ marginTop: 12 }}>
                        {session.alignment.matched_skills?.map((s, i) => (
                          <span key={i} className="skillPill" style={{ background: '#dcfce7', color: '#15803d' }}>
                            ✓ {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {session.profile && (
                    <div className="contentCard">
                      <h4>Extracted Candidate Background</h4>
                      <p><strong>Name:</strong> {session.profile.name || session.config.candidate_name}</p>
                      {session.profile.experience && (
                        <div style={{ marginTop: 12 }}>
                          <strong>Experience:</strong>
                          <ul>
                            {session.profile.experience.map((exp, i) => (
                              <li key={i}>{exp.role} at {exp.company} ({exp.duration}): {exp.summary}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 3: PROCTORING INTEGRITY ────────────────────────────── */}
              {tab === 'integrity' && (
                <div className="reportTabContent">
                  <div className="contentCard">
                    <h4>Cryptographic Proctoring Observations</h4>
                    <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                      All events are cryptographically hashed in an HMAC chain. Observations require human review and never auto-disqualify.
                    </p>

                    {session.events.length === 0 ? (
                      <p className="muted">Zero integrity events observed.</p>
                    ) : (
                      <div className="tableResponsive">
                        <table className="rtplTable">
                          <thead>
                            <tr>
                              <th>Time</th>
                              <th>Type</th>
                              <th>Severity</th>
                              <th>Source</th>
                              <th>Snapshot Evidence</th>
                              <th>Recruiter Action</th>
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
                                <td>
                                  <a
                                    href={`/backend/sessions/${sid}/evidence/${ev.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="evidenceLink"
                                  >
                                    View Encrypted Frame →
                                  </a>
                                </td>
                                <td>
                                  <button
                                    className="btnOverrideSmall"
                                    onClick={() => handleOverride(ev.id, true)}
                                  >
                                    Review
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB 4: SESSION RECORDING ───────────────────────────────── */}
              {tab === 'recording' && (
                <div className="reportTabContent">
                  <div className="contentCard">
                    <h4>Full Session Media Recording</h4>
                    {session.recording ? (
                      <div style={{ marginTop: 16 }}>
                        <video
                          controls
                          style={{ width: '100%', maxHeight: 480, borderRadius: 8, background: '#0f172a' }}
                          src={`/backend/sessions/${sid}/recording`}
                        />
                        <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                          File: {session.recording.filename} · Duration: {session.recording.duration_seconds}s · Size: {Math.round(session.recording.size / 1024 / 1024 * 10) / 10} MB
                        </div>
                      </div>
                    ) : (
                      <p className="muted" style={{ padding: '20px 0' }}>
                        No full session recording archived for this interview.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB 5: AUDIT TRAIL ─────────────────────────────────────── */}
              {tab === 'audit' && (
                <div className="reportTabContent">
                  <div className="contentCard">
                    <h4>Human Review & Audit Records</h4>
                    {session.audit.length === 0 ? (
                      <p className="muted">No manual recruiter overrides or reviews recorded yet.</p>
                    ) : (
                      <div className="auditTimeline">
                        {session.audit.map((a) => (
                          <div key={a.id} className="auditItem">
                            <div className="auditHeader">
                              <strong>Reviewer: {a.reviewer}</strong>
                              <span>{a.at ? new Date(a.at * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}</span>
                            </div>
                            <p><strong>Reason:</strong> {a.reason}</p>
                            {a.score !== undefined && <p><strong>Adjusted Score:</strong> {a.score} / 5</p>}
                            {a.disposition && <p><strong>Disposition:</strong> {a.disposition}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
