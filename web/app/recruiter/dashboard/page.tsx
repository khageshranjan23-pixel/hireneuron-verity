'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  Activity,
  FileText,
  Clock,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  RotateCcw,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Video
} from 'lucide-react';
import RecruiterNav from '@/components/RecruiterNav';
import { api, RecruiterMetrics, InterviewSchedule } from '@/components/api';

export default function RecruiterDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [metrics, setMetrics] = useState<RecruiterMetrics | null>(null);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
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
      const [m, ints] = await Promise.all([
        api('/api/recruiter/metrics', authToken),
        api('/api/interviews', authToken)
      ]);
      setMetrics(m);
      setInterviews(ints);
    } catch (e: any) {
      console.warn('Dashboard load notice:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyInvitation = (schedule: InterviewSchedule) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text = `RTPL Technical Interview Invitation
Candidate: ${schedule.candidate_name || 'Candidate'}
Candidate ID: ${schedule.candidate_code || 'N/A'}
Position: ${schedule.job_title || 'Software Engineer'}
Scheduled Time: ${new Date(schedule.scheduled_time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
Duration: ${schedule.duration_minutes} minutes

Portal Link: ${origin}/candidate/login
Please sign in with your Candidate ID and temporary password.`;

    navigator.clipboard.writeText(text);
    setCopiedId(schedule.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filteredInterviews = interviews.filter((item) => {
    const matchesSearch =
      (item.candidate_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.candidate_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.job_title || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="recruiterLayout">
      <RecruiterNav />

      <main className="recruiterMain">
        {/* Top Header */}
        <header className="recruiterTopHeader">
          <div>
            <div className="breadcrumb">
              <span>RTPL</span> <ChevronRight size={14} /> <strong>Workspace Overview</strong>
            </div>
            <h1>Recruitment Operations Dashboard</h1>
          </div>

          <div className="topHeaderActions">
            <Link href="/recruiter/interviews/new" className="btnHeaderAction primary">
              <PlusCircle size={16} />
              <span>Schedule Interview</span>
            </Link>
            <Link href="/recruiter/jobs/new" className="btnHeaderAction secondary">
              <Briefcase size={16} />
              <span>New Job</span>
            </Link>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="dashboardContent">
          {/* Key Metrics Cards */}
          <section className="metricsGrid">
            <div className="metricCard">
              <div className="metricIcon jobs"><Briefcase size={22} /></div>
              <div className="metricData">
                <span className="metricLabel">Active Openings</span>
                <strong className="metricValue">{metrics?.active_jobs ?? 0}</strong>
                <span className="metricSub">of {metrics?.total_jobs ?? 0} total jobs</span>
              </div>
            </div>

            <div className="metricCard">
              <div className="metricIcon candidates"><Users size={22} /></div>
              <div className="metricData">
                <span className="metricLabel">Registered Candidates</span>
                <strong className="metricValue">{metrics?.total_candidates ?? 0}</strong>
                <span className="metricSub">verified profiles</span>
              </div>
            </div>

            <div className="metricCard">
              <div className="metricIcon upcoming"><Calendar size={22} /></div>
              <div className="metricData">
                <span className="metricLabel">Upcoming Sessions</span>
                <strong className="metricValue">{metrics?.upcoming_interviews ?? 0}</strong>
                <span className="metricSub">ready in queue</span>
              </div>
            </div>

            <div className="metricCard">
              <div className="metricIcon active"><Activity size={22} /></div>
              <div className="metricData">
                <span className="metricLabel">Live In Progress</span>
                <strong className="metricValue">{metrics?.in_progress_interviews ?? 0}</strong>
                <span className="metricSub">camera streaming active</span>
              </div>
            </div>

            <div className="metricCard">
              <div className="metricIcon completed"><FileText size={22} /></div>
              <div className="metricData">
                <span className="metricLabel">Completed & Evaluated</span>
                <strong className="metricValue">{metrics?.completed_interviews ?? 0}</strong>
                <span className="metricSub">evidence archived</span>
              </div>
            </div>
          </section>

          {/* Quick Shortcuts Banner */}
          <section className="quickWorkflowBanner">
            <div className="bannerText">
              <ShieldCheck size={28} className="bannerShield" />
              <div>
                <strong>Evidence-First Assessment Pipeline</strong>
                <p>AI conducts structured interviews and generates grounded rubrics. You retain full human decision authority.</p>
              </div>
            </div>
            <div className="bannerButtons">
              <Link href="/recruiter/jobs/new" className="btnBanner">
                1. Create Job
              </Link>
              <Link href="/recruiter/candidates" className="btnBanner">
                2. Add Candidates
              </Link>
              <Link href="/recruiter/interviews/new" className="btnBanner highlight">
                3. Schedule Interview →
              </Link>
            </div>
          </section>

          {/* Scheduled Interviews Table */}
          <section className="dashboardTableCard">
            <div className="tableToolbar">
              <div className="toolbarTitle">
                <h3>Scheduled & Recent Interviews</h3>
                <span className="countBadge">{filteredInterviews.length} sessions</span>
              </div>

              <div className="toolbarFilters">
                <div className="searchBox">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search candidate, ID, or job title…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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

                <button onClick={() => loadData(token)} className="btnRefresh" title="Refresh data">
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="tableLoading">Loading interview records…</div>
            ) : filteredInterviews.length === 0 ? (
              <div className="tableEmptyState">
                <Calendar size={42} />
                <h4>No interviews found</h4>
                <p>Schedule your first technical candidate interview to see live updates and reports.</p>
                <Link href="/recruiter/interviews/new" className="btnPrimary compact">
                  <PlusCircle size={16} /> Schedule an Interview
                </Link>
              </div>
            ) : (
              <div className="tableResponsive">
                <table className="rtplTable">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Candidate ID</th>
                      <th>Position</th>
                      <th>Scheduled (IST)</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInterviews.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="candidateCell">
                            <span className="candidateAvatar">
                              {(item.candidate_name || 'C').slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <strong>{item.candidate_name || 'Candidate'}</strong>
                              <small>{item.candidate_email || 'No email'}</small>
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
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Asia/Kolkata'
                              })}
                            </span>
                          </div>
                        </td>
                        <td>{item.duration_minutes} min</td>
                        <td>
                          <span className={`statusPill ${item.status.toLowerCase()}`}>
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div className="tableRowActions">
                            {/* Copy Invitation */}
                            <button
                              className="btnIconAction"
                              onClick={() => copyInvitation(item)}
                              title="Copy candidate invitation details"
                            >
                              {copiedId === item.id ? <Check size={16} style={{ color: '#16a34a' }} /> : <Copy size={16} />}
                            </button>

                            {/* Live View */}
                            <Link
                              href={`/recruiter/interviews/${item.session_id}`}
                              className="btnIconAction"
                              title="Monitor session"
                            >
                              <Video size={16} />
                            </Link>

                            {/* View Report */}
                            <Link
                              href={`/recruiter/reports/${item.session_id}`}
                              className="btnTextAction"
                            >
                              <span>Report</span>
                              <ChevronRight size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
