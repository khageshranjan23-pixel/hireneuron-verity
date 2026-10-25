'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  PlusCircle,
  Search,
  ChevronRight,
  Copy,
  Check,
  Key,
  Upload,
  AlertCircle,
  X,
  Calendar,
  Briefcase
} from 'lucide-react';
import RecruiterNav from '@/components/RecruiterNav';
import { api, Candidate, RecruitmentJob } from '@/components/api';

export default function CandidatesPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<RecruitmentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Candidate Form State
  const [newCandidate, setNewCandidate] = useState({
    full_name: '',
    email: '',
    phone: '',
    job_id: '',
    resume_text: ''
  });
  const [extracting, setExtracting] = useState(false);
  const [createdResult, setCreatedResult] = useState<any>(null);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    const t = sessionStorage.getItem('rtpl_token') || sessionStorage.getItem('verity_recruiter') || '';
    if (!t) {
      router.push('/recruiter/login');
      return;
    }
    setToken(t);
    loadData(t);
  }, []);

  const loadData = async (authToken: string) => {
    setLoading(true);
    try {
      const [cands, jbs] = await Promise.all([
        api('/api/candidates', authToken),
        api('/api/jobs', authToken)
      ]);
      setCandidates(cands);
      setJobs(jbs);
      if (jbs.length > 0 && !newCandidate.job_id) {
        setNewCandidate((prev) => ({ ...prev, job_id: jbs[0].id }));
      }
    } catch (e: any) {
      console.warn('Load candidates notice:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeUpload = async (file: File) => {
    setExtracting(true);
    setModalError('');
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api('/documents/extract', token, 'POST', data);
      if (res.text) {
        setNewCandidate((prev) => ({
          ...prev,
          resume_text: res.text.slice(0, 15000)
        }));
      }
    } catch (err: any) {
      setModalError('Resume extraction notice: ' + (err.message || 'File could not be parsed'));
    } finally {
      setExtracting(false);
    }
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCandidate.full_name.trim() || !newCandidate.email.trim()) {
      setModalError('Name and email are required.');
      return;
    }

    setModalError('');
    try {
      const res = await api('/api/candidates', token, 'POST', newCandidate);
      setCreatedResult(res);
      await loadData(token);
    } catch (err: any) {
      setModalError(err.message || 'Failed to create candidate profile.');
    }
  };

  const handleResetPassword = async (candId: string) => {
    if (!confirm('Generate a new temporary password for this candidate?')) return;
    try {
      const res = await api(`/api/candidates/${candId}/reset-password`, token, 'POST');
      alert(`New Temporary Password Generated:\nCandidate: ${res.candidate_code}\nPassword: ${res.temporary_password}\n\nPlease share this securely with the candidate.`);
      await loadData(token);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const copyLoginDetails = (c: Candidate) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pw = c.temp_password_unhashed || c.temp_password || 'Contact recruiter';
    const text = `RTPL Candidate Portal Access
Candidate Name: ${c.full_name}
Candidate ID: ${c.candidate_code}
Password: ${pw}

Sign in: ${origin}/candidate/login`;

    navigator.clipboard.writeText(text);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filtered = candidates.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.candidate_code.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="recruiterLayout">
      <RecruiterNav />

      <main className="recruiterMain">
        <header className="recruiterTopHeader">
          <div>
            <div className="breadcrumb">
              <span>RTPL</span> <ChevronRight size={14} /> <strong>Candidates</strong>
            </div>
            <h1>Candidate Directory & Credentials</h1>
          </div>

          <div className="topHeaderActions">
            <button
              onClick={() => {
                setCreatedResult(null);
                setModalError('');
                setShowAddModal(true);
              }}
              className="btnHeaderAction primary"
            >
              <PlusCircle size={16} />
              <span>Add Candidate</span>
            </button>
          </div>
        </header>

        <div className="dashboardContent">
          <div className="contentCard">
            <div className="tableToolbar">
              <div className="toolbarTitle">
                <h3>Registered Candidates</h3>
                <span className="countBadge">{filtered.length} candidates</span>
              </div>

              <div className="toolbarFilters">
                <div className="searchBox">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search candidate name, ID, or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="tableLoading">Loading candidate records…</div>
            ) : filtered.length === 0 ? (
              <div className="tableEmptyState">
                <Users size={42} />
                <h4>No candidates registered</h4>
                <p>Add candidate profiles to generate secure login credentials and schedule interviews.</p>
                <button onClick={() => setShowAddModal(true)} className="btnPrimary compact">
                  <PlusCircle size={16} /> Add First Candidate
                </button>
              </div>
            ) : (
              <div className="tableResponsive">
                <table className="rtplTable">
                  <thead>
                    <tr>
                      <th>Candidate ID</th>
                      <th>Full Name</th>
                      <th>Email & Phone</th>
                      <th>Temporary Password</th>
                      <th>Applied Role</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const matchedJob = jobs.find((j) => j.id === c.job_id);
                      return (
                        <tr key={c.id}>
                          <td>
                            <code className="candidateCodeBadge">{c.candidate_code}</code>
                          </td>
                          <td>
                            <strong>{c.full_name}</strong>
                          </td>
                          <td>
                            <div>
                              <span>{c.email}</span>
                              {c.phone && <small style={{ display: 'block', color: '#64748b' }}>{c.phone}</small>}
                            </div>
                          </td>
                          <td>
                            {c.temp_password_unhashed ? (
                              <code className="tempPwBadge">{c.temp_password_unhashed}</code>
                            ) : (
                              <span className="muted" style={{ fontSize: 12 }}>Secured</span>
                            )}
                          </td>
                          <td>
                            <span className="jobRoleTag">
                              {matchedJob ? matchedJob.title : 'General Pipeline'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, color: '#64748b' }}>
                              {new Date(c.created_at * 1000).toLocaleDateString()}
                            </span>
                          </td>
                          <td>
                            <div className="tableRowActions">
                              <button
                                className="btnIconAction"
                                onClick={() => copyLoginDetails(c)}
                                title="Copy candidate login credentials"
                              >
                                {copiedId === c.id ? <Check size={16} style={{ color: '#16a34a' }} /> : <Copy size={16} />}
                              </button>
                              <button
                                className="btnIconAction"
                                onClick={() => handleResetPassword(c.id)}
                                title="Reset credentials"
                              >
                                <Key size={16} />
                              </button>
                              <Link
                                href={`/recruiter/interviews/new?candidate_id=${c.id}`}
                                className="btnTextAction"
                                title="Schedule interview for candidate"
                              >
                                <Calendar size={14} />
                                <span>Schedule</span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Candidate Modal */}
      {showAddModal && (
        <div className="modalBackdrop">
          <div className="modalCard">
            <div className="modalHeader">
              <h3>Add Candidate & Generate Credentials</h3>
              <button onClick={() => setShowAddModal(false)} className="modalCloseBtn">
                <X size={18} />
              </button>
            </div>

            {createdResult ? (
              <div className="modalSuccessBody">
                <div className="successBadge">
                  <Check size={32} />
                </div>
                <h4>Candidate Registered Successfully!</h4>
                <p>The candidate profile and unique login credentials have been created.</p>

                <div className="credentialsDisplayBox">
                  <div className="credRow">
                    <span className="credLabel">Candidate Name:</span>
                    <strong>{createdResult.full_name}</strong>
                  </div>
                  <div className="credRow">
                    <span className="credLabel">Candidate ID:</span>
                    <code>{createdResult.candidate_code}</code>
                  </div>
                  <div className="credRow">
                    <span className="credLabel">Initial Password:</span>
                    <code className="highlightPw">{createdResult.temp_password}</code>
                  </div>
                  <div className="credRow">
                    <span className="credLabel">Portal Link:</span>
                    <span>{typeof window !== 'undefined' ? window.location.origin : ''}/candidate/login</span>
                  </div>
                </div>

                <div className="modalActions">
                  <button
                    className="btnPrimary"
                    onClick={() => {
                      const text = `RTPL Candidate Portal Access\nCandidate Name: ${createdResult.full_name}\nCandidate ID: ${createdResult.candidate_code}\nPassword: ${createdResult.temp_password}\nPortal Link: ${window.location.origin}/candidate/login`;
                      navigator.clipboard.writeText(text);
                      alert('Login details copied to clipboard!');
                    }}
                  >
                    <Copy size={16} /> Copy Candidate Login Details
                  </button>
                  <Link
                    href={`/recruiter/interviews/new?candidate_id=${createdResult.id}`}
                    className="btnSecondary"
                  >
                    Schedule Interview Now →
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddCandidate} className="modalForm">
                {modalError && (
                  <div className="authErrorAlert">
                    <AlertCircle size={16} />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="formGroup">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Priyanshu Verma"
                    value={newCandidate.full_name}
                    onChange={(e) => setNewCandidate({ ...newCandidate, full_name: e.target.value })}
                    required
                  />
                </div>

                <div className="formRow twoCol">
                  <div className="formGroup">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      placeholder="e.g. p.verma@example.com"
                      value={newCandidate.email}
                      onChange={(e) => setNewCandidate({ ...newCandidate, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="formGroup">
                    <label>Phone Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 98765 43210"
                      value={newCandidate.phone}
                      onChange={(e) => setNewCandidate({ ...newCandidate, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="formGroup">
                  <label>Assign to Job Opening</label>
                  <select
                    value={newCandidate.job_id}
                    onChange={(e) => setNewCandidate({ ...newCandidate, job_id: e.target.value })}
                  >
                    <option value="">General Applicant Pool</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>{j.title} ({j.department})</option>
                    ))}
                  </select>
                </div>

                <div className="formGroup">
                  <label>Upload Resume (PDF / DOCX)</label>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(e) => e.target.files?.[0] && handleResumeUpload(e.target.files[0])}
                  />
                  {extracting && <small style={{ color: '#4f46e5' }}>Extracting text from resume…</small>}
                </div>

                <div className="modalFooter">
                  <button type="button" className="btnSecondary" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btnPrimary">
                    Create Candidate & Issue Credentials
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
