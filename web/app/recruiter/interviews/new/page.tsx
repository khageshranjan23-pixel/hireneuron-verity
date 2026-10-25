'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Briefcase,
  Users,
  Clock,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  ChevronRight,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Edit2,
  Plus
} from 'lucide-react';
import RecruiterNav from '@/components/RecruiterNav';
import { api, RecruitmentJob, Candidate } from '@/components/api';

export default function ScheduleInterviewWizardPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [step, setStep] = useState(1);
  const [jobs, setJobs] = useState<RecruitmentJob[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Form State across wizard
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');

  const [config, setConfig] = useState({
    title: 'Technical AI Interview',
    question_count: 10, // Defaults to 10 as required by PS
    duration_minutes: 30,
    answer_seconds: 120,
    difficulty: 'intermediate',
    categories: ['technical', 'scenario', 'experience', 'behavioral'],
    custom_questions: '',
    followups: true
  });

  // Scheduling timing
  const defaultDate = new Date();
  defaultDate.setMinutes(defaultDate.getMinutes() + 30);
  const [schedDate, setSchedDate] = useState(defaultDate.toISOString().slice(0, 10));
  const [schedTime, setSchedTime] = useState(defaultDate.toTimeString().slice(0, 5));
  const [timezone] = useState('Asia/Kolkata');

  // Completed result
  const [scheduleResult, setScheduleResult] = useState<any>(null);

  useEffect(() => {
    const t = sessionStorage.getItem('rtpl_token') || sessionStorage.getItem('verity_recruiter') || '';
    if (!t) {
      router.push('/recruiter/login');
      return;
    }
    setToken(t);
    loadPrerequisites(t);
  }, []);

  const loadPrerequisites = async (authToken: string) => {
    setLoading(true);
    try {
      const [jbs, cnds] = await Promise.all([
        api('/api/jobs', authToken),
        api('/api/candidates', authToken)
      ]);
      setJobs(jbs);
      setCandidates(cnds);

      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const qJobId = urlParams?.get('job_id');
      const qCandId = urlParams?.get('candidate_id');

      if (qJobId && jbs.some((j: any) => j.id === qJobId)) {
        setSelectedJobId(qJobId);
      } else if (jbs.length > 0) {
        setSelectedJobId(jbs[0].id);
      }

      if (qCandId && cnds.some((c: any) => c.id === qCandId)) {
        setSelectedCandidateId(qCandId);
      } else if (cnds.length > 0) {
        setSelectedCandidateId(cnds[0].id);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load jobs or candidates.');
    } finally {
      setLoading(false);
    }
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId);

  const handleFinishSchedule = async () => {
    if (!selectedJobId || !selectedCandidateId) {
      setError('Please select both a job opening and a candidate.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Calculate epoch timestamp for scheduled time in selected date and time
      const dateTimeStr = `${schedDate}T${schedTime}:00`;
      const epochTime = new Date(dateTimeStr).getTime() / 1000;

      const customList = config.custom_questions
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);

      const payload = {
        job_id: selectedJobId,
        candidate_id: selectedCandidateId,
        title: config.title,
        scheduled_time: isNaN(epochTime) ? (Date.now() / 1000 + 1800) : epochTime,
        duration_minutes: Number(config.duration_minutes) || 30,
        question_count: Number(config.question_count) || 10,
        answer_seconds: Number(config.answer_seconds) || 120,
        difficulty: config.difficulty,
        categories: config.categories,
        custom_questions: customList,
        followups: config.followups
      };

      const result = await api('/api/interviews', token, 'POST', payload);
      setScheduleResult(result);
      setStep(4); // Advance to completion screen
    } catch (err: any) {
      setError(err.message || 'Failed to create interview schedule.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyInvitationText = () => {
    if (!scheduleResult) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const cand = selectedCandidate;
    const pw = cand?.temp_password_unhashed || cand?.temp_password || 'Provided during registration';
    const text = `RTPL Technical Interview Invitation
Candidate Name: ${scheduleResult.candidate_name || cand?.full_name}
Candidate ID: ${scheduleResult.candidate_code || cand?.candidate_code}
Temporary Password: ${pw}
Position: ${selectedJob?.title || 'Software Engineer'}
Scheduled Date & Time: ${schedDate} at ${schedTime} (Asia/Kolkata IST)
Duration: ${config.duration_minutes} minutes

Candidate Portal: ${origin}/candidate/login
Please sign in to the portal using your Candidate ID and temporary password to complete your device verification and spoken interview.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="recruiterLayout">
      <RecruiterNav />

      <main className="recruiterMain">
        <header className="recruiterTopHeader">
          <div>
            <div className="breadcrumb">
              <Link href="/recruiter/interviews">Interviews</Link> <ChevronRight size={14} /> <strong>New Schedule</strong>
            </div>
            <h1>Schedule Candidate Interview</h1>
          </div>
        </header>

        <div className="dashboardContent">
          {/* Wizard Progress Bar */}
          <div className="wizardProgressBar">
            <div className={`wizardStepItem ${step >= 1 ? 'active' : ''}`}>
              <span className="stepNum">1</span>
              <span className="stepTitle">Job & Candidate</span>
            </div>
            <div className="stepDivider" />
            <div className={`wizardStepItem ${step >= 2 ? 'active' : ''}`}>
              <span className="stepNum">2</span>
              <span className="stepTitle">Questions & Format</span>
            </div>
            <div className="stepDivider" />
            <div className={`wizardStepItem ${step >= 3 ? 'active' : ''}`}>
              <span className="stepNum">3</span>
              <span className="stepTitle">Date & Scheduling</span>
            </div>
            <div className="stepDivider" />
            <div className={`wizardStepItem ${step >= 4 ? 'active' : ''}`}>
              <span className="stepNum">4</span>
              <span className="stepTitle">Invitation Ready</span>
            </div>
          </div>

          {error && (
            <div className="authErrorAlert" style={{ maxWidth: 840, margin: '0 auto 20px' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="formContainerCard" style={{ maxWidth: 840 }}>
            {/* ── STEP 1: SELECT JOB & CANDIDATE ────────────────────────── */}
            {step === 1 && (
              <div className="wizardStepSection">
                <div className="stepHeader">
                  <h3>Step 1 · Select Job Role & Candidate</h3>
                  <p>Choose the target opening and the candidate profile for this interview.</p>
                </div>

                <div className="formGroup">
                  <div className="labelRow">
                    <label>Select Job Opening *</label>
                    <Link href="/recruiter/jobs/new" className="textLinkAction">
                      + Create New Job
                    </Link>
                  </div>
                  {jobs.length === 0 ? (
                    <div className="inlineWarningBox">
                      <span>No jobs configured yet. Please create a job opening first.</span>
                    </div>
                  ) : (
                    <select
                      value={selectedJobId}
                      onChange={(e) => setSelectedJobId(e.target.value)}
                      className="largeSelect"
                    >
                      {jobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.title} — {j.department} ({j.experience_level})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedJob && (
                  <div className="selectionSummaryBox">
                    <strong>Job Competencies:</strong>
                    <div className="skillsPillsWrapper" style={{ marginTop: 6 }}>
                      {selectedJob.required_skills.split(',').map((s, idx) => (
                        <span key={idx} className="skillPill">{s.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="formGroup" style={{ marginTop: 24 }}>
                  <div className="labelRow">
                    <label>Select Candidate *</label>
                    <Link href="/recruiter/candidates" className="textLinkAction">
                      + Register Candidate
                    </Link>
                  </div>
                  {candidates.length === 0 ? (
                    <div className="inlineWarningBox">
                      <span>No candidates registered yet. Please add a candidate profile first.</span>
                    </div>
                  ) : (
                    <select
                      value={selectedCandidateId}
                      onChange={(e) => setSelectedCandidateId(e.target.value)}
                      className="largeSelect"
                    >
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} ({c.candidate_code}) — {c.email}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedCandidate && (
                  <div className="selectionSummaryBox">
                    <div><strong>Candidate ID:</strong> <code>{selectedCandidate.candidate_code}</code></div>
                    <div><strong>Email:</strong> {selectedCandidate.email}</div>
                    {selectedCandidate.phone && <div><strong>Phone:</strong> {selectedCandidate.phone}</div>}
                  </div>
                )}

                <div className="wizardNavActions">
                  <div />
                  <button
                    className="btnPrimary"
                    disabled={!selectedJobId || !selectedCandidateId}
                    onClick={() => setStep(2)}
                  >
                    <span>Next: Interview Structure</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: CONFIGURE INTERVIEW STRUCTURE ──────────────────── */}
            {step === 2 && (
              <div className="wizardStepSection">
                <div className="stepHeader">
                  <h3>Step 2 · Interview Format & Question Parameters</h3>
                  <p>Configure question volume, timing, and mandatory questions.</p>
                </div>

                <div className="formGroup">
                  <label>Interview Title</label>
                  <input
                    type="text"
                    value={config.title}
                    onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  />
                </div>

                <div className="formRow twoCol">
                  <div className="formGroup">
                    <label>Primary Questions Count (Default 10)</label>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={config.question_count}
                      onChange={(e) => setConfig({ ...config, question_count: Number(e.target.value) })}
                    />
                    <span className="fieldHint">Default 10 questions as specified in problem statement</span>
                  </div>

                  <div className="formGroup">
                    <label>Interview Duration (Minutes)</label>
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={config.duration_minutes}
                      onChange={(e) => setConfig({ ...config, duration_minutes: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="formRow twoCol">
                  <div className="formGroup">
                    <label>Answer Limit Per Question (Seconds)</label>
                    <input
                      type="number"
                      min={15}
                      max={300}
                      value={config.answer_seconds}
                      onChange={(e) => setConfig({ ...config, answer_seconds: Number(e.target.value) })}
                    />
                  </div>

                  <div className="formGroup">
                    <label>Target Difficulty</label>
                    <select
                      value={config.difficulty}
                      onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>

                <div className="formGroup">
                  <label>Mandatory Recruiter Questions (One per line)</label>
                  <textarea
                    rows={4}
                    placeholder="Enter any exact questions that must be asked verbatim without AI rewording…"
                    value={config.custom_questions}
                    onChange={(e) => setConfig({ ...config, custom_questions: e.target.value })}
                  />
                  <span className="fieldHint">Recruiter custom questions are permanently locked and asked first.</span>
                </div>

                <div className="checkboxGroup">
                  <label className="checkboxLabel">
                    <input
                      type="checkbox"
                      checked={config.followups}
                      onChange={(e) => setConfig({ ...config, followups: e.target.checked })}
                    />
                    <span>Enable contextual follow-up probing (AI probes deeper on technical claims)</span>
                  </label>
                </div>

                <div className="wizardNavActions">
                  <button className="btnSecondary" onClick={() => setStep(1)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button className="btnPrimary" onClick={() => setStep(3)}>
                    <span>Next: Date & Timing</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 3: SCHEDULE DATE & TIMING ──────────────────────────── */}
            {step === 3 && (
              <div className="wizardStepSection">
                <div className="stepHeader">
                  <h3>Step 3 · Schedule Date & Time</h3>
                  <p>Specify the interview start time in RTPL Standard Timezone (Asia/Kolkata).</p>
                </div>

                <div className="formRow twoCol">
                  <div className="formGroup">
                    <label>Interview Date *</label>
                    <input
                      type="date"
                      value={schedDate}
                      onChange={(e) => setSchedDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="formGroup">
                    <label>Start Time (24h) *</label>
                    <input
                      type="time"
                      value={schedTime}
                      onChange={(e) => setSchedTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="infoNoticeBox">
                  <Clock size={18} />
                  <div>
                    <strong>Timezone Standard: Asia/Kolkata (IST)</strong>
                    <p>The candidate check-in window opens 15 minutes before the scheduled start time.</p>
                  </div>
                </div>

                <div className="summaryReviewCard">
                  <h4>Review Scheduling Summary</h4>
                  <div className="summaryGrid">
                    <div><span>Candidate:</span> <strong>{selectedCandidate?.full_name} ({selectedCandidate?.candidate_code})</strong></div>
                    <div><span>Position:</span> <strong>{selectedJob?.title}</strong></div>
                    <div><span>Questions:</span> <strong>{config.question_count} primary questions</strong></div>
                    <div><span>Duration:</span> <strong>{config.duration_minutes} minutes</strong></div>
                    <div><span>Scheduled:</span> <strong>{schedDate} at {schedTime} IST</strong></div>
                  </div>
                </div>

                <div className="wizardNavActions">
                  <button className="btnSecondary" onClick={() => setStep(2)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    className="btnPrimary"
                    disabled={submitting}
                    onClick={handleFinishSchedule}
                  >
                    {submitting ? 'Creating Interview & Blueprint…' : 'Confirm & Schedule Interview'}
                    <CheckCircle2 size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 4: INVITATION READY & CREDENTIALS ─────────────────── */}
            {step === 4 && scheduleResult && (
              <div className="wizardSuccessScreen">
                <div className="successIcon">
                  <CheckCircle2 size={48} style={{ color: '#16a34a' }} />
                </div>
                <h2>Interview Scheduled Successfully!</h2>
                <p>
                  The interview blueprint has been locked and linked to candidate account{' '}
                  <strong>{scheduleResult.candidate_code}</strong>.
                </p>

                <div className="invitationDetailsCard">
                  <div className="invitationHeader">
                    <ShieldCheck size={20} />
                    <span>Candidate Portal Access Invitation</span>
                  </div>

                  <div className="invitationBody">
                    <div className="invItem">
                      <span>Candidate:</span>
                      <strong>{scheduleResult.candidate_name}</strong>
                    </div>
                    <div className="invItem">
                      <span>Candidate ID:</span>
                      <code>{scheduleResult.candidate_code}</code>
                    </div>
                    <div className="invItem">
                      <span>Position:</span>
                      <strong>{selectedJob?.title}</strong>
                    </div>
                    <div className="invItem">
                      <span>Scheduled:</span>
                      <strong>{schedDate} at {schedTime} IST</strong>
                    </div>
                    <div className="invItem">
                      <span>Portal Link:</span>
                      <span className="portalUrl">{typeof window !== 'undefined' ? window.location.origin : ''}/candidate/login</span>
                    </div>
                  </div>

                  <div className="invitationActions">
                    <button onClick={copyInvitationText} className="btnCopyInvitation">
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copied ? 'Copied to Clipboard!' : 'Copy Candidate Invitation'}</span>
                    </button>
                  </div>
                </div>

                <div className="successFooterActions">
                  <Link href="/recruiter/dashboard" className="btnSecondary">
                    Return to Dashboard
                  </Link>
                  <Link
                    href={`/recruiter/interviews/${scheduleResult.session_id}`}
                    className="btnPrimary"
                  >
                    <span>View Interview Session</span>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
