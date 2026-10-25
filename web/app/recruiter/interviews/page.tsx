'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  PlusCircle,
  Search,
  Filter,
  ChevronRight,
  Clock,
  Video,
  FileText,
  Copy,
  Check,
  RotateCcw,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import RecruiterNav from '@/components/RecruiterNav';
import { api, InterviewSchedule } from '@/components/api';

export default function InterviewsListPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      const data = await api('/api/interviews', authToken);
      setInterviews(data);
    } catch (e: any) {
      console.warn('Load interviews notice:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyInvitation = (schedule: InterviewSchedule) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text = `RTPL Technical Interview Invitation\nCandidate: ${schedule.candidate_name || 'Candidate'}\nCandidate ID: ${schedule.candidate_code || 'N/A'}\nPosition: ${schedule.job_title || 'Software Engineer'}\nScheduled Time: ${new Date(schedule.scheduled_time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)\nDuration: ${schedule.duration_minutes} minutes\n\nCandidate Portal: ${origin}/candidate/login\nPlease sign in with your Candidate ID and temporary password.`;

    navigator.clipboard.writeText(text);
    setCopiedId(schedule.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCancel = async (sid: string) => {
    if (!confirm('Are you sure you want to cancel this interview session?')) return;
    try {
      await api(`/api/interviews/${sid}/cancel`, token, 'PATCH');
      await loadData(token);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const filtered = interviews.filter((item) => {
    const matchesSearch =
      (item.candidate_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.candidate_code || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.job_title || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="recruiterLayout">
      <RecruiterNav />

      <main className="recruiterMain">
        <header className="recruiterTopHeader">
          <div>
            <div className="breadcrumb">
              <span>RTPL</span> <ChevronRight size={14} /> <strong>Interviews</strong>
            </div>
            <h1>Scheduled Interview Sessions</h1>
          </div>

          <div className="topHeaderActions">
            <Link href="/recruiter/interviews/new" className="btnHeaderAction primary">
              <PlusCircle size={16} />
              <span>Schedule New Interview</span>
            </Link>
          </div>
        </header>

        <div className="dashboardContent">
          <div className="contentCard">
            <div className="tableToolbar">
              <div className="toolbarTitle">
                <h3>All Interview Sessions</h3>
                <span className="countBadge">{filtered.length} total</span>
              </div>

              <div className="toolbarFilters">
                <div className="searchBox">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search candidate, ID, or job role…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <div className="selectFilter">
                  <Filter size={15} />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <button onClick={() => loadData(token)} className="btnRefresh" title="Refresh">
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="tableLoading">Loading interview records…</div>
            ) : filtered.length === 0 ? (
              <div className="tableEmptyState">
                <Calendar size={42} />
                <h4>No interviews found</h4>
                <p>Schedule a new interview for a candidate to generate questions and invite them.</p>
                <Link href="/recruiter/interviews/new" className="btnPrimary compact">
                  <PlusCircle size={16} /> Schedule Interview
                </Link>
              </div>
            ) : (
              <div className="tableResponsive">
                <table className="rtplTable">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Candidate ID</th>
                      <th>Role & Opening</th>
                      <th>Scheduled Date & Time (IST)</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="candidateCell">
                            <span className="candidateAvatar">
                              {(item.candidate_name || 'C').slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <strong>{item.candidate_name || 'Candidate'}</strong>
                              <small>{item.candidate_email || ''}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code className="candidateCodeBadge">{item.candidate_code || 'N/A'}</code>
                        </td>
                        <td>
                          <div className="jobRoleCell">
                            <span>{item.job_title || 'Software Engineer'}</span>
                            <small>{item.job_department || 'Engineering'}</small>
                          </div>
                        </td>
                        <td>
                          <div className="timeCell">
                            <Clock size={14} />
                            <span>
                              {new Date(item.scheduled_time * 1000).toLocaleString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Asia/Kolkata'
                              })}
                            </span>
                          </div>
                        </td>
                        <td>{item.duration_minutes} mins</td>
                        <td>
                          <span className={`statusPill ${item.status.toLowerCase()}`}>
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div className="tableRowActions">
                            <button
                              className="btnIconAction"
                              onClick={() => copyInvitation(item)}
                              title="Copy candidate invitation details"
                            >
                              {copiedId === item.id ? <Check size={16} style={{ color: '#16a34a' }} /> : <Copy size={16} />}
                            </button>

                            <Link
                              href={`/recruiter/interviews/${item.session_id}`}
                              className="btnIconAction"
                              title="Monitor session"
                            >
                              <Video size={16} />
                            </Link>

                            <Link
                              href={`/recruiter/reports/${item.session_id}`}
                              className="btnTextAction"
                            >
                              <span>Report</span>
                              <ChevronRight size={14} />
                            </Link>

                            {item.status !== 'CANCELLED' && item.status !== 'COMPLETED' && (
                              <button
                                className="btnIconAction danger"
                                onClick={() => handleCancel(item.session_id)}
                                title="Cancel interview"
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
