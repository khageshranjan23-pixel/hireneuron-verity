'use client';
import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X,
  Download,
  Copy,
  Edit2,
  Trash2,
  Play,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Clock,
  Briefcase
} from 'lucide-react';
import { api, BASE, Session, CandidateProfile, SkillAlignment } from '../components/api';
import MediaRoom from '../components/MediaRoom';

const seed = {
  candidate_name: '',
  job_title: 'Senior Software Engineer',
  job_description: 'Build reliable distributed backend services, high-throughput APIs, and collaborate on maintainable system architectures using Python, FastAPI, PostgreSQL, and Docker.',
  resume_text: '',
  skills: 'Python, FastAPI, PostgreSQL, Docker, System Design',
  question_count: 10,
  duration_minutes: 25,
  answer_seconds: 120,
  experience_level: 'mid-level',
  difficulty: 'intermediate',
  custom_questions: '',
  followups: true
};

export default function Home() {
  const [token, setToken] = useState('');
  const [key, setKey] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [form, setForm] = useState(seed);
  const [view, setView] = useState<'overview' | 'create' | 'report'>('overview');
  const [tab, setTab] = useState<'overview' | 'assessment' | 'integrity' | 'recording' | 'audit'>('assessment');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [showLive, setShowLive] = useState(false);
  
  // Profile analysis state during creation
  const [analyzingProfile, setAnalyzingProfile] = useState(false);
  const [extractedProfile, setExtractedProfile] = useState<CandidateProfile | null>(null);
  const [skillAlignment, setSkillAlignment] = useState<SkillAlignment | null>(null);
  
  // Question editing state
  const [editingQid, setEditingQid] = useState<string | null>(null);
  const [editQText, setEditQText] = useState('');

  useEffect(() => {
    setToken(sessionStorage.getItem('verity_recruiter') || '');
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => setRows(await api('/sessions', token));

  useEffect(() => {
    if (token) void run(refresh);
  }, [token]);

  const open = async (id: string) => {
    const s = await api('/sessions/' + id, token);
    setSelected(s);
    setView('report');
    setShowLive(false);
  };

  async function handleAnalyzeProfile() {
    if (!form.resume_text.trim()) {
      setError('Please upload a resume or paste resume text first.');
      return;
    }
    setAnalyzingProfile(true);
    setError('');
    try {
      const skillsList = form.skills.split(',').map((x) => x.trim()).filter(Boolean);
      const res = await api('/documents/analyze-profile', token, 'POST', {
        resume_text: form.resume_text,
        job_description: form.job_description,
        skills: skillsList
      });
      if (res.profile) {
        setExtractedProfile(res.profile);
        if (res.profile.name && !form.candidate_name) {
          setForm((f) => ({ ...f, candidate_name: res.profile.name }));
        }
      }
      if (res.alignment) {
        setSkillAlignment(res.alignment);
      }
    } catch (e) {
      setError('Profile analysis notice: ' + (e as Error).message);
    } finally {
      setAnalyzingProfile(false);
    }
  }

  async function create() {
    const skillsList = form.skills.split(',').map((x) => x.trim()).filter(Boolean);
    const customList = form.custom_questions.split('\n').filter((x) => x.trim());
    const r = await api('/sessions', token, 'POST', {
      ...form,
      skills: skillsList,
      custom_questions: customList,
      question_count: Number(form.question_count) || 10,
      categories: ['technical', 'scenario', 'experience', 'behavioral'],
      candidate_profile: extractedProfile,
      skill_alignment: skillAlignment
    });
    setLink(`${location.origin}/interview#${r.session.id}:${r.candidate_token}`);
    setSelected(r.session);
    await refresh();
    setView('report');
  }

  async function extract(file: File) {
    const data = new FormData();
    data.append('file', file);
    const r = await api('/documents/extract', token, 'POST', data);
    setForm((f) => ({ ...f, resume_text: r.text }));
    if (r.needs_ocr) setError('This document may contain scanned images. Verify text before generating questions.');
    // Trigger profile analysis
    setTimeout(() => {
      void handleAnalyzeProfile();
    }, 200);
  }

  async function saveQuestionEdit(qid: string) {
    if (!selected) return;
    await api(`/sessions/${selected.id}/questions/${qid}`, token, 'PATCH', { text: editQText });
    setEditingQid(null);
    await open(selected.id);
  }

  async function override(id: string, isEvent = false) {
    const reason = prompt('Reason for this audit override (at least 8 characters):');
    if (!reason || reason.length < 8) {
      alert('Audit trail requires an explanatory reason of at least 8 characters.');
      return;
    }
    const value = prompt(isEvent ? 'Reviewed disposition (confirmed, dismissed, needs_review):' : 'Reviewed overall score (1 to 5):');
    if (!value) return;
    await api(`/sessions/${selected!.id}/override`, token, 'POST', {
      target_id: id,
      reason,
      ...(isEvent ? { disposition: value } : { score: Number(value) })
    });
    await open(selected!.id);
  }

  const completed = rows.filter((r) => ['COMPLETED', 'REVIEW_READY'].includes(r.state)).length;

  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          <div className="brandIcon">
            <ShieldCheck size={25} />
          </div>
          <span>
            HireNeuron<small>VERITY WORKSPACE</small>
          </span>
        </a>

        <div className="workspace">
          <span className="avatar">HN</span>
          <div>
            Recruiter Dashboard<small>Autonomous AI Interviewing</small>
          </div>
        </div>

        <div className="navLabel">WORKSPACE</div>
        <button className={view === 'overview' ? 'nav active' : 'nav'} onClick={() => setView('overview')}>
          <LayoutDashboard size={18} /> Overview
        </button>
        <button className={view === 'create' ? 'nav active' : 'nav'} onClick={() => setView('create')}>
          <Plus size={18} /> New interview
        </button>

        <div className="asideBottom">
          <ShieldCheck size={22} />
          <strong>Evidence-First Hiring.</strong>
          <p>AI assists the interview and evaluation.<br />Humans make the hiring decisions.</p>
          <span className="pill">Auditable · Non-disqualifying</span>
        </div>
      </aside>

      <main>
        <header>
          <span>
            Workspace <ChevronRight size={14} />{' '}
            {view === 'create' ? 'Configure Interview' : view === 'report' ? 'Candidate Review' : 'Overview'}
          </span>
          <div className="headerRight">
            <span className="dot" />
            Live System Active <span className="avatar">HR</span>
          </div>
        </header>

        {!token ? (
          <section className="login card">
            <div className="eyebrow">SECURE WORKSPACE LOGIN</div>
            <h1>Welcome to Verity.</h1>
            <p>Enter the recruiter bearer token generated during environment setup.</p>
            <input
              type="password"
              placeholder="Paste RECRUITER_TOKEN..."
              aria-label="Recruiter token"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button
              className="primary"
              onClick={() => {
                sessionStorage.setItem('verity_recruiter', key);
                setToken(key);
              }}
            >
              Open workspace <ArrowRight size={16} />
            </button>
          </section>
        ) : (
          <>
            {error && (
              <div role="alert" className="error">
                {error}
                <button onClick={() => setError('')} aria-label="Dismiss error">
                  <X size={16} />
                </button>
              </div>
            )}
            {busy && <div className="working" role="status">Processing…</div>}

            {view === 'overview' && (
              <div className="content">
                <div className="pageHeading">
                  <div>
                    <div className="eyebrow">INTELLIGENT SCREENING</div>
                    <h1>Every answer. Backed by evidence.</h1>
                    <p>Autonomous AI video interviews with real-time speech, dual-camera proctoring, and grounded evaluation.</p>
                  </div>
                  <button className="primary" onClick={() => setView('create')}>
                    <Plus size={18} /> Create interview
                  </button>
                </div>

                <div className="hero">
                  <div>
                    <span className="heroTag">
                      <Sparkles size={14} /> EVIDENCE-FIRST RECRUITING
                    </span>
                    <h2>
                      Intelligent screening.<br />Unbiased evaluation.
                    </h2>
                    <p>
                      Generate grounded blueprints from job descriptions and resumes.<br />
                      Evaluate candidate responses with transcript citations.
                    </p>
                    <button onClick={() => setView('create')}>
                      Set up your next interview <ArrowRight size={17} />
                    </button>
                  </div>
                  <div className="heroArt">
                    <div className="orb">
                      <ShieldCheck size={68} />
                    </div>
                    <div className="floating f1">
                      <Check size={16} /> Transcript-grounded
                    </div>
                    <div className="floating f2">
                      <Video size={16} /> Two perspectives
                    </div>
                    <div className="floating f3">
                      <Users size={16} /> Human decisions
                    </div>
                  </div>
                </div>

                <div className="stats">
                  {[
                    [Users, 'Interviews Created', rows.length],
                    [Activity, 'In Progress', rows.filter((r) => r.state === 'LISTENING').length],
                    [FileText, 'Completed & Evaluated', completed]
                  ].map(([Icon, label, value]: any, i) => (
                    <div className="card stat" key={i}>
                      <div>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                      <Icon size={23} />
                    </div>
                  ))}
                </div>

                <section className="card tableCard">
                  <div className="sectionHeading">
                    <div>
                      <h3>Active Interview Sessions</h3>
                      <p>From initial blueprint to proctoring evidence and evaluation.</p>
                    </div>
                    <button className="secondary" onClick={() => void run(refresh)}>
                      Refresh
                    </button>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Job Role</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} onClick={() => void run(() => open(r.id))}>
                          <td>
                            <span className="miniAvatar">{r.candidate.slice(0, 2).toUpperCase()}</span>
                            <strong>{r.candidate}</strong>
                          </td>
                          <td>{r.role}</td>
                          <td>
                            <span className="pill" style={{
                              background: r.state === 'REVIEW_READY' ? '#ecfdf5' : r.state === 'LISTENING' ? '#eff6ff' : '#f8fafc',
                              color: r.state === 'REVIEW_READY' ? '#047857' : r.state === 'LISTENING' ? '#1d4ed8' : '#475569'
                            }}>
                              {r.state.replaceAll('_', ' ')}
                            </span>
                          </td>
                          <td>{new Date(r.created_at * 1000).toLocaleDateString()}</td>
                          <td>
                            <ArrowRight size={16} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!rows.length && (
                    <div className="empty">
                      <FileText size={32} />
                      <h3>No interviews created yet.</h3>
                      <p>Upload a job description and resume to create your first interview blueprint.</p>
                      <button className="secondary" onClick={() => setView('create')}>
                        Create interview
                      </button>
                    </div>
                  )}
                </section>

                <div className="footNote">
                  <ShieldCheck size={16} />
                  Proctoring observations are separate from candidate scoring. No automatic disqualification.
                </div>
              </div>
            )}

            {view === 'create' && (
              <div className="content">
                <div className="pageHeading">
                  <div>
                    <div className="eyebrow">INTERVIEW BUILDER</div>
                    <h1>Create Interview Blueprint</h1>
                    <p>Ground questions in job requirements and candidate claims with automatic skill alignment.</p>
                  </div>
                </div>

                <div className="configGrid">
                  <section className="card form">
                    <h3>01 · Role & Candidate Requirements</h3>

                    <label>
                      Candidate Name
                      <input
                        value={form.candidate_name}
                        placeholder="e.g. Jane Doe"
                        onChange={(e) => setForm({ ...form, candidate_name: e.target.value })}
                      />
                    </label>

                    <label>
                      Job Title
                      <input
                        value={form.job_title}
                        onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                      />
                    </label>

                    <label>
                      Required Skills (Comma separated)
                      <input
                        value={form.skills}
                        onChange={(e) => setForm({ ...form, skills: e.target.value })}
                      />
                    </label>

                    <label>
                      Job Description
                      <textarea
                        rows={4}
                        value={form.job_description}
                        onChange={(e) => setForm({ ...form, job_description: e.target.value })}
                      />
                    </label>

                    <label className="upload">
                      <strong>Upload Candidate Resume (PDF or DOCX)</strong>
                      <p style={{ margin: '4px 0 10px', fontSize: 12 }}>
                        Extracts text and runs semantic skill alignment against the job description.
                      </p>
                      <input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={(e) => e.target.files?.[0] && void run(() => extract(e.target.files![0]))}
                      />
                    </label>

                    <label>
                      Verified Resume Text
                      <textarea
                        rows={6}
                        value={form.resume_text}
                        placeholder="Extracted text will appear here. You can also paste resume text directly."
                        onChange={(e) => setForm({ ...form, resume_text: e.target.value })}
                      />
                    </label>

                    <button
                      type="button"
                      className="secondary full"
                      disabled={analyzingProfile || !form.resume_text.trim()}
                      onClick={() => void run(handleAnalyzeProfile)}
                    >
                      <Sparkles size={16} />
                      {analyzingProfile ? 'Analyzing profile with Gemini…' : 'Extract Profile & Analyze Skill Alignment'}
                    </button>

                    {skillAlignment && (
                      <div className="notice" style={{ background: '#f8fafc', borderColor: '#e2e8f0', marginTop: 16 }}>
                        <strong style={{ color: '#0f172a' }}>Skill Alignment Matrix (JD vs Resume)</strong>
                        <p style={{ fontSize: 12, margin: '4px 0 10px' }}>{skillAlignment.alignment_summary}</p>
                        
                        <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
                          <div>
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Matched in Resume: </span>
                            {skillAlignment.matched_skills?.length ? (
                              skillAlignment.matched_skills.map((s, i) => (
                                <span key={i} className="pill" style={{ background: '#dcfce7', color: '#15803d', margin: 2 }}>{s}</span>
                              ))
                            ) : <span className="muted">None detected</span>}
                          </div>

                          <div>
                            <span style={{ color: '#2563eb', fontWeight: 600 }}>+ Additional Claimed Skills: </span>
                            {skillAlignment.claimed_skills?.length ? (
                              skillAlignment.claimed_skills.slice(0, 8).map((s, i) => (
                                <span key={i} className="pill" style={{ background: '#dbeafe', color: '#1e40af', margin: 2 }}>{s}</span>
                              ))
                            ) : <span className="muted">None detected</span>}
                          </div>

                          <div>
                            <span style={{ color: '#d97706', fontWeight: 600 }}>⚠ JD Gaps (To Probe in Interview): </span>
                            {skillAlignment.missing_skills?.length ? (
                              skillAlignment.missing_skills.map((s, i) => (
                                <span key={i} className="pill" style={{ background: '#fef3c7', color: '#92400e', margin: 2 }}>{s}</span>
                              ))
                            ) : <span className="muted">All core requirements evidenced</span>}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="card form">
                    <h3>02 · Interview Structure & Timing</h3>

                    <div className="twoCol">
                      <label>
                        Question Count
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={form.question_count}
                          onChange={(e) => setForm({ ...form, question_count: Number(e.target.value) })}
                        />
                      </label>

                      <label>
                        Duration (Minutes)
                        <input
                          type="number"
                          min={2}
                          max={120}
                          value={form.duration_minutes}
                          onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                        />
                      </label>
                    </div>

                    <div className="twoCol">
                      <label>
                        Answer Limit (Sec)
                        <input
                          type="number"
                          min={15}
                          max={300}
                          value={form.answer_seconds}
                          onChange={(e) => setForm({ ...form, answer_seconds: Number(e.target.value) })}
                        />
                      </label>

                      <label>
                        Difficulty
                        <select
                          value={form.difficulty}
                          onChange={(e) => setForm({ ...form, difficulty: e.target.value as any })}
                        >
                          <option>beginner</option>
                          <option>intermediate</option>
                          <option>advanced</option>
                        </select>
                      </label>
                    </div>

                    <label>
                      Experience Level
                      <input
                        value={form.experience_level}
                        onChange={(e) => setForm({ ...form, experience_level: e.target.value })}
                      />
                    </label>

                    <label>
                      Mandatory Recruiter Questions (One per line)
                      <textarea
                        rows={4}
                        placeholder="Add custom questions that must be asked verbatim..."
                        value={form.custom_questions}
                        onChange={(e) => setForm({ ...form, custom_questions: e.target.value })}
                      />
                    </label>

                    <label className="check">
                      <input
                        type="checkbox"
                        checked={form.followups}
                        onChange={(e) => setForm({ ...form, followups: e.target.checked })}
                      />
                      Enable contextual follow-up probing (Max 1 per primary question)
                    </label>

                    <div className="notice">
                      <strong>Deterministic Rule:</strong> Primary question count defaults to 10. Recruiter questions remain locked verbatim. AI questions are grounded in the JD and resume.
                    </div>

                    <button
                      className="primary full"
                      disabled={busy || !form.candidate_name.trim()}
                      onClick={() => void run(create)}
                    >
                      Freeze blueprint & generate invitation <ArrowRight size={16} />
                    </button>
                  </section>
                </div>
              </div>
            )}

            {view === 'report' && selected && (
              <div className="content">
                <div className="pageHeading">
                  <div>
                    <div className="eyebrow">INTERVIEW REVIEW & REPORT</div>
                    <h1>{selected.config.candidate_name}</h1>
                    <p>
                      {selected.config.job_title} · {selected.questions.length} Questions ·{' '}
                      {selected.config.duration_minutes} min limit · State:{' '}
                      <strong style={{ color: '#4338ca' }}>{selected.state.replaceAll('_', ' ')}</strong>
                    </p>
                  </div>
                  <span
                    className="pill"
                    style={{
                      fontSize: 12,
                      padding: '6px 12px',
                      background: selected.state === 'REVIEW_READY' ? '#ecfdf5' : '#eef2ff',
                      color: selected.state === 'REVIEW_READY' ? '#047857' : '#4338ca'
                    }}
                  >
                    {selected.state.replaceAll('_', ' ')}
                  </span>
                </div>

                {link && (
                  <div className="notice" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
                    <strong>Private Candidate Invitation Link</strong>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input readOnly value={link} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                      <button
                        className="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(link);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <small style={{ marginTop: 6, color: '#64748b' }}>
                      Token is stored in the URL fragment (#) so it never leaks into HTTP server logs.
                    </small>
                  </div>
                )}

                <div className="toolbar">
                  <button className="secondary" onClick={() => void run(() => open(selected.id))}>
                    Refresh
                  </button>

                  {selected.state === 'BLUEPRINT_FROZEN' && (
                    <button
                      className="primary"
                      onClick={() =>
                        void run(async () => {
                          await api(`/sessions/${selected.id}/questions`, token, 'POST');
                          await open(selected.id);
                        })
                      }
                    >
                      <Sparkles size={16} /> Generate AI questions (Gemini)
                    </button>
                  )}

                  {['COMPLETED', 'REVIEW_READY'].includes(selected.state) && (
                    <button
                      className="primary"
                      onClick={() =>
                        void run(async () => {
                          await api(`/sessions/${selected.id}/evaluate`, token, 'POST');
                          setError('Evaluation queued. The evaluation worker will process the transcript. Refresh in a few seconds.');
                        })
                      }
                    >
                      <Sparkles size={16} /> Evaluate answers with Gemini
                    </button>
                  )}

                  <button
                    className="secondary"
                    onClick={() => {
                      const b = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
                      const u = URL.createObjectURL(b);
                      const a = document.createElement('a');
                      a.href = u;
                      a.download = `verity-report-${selected.id}.json`;
                      a.click();
                      URL.revokeObjectURL(u);
                    }}
                  >
                    <Download size={16} /> Export JSON
                  </button>

                  <button className="secondary" onClick={() => window.print()}>
                    Print / Save PDF
                  </button>

                  <button className="secondary" onClick={() => setShowLive((v) => !v)}>
                    <Video size={16} /> {showLive ? 'Hide live feeds' : 'Inspect live feeds'}
                  </button>
                </div>

                {showLive && (
                  <div style={{ marginBottom: 24 }}>
                    <MediaRoom viewer sid={selected.id} token={token} />
                  </div>
                )}

                <div className="reviewBanner">
                  <ShieldCheck size={32} />
                  <div>
                    <strong>Evidence-First Assessment & Human Decision Policy</strong>
                    <p>
                      Question Source: <strong>{selected.generation}</strong>. AI provides transcript-grounded scores and
                      computer-vision observations. Recruiters retain full authority to review, confirm, or override.
                    </p>
                  </div>
                </div>

                <div className="tabs">
                  {[
                    ['overview', 'Overview & Fit'],
                    ['assessment', 'Question Evaluation'],
                    ['integrity', `Proctoring Events (${selected.events.length})`],
                    ['recording', 'Session Recording'],
                    ['audit', `Audit Trail (${selected.audit.length})`]
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      className={tab === k ? 'selected' : ''}
                      onClick={() => setTab(k as any)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === 'overview' && (
                  <div style={{ display: 'grid', gap: 20 }}>
                    {selected.alignment && (
                      <section className="card">
                        <h3>Job-Candidate Skill Alignment</h3>
                        <p style={{ fontSize: 13, color: '#334155' }}>{selected.alignment.alignment_summary}</p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 14 }}>
                          <div style={{ padding: 14, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                            <strong style={{ color: '#166534', display: 'block', marginBottom: 8 }}>✓ Matched Required Skills</strong>
                            {selected.alignment.matched_skills?.map((s, i) => (
                              <span key={i} className="pill" style={{ background: '#dcfce7', color: '#15803d', margin: 3 }}>{s}</span>
                            ))}
                          </div>

                          <div style={{ padding: 14, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                            <strong style={{ color: '#1e40af', display: 'block', marginBottom: 8 }}>+ Claimed Resume Skills</strong>
                            {selected.alignment.claimed_skills?.map((s, i) => (
                              <span key={i} className="pill" style={{ background: '#dbeafe', color: '#1e40af', margin: 3 }}>{s}</span>
                            ))}
                          </div>

                          <div style={{ padding: 14, background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                            <strong style={{ color: '#92400e', display: 'block', marginBottom: 8 }}>⚠ JD Gaps (Interview Focus)</strong>
                            {selected.alignment.missing_skills?.map((s, i) => (
                              <span key={i} className="pill" style={{ background: '#fef3c7', color: '#92400e', margin: 3 }}>{s}</span>
                            ))}
                          </div>
                        </div>
                      </section>
                    )}

                    {selected.profile && (
                      <section className="card">
                        <h3>Extracted Candidate Profile</h3>
                        <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                          <p><strong>Name:</strong> {selected.profile.name || selected.config.candidate_name}</p>
                          {selected.profile.email && <p><strong>Email:</strong> {selected.profile.email}</p>}
                          {selected.profile.experience?.length ? (
                            <div>
                              <strong>Experience:</strong>
                              <ul style={{ margin: '6px 0', paddingLeft: 20 }}>
                                {selected.profile.experience.map((exp, i) => (
                                  <li key={i}>
                                    <strong>{exp.role}</strong> at {exp.company} ({exp.duration}): {exp.summary}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {selected.profile.education?.length ? (
                            <div>
                              <strong>Education:</strong>
                              <ul style={{ margin: '6px 0', paddingLeft: 20 }}>
                                {selected.profile.education.map((edu, i) => (
                                  <li key={i}>{edu.degree} — {edu.institution} ({edu.year})</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {selected.profile.certifications?.length ? (
                            <p><strong>Certifications:</strong> {selected.profile.certifications.join(', ')}</p>
                          ) : null}
                        </div>
                      </section>
                    )}
                  </div>
                )}

                {tab === 'assessment' && (
                  <div>
                    {selected.questions.map((q) => (
                      <section className="card questionCard" key={q.id}>
                        <div className="questionTop">
                          <span className="questionNumber">{String(q.slot).padStart(2, '0')}</span>
                          <span className="pill" style={{ textTransform: 'capitalize' }}>
                            {q.category} · {q.status}
                          </span>
                          <span className="muted">
                            Focus: {q.skill} {q.locked ? ' · Recruiter locked' : ''}
                          </span>

                          {selected.state === 'BLUEPRINT_FROZEN' && editingQid !== q.id && (
                            <button
                              className="secondary"
                              style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}
                              onClick={() => {
                                setEditingQid(q.id);
                                setEditQText(q.text);
                              }}
                            >
                              <Edit2 size={12} /> Edit question
                            </button>
                          )}
                        </div>

                        {editingQid === q.id ? (
                          <div style={{ margin: '12px 0' }}>
                            <textarea
                              rows={3}
                              value={editQText}
                              onChange={(e) => setEditQText(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button className="primary" onClick={() => void saveQuestionEdit(q.id)}>
                                Save Question
                              </button>
                              <button className="secondary" onClick={() => setEditingQid(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <h3>{q.text}</h3>
                        )}

                        {q.followup && (
                          <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 6, margin: '10px 0', fontSize: 13 }}>
                            <strong style={{ color: '#1e40af' }}>Contextual Follow-up Asked:</strong> {q.followup}
                          </div>
                        )}

                        <div className="answer">
                          <strong>Candidate Response Transcript:</strong>
                          {q.spans.length ? (
                            q.spans.map((s) => (
                              <p key={s.id} style={{ margin: '6px 0' }}>
                                <small style={{ color: '#6366f1', marginRight: 6 }}>
                                  [{Math.floor(s.offset)}s · {s.phase} · {s.id.slice(0, 8)}]:
                                </small>
                                {s.text}
                              </p>
                            ))
                          ) : (
                            <p className="muted" style={{ fontStyle: 'italic', margin: '4px 0' }}>
                              No verbal or text response recorded.
                            </p>
                          )}
                        </div>

                        {q.scores ? (
                          <div style={{ marginTop: 14 }}>
                            <div className="scoreRow">
                              {Object.entries(q.scores.scores || {}).map(([k, v]) => (
                                <div key={k}>
                                  <span>{k}</span>
                                  <strong>
                                    {v}
                                    <small>/5</small>
                                  </strong>
                                </div>
                              ))}
                            </div>

                            <p style={{ margin: '10px 0' }}>
                              <strong>Evaluation Rationale:</strong> {q.scores.rationale}
                            </p>

                            {q.scores.demonstrated_concepts?.length ? (
                              <div style={{ margin: '8px 0' }}>
                                <strong style={{ fontSize: 12 }}>Demonstrated Concepts: </strong>
                                {q.scores.demonstrated_concepts.map((c, i) => (
                                  <span key={i} className="pill" style={{ background: '#f1f5f9', margin: 2 }}>{c}</span>
                                ))}
                              </div>
                            ) : null}

                            {q.scores.evidence?.length ? (
                              <div style={{ margin: '10px 0' }}>
                                <strong style={{ fontSize: 12 }}>Verified Transcript Citations:</strong>
                                {q.scores.evidence.map((e, i) => (
                                  <blockquote key={i}>
                                    “{e.quote}”
                                    <small>Citation verified from Span {e.span_id.slice(0, 8)}</small>
                                  </blockquote>
                                ))}
                              </div>
                            ) : null}

                            {q.scores.gaps?.length ? (
                              <p style={{ color: '#b45309', fontSize: 12 }}>
                                <strong>Model-Inferred Gaps:</strong> {q.scores.gaps.join('; ')}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="muted" style={{ fontStyle: 'italic' }}>
                            Assessment not yet generated. Click "Evaluate answers" above.
                          </p>
                        )}

                        <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                          <button className="secondary" onClick={() => void run(() => override(q.id))}>
                            Override / adjust score
                          </button>
                        </div>

                        {selected.audit
                          .filter((a) => a.target_id === q.id)
                          .map((a) => (
                            <div
                              key={a.id}
                              className="notice"
                              style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e', marginTop: 8 }}
                            >
                              <strong>Reviewer Override:</strong> Score set to {a.score}/5 · Reason: {a.reason}
                            </div>
                          ))}
                      </section>
                    ))}
                  </div>
                )}

                {tab === 'integrity' && (
                  <div>
                    <div className="notice">
                      <strong>Server-Verified Proctoring Protocol</strong>
                      <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                        Both laptop and secondary smartphone feeds are sampled by an independent server process at ~1 FPS.
                        Events are recorded as reviewable observations. No candidate is ever automatically disqualified.
                      </p>
                    </div>

                    <div className="stats" style={{ margin: '16px 0' }}>
                      {['integrity', 'voice'].map((w) => {
                        const rec = selected.coverage[w];
                        const alive = rec && Date.now() / 1000 - rec.received_at < 12;
                        return (
                          <div className="card" key={w}>
                            <h3 style={{ textTransform: 'capitalize' }}>{w} Worker Coverage</h3>
                            <p style={{ color: alive ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                              {alive ? '✓ Actively Monitoring' : '⚠ UNVERIFIED · No recent heartbeat'}
                            </p>
                            <small className="muted">Algorithm: {rec?.algorithm || 'none'}</small>
                          </div>
                        );
                      })}
                    </div>

                    {!selected.events.length ? (
                      <div className="card empty">
                        <CheckCircle2 size={36} style={{ color: '#16a34a', marginBottom: 12 }} />
                        <h3>No proctoring incidents logged.</h3>
                        <p>No sustained face absences or secondary people detected during monitored intervals.</p>
                      </div>
                    ) : (
                      selected.events.map((e) => (
                        <div className="card event" key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                              <span
                                className="pill"
                                style={{
                                  background: e.severity === 'NEEDS_REVIEW_HIGH' ? '#fee2e2' : e.severity === 'NEEDS_REVIEW' ? '#fef3c7' : '#f1f5f9',
                                  color: e.severity === 'NEEDS_REVIEW_HIGH' ? '#991b1b' : e.severity === 'NEEDS_REVIEW' ? '#92400e' : '#475569'
                                }}
                              >
                                {e.severity}
                              </span>
                              <span className="pill" style={{ textTransform: 'uppercase' }}>{e.role} camera</span>
                            </div>
                            <h3>{e.type.replaceAll('_', ' ')}</h3>
                            <p style={{ fontSize: 12, margin: '4px 0' }}>
                              Timestamp offset: <strong>{Math.round(e.offset)}s</strong> into interview · Sampled frames: {e.frame_count}
                            </p>
                            {e.seal && <small style={{ color: '#64748b', fontFamily: 'monospace' }}>HMAC Seal: {e.seal.slice(0, 16)}…</small>}
                          </div>

                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="secondary"
                              onClick={() =>
                                void run(async () => {
                                  const r = await fetch(`${BASE}/sessions/${selected.id}/evidence/${e.id}`, {
                                    headers: { Authorization: 'Bearer ' + token }
                                  });
                                  if (!r.ok) throw new Error('Evidence snapshot unavailable');
                                  const u = URL.createObjectURL(await r.blob());
                                  window.open(u, '_blank', 'noopener');
                                  setTimeout(() => URL.revokeObjectURL(u), 60000);
                                })
                              }
                            >
                              <Eye size={14} /> Open snapshot
                            </button>

                            <button className="secondary" onClick={() => void run(() => override(e.id, true))}>
                              Review incident
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {tab === 'recording' && (
                  <section className="card">
                    <h3>Interview Session Video Recording</h3>
                    <p style={{ fontSize: 13 }}>
                      Play back the recorded session. Video playback includes seek shortcuts to logged proctoring timestamps.
                    </p>

                    {selected.recording ? (
                      <div style={{ marginTop: 16 }}>
                        <video
                          controls
                          style={{ width: '100%', maxHeight: 480, borderRadius: 8, background: '#0f172a' }}
                          src={`${BASE}/sessions/${selected.id}/recording`}
                        />

                        <div style={{ marginTop: 16, display: 'grid', gap: 8, fontSize: 12 }}>
                          <p><strong>Recording File:</strong> {selected.recording.filename}</p>
                          <p><strong>Capture Scope & Provenance:</strong> {selected.recording.provenance || 'Consented candidate laptop browser MediaRecorder capture (primary camera + microphone)'}</p>
                          {selected.recording.duration_seconds !== undefined && (
                            <p><strong>Duration:</strong> {selected.recording.duration_seconds} seconds</p>
                          )}
                          <p><strong>SHA-256 Checksum:</strong> <code style={{ color: '#4338ca' }}>{selected.recording.sha256}</code></p>
                          <p><strong>File Size:</strong> {(selected.recording.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>

                        {selected.events.length > 0 && (
                          <div style={{ marginTop: 20 }}>
                            <strong>Quick Seek to Logged Events:</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                              {selected.events.map((ev) => (
                                <button
                                  key={ev.id}
                                  className="secondary"
                                  style={{ fontSize: 11 }}
                                  onClick={() => {
                                    const video = document.querySelector('video');
                                    if (video) video.currentTime = Math.max(0, ev.offset - 2);
                                  }}
                                >
                                  <Clock size={12} /> {ev.type} @ {Math.round(ev.offset)}s
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="empty">
                        <Video size={40} />
                        <h3>No recording available yet.</h3>
                        <p>
                          Recording is generated and uploaded when the candidate finishes the session.
                        </p>
                      </div>
                    )}
                  </section>
                )}

                {tab === 'audit' && (
                  <section className="card">
                    <h3>Append-Only Recruiter Audit Trail</h3>
                    <p style={{ fontSize: 13, marginBottom: 16 }}>
                      Every human modification to scores or event dispositions is permanently recorded.
                    </p>

                    {selected.audit.length ? (
                      selected.audit.map((a) => (
                        <div
                          key={a.id}
                          style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 10 }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <strong>Reviewer: {a.reviewer || 'Recruiter'}</strong>
                            <span className="muted">{a.at ? new Date(a.at * 1000).toLocaleString() : ''}</span>
                          </div>
                          <p style={{ margin: '6px 0', fontSize: 13 }}>
                            {a.score !== undefined ? `Adjusted score to ${a.score}/5` : `Disposition set to: ${a.disposition}`}
                          </p>
                          <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>
                            <strong>Justification:</strong> {a.reason}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="muted">No manual modifications recorded yet.</p>
                    )}
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
