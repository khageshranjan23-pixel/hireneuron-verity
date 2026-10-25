'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  ChevronRight,
  ArrowRight,
  Upload,
  Sparkles,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import RecruiterNav from '@/components/RecruiterNav';
import { api } from '@/components/api';

export default function NewJobPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extracting, setExtracting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    department: 'Engineering',
    employment_type: 'Full-time',
    description: '',
    required_skills: '',
    preferred_skills: '',
    experience_level: 'Mid-Level',
    difficulty: 'intermediate',
    status: 'ACTIVE'
  });

  useEffect(() => {
    const t = sessionStorage.getItem('rtpl_token') || sessionStorage.getItem('verity_recruiter') || '';
    if (!t) {
      router.push('/recruiter/login');
      return;
    }
    setToken(t);
  }, []);

  const handleFileUpload = async (file: File) => {
    setExtracting(true);
    setError('');
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api('/documents/extract', token, 'POST', data);
      if (res.text) {
        setForm((prev) => ({
          ...prev,
          description: res.text.slice(0, 10000)
        }));
      }
    } catch (err: any) {
      setError('Document extraction notice: ' + (err.message || 'File could not be parsed'));
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      setError('Please provide at least a Job Title and Description.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api('/api/jobs', token, 'POST', form);
      router.push('/recruiter/jobs');
    } catch (err: any) {
      setError(err.message || 'Failed to create job opening.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="recruiterLayout">
      <RecruiterNav />

      <main className="recruiterMain">
        <header className="recruiterTopHeader">
          <div>
            <div className="breadcrumb">
              <Link href="/recruiter/jobs">Job Openings</Link> <ChevronRight size={14} /> <strong>New Opening</strong>
            </div>
            <h1>Create Job Opening</h1>
          </div>
        </header>

        <div className="dashboardContent">
          <div className="formContainerCard">
            {error && (
              <div className="authErrorAlert">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="jobForm">
              <div className="formSection">
                <h3>01 · Basic Role Information</h3>
                
                <div className="formRow twoCol">
                  <div className="formGroup">
                    <label>Job Title *</label>
                    <input
                      type="text"
                      placeholder="e.g. Senior Backend Engineer"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="formGroup">
                    <label>Department</label>
                    <input
                      type="text"
                      placeholder="e.g. Core Infrastructure"
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                    />
                  </div>
                </div>

                <div className="formRow threeCol">
                  <div className="formGroup">
                    <label>Employment Type</label>
                    <select
                      value={form.employment_type}
                      onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                    >
                      <option>Full-time</option>
                      <option>Contract</option>
                      <option>Part-time</option>
                      <option>Internship</option>
                    </select>
                  </div>

                  <div className="formGroup">
                    <label>Experience Level</label>
                    <select
                      value={form.experience_level}
                      onChange={(e) => setForm({ ...form, experience_level: e.target.value })}
                    >
                      <option>Entry-Level</option>
                      <option>Mid-Level</option>
                      <option>Senior</option>
                      <option>Staff / Principal</option>
                    </select>
                  </div>

                  <div className="formGroup">
                    <label>Interview Difficulty</label>
                    <select
                      value={form.difficulty}
                      onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="formSection">
                <h3>02 · Competencies & Required Skills</h3>

                <div className="formGroup">
                  <label>Required Skills (Comma-separated) *</label>
                  <input
                    type="text"
                    placeholder="e.g. Python, FastAPI, PostgreSQL, Docker, Distributed Systems"
                    value={form.required_skills}
                    onChange={(e) => setForm({ ...form, required_skills: e.target.value })}
                  />
                  <span className="fieldHint">AI interviewer will ground questions specifically in these skill domains.</span>
                </div>

                <div className="formGroup">
                  <label>Preferred Skills (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. WebRTC, LiveKit, Kubernetes, AWS"
                    value={form.preferred_skills}
                    onChange={(e) => setForm({ ...form, preferred_skills: e.target.value })}
                  />
                </div>
              </div>

              <div className="formSection">
                <h3>03 · Job Description</h3>

                <div className="uploadDropzone">
                  <Upload size={24} />
                  <div>
                    <strong>Upload JD Document (PDF or DOCX)</strong>
                    <p>Automatically extract text into the description field.</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    disabled={extracting}
                  />
                  {extracting && <span className="uploadingPill">Extracting text…</span>}
                </div>

                <div className="formGroup" style={{ marginTop: 16 }}>
                  <label>Job Description & Responsibilities *</label>
                  <textarea
                    rows={8}
                    placeholder="Describe role responsibilities, architectural focus, and daily technical expectations…"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="formActionsBar">
                <Link href="/recruiter/jobs" className="btnSecondary">
                  Cancel
                </Link>
                <button type="submit" className="btnPrimary" disabled={loading}>
                  {loading ? 'Creating Job Opening…' : 'Save Job Opening'}
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
