'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  PlusCircle,
  Search,
  Filter,
  ChevronRight,
  Clock,
  CheckCircle2,
  Users
} from 'lucide-react';
import RecruiterNav from '@/components/RecruiterNav';
import { api, RecruitmentJob } from '@/components/api';

export default function JobsListPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [jobs, setJobs] = useState<RecruitmentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = sessionStorage.getItem('rtpl_token') || sessionStorage.getItem('verity_recruiter') || '';
    if (!t) {
      router.push('/recruiter/login');
      return;
    }
    setToken(t);
    loadJobs(t);
  }, []);

  const loadJobs = async (authToken: string) => {
    setLoading(true);
    try {
      const data = await api('/api/jobs', authToken);
      setJobs(data);
    } catch (e: any) {
      console.warn('Load jobs notice:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = jobs.filter((j) =>
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    j.department.toLowerCase().includes(search.toLowerCase()) ||
    j.required_skills.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="recruiterLayout">
      <RecruiterNav />

      <main className="recruiterMain">
        <header className="recruiterTopHeader">
          <div>
            <div className="breadcrumb">
              <span>RTPL</span> <ChevronRight size={14} /> <strong>Job Openings</strong>
            </div>
            <h1>Job Requirements & Competencies</h1>
          </div>

          <div className="topHeaderActions">
            <Link href="/recruiter/jobs/new" className="btnHeaderAction primary">
              <PlusCircle size={16} />
              <span>Create Job Opening</span>
            </Link>
          </div>
        </header>

        <div className="dashboardContent">
          <div className="contentCard">
            <div className="tableToolbar">
              <div className="toolbarTitle">
                <h3>Active & Configured Openings</h3>
                <span className="countBadge">{filtered.length} jobs</span>
              </div>

              <div className="toolbarFilters">
                <div className="searchBox">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search jobs, department, skills…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="tableLoading">Loading job openings…</div>
            ) : filtered.length === 0 ? (
              <div className="tableEmptyState">
                <Briefcase size={42} />
                <h4>No job openings defined</h4>
                <p>Create a job opening or upload a job description to start generating interview rubrics.</p>
                <Link href="/recruiter/jobs/new" className="btnPrimary compact">
                  <PlusCircle size={16} /> Create Job Opening
                </Link>
              </div>
            ) : (
              <div className="jobsGrid">
                {filtered.map((job) => (
                  <div key={job.id} className="jobCard">
                    <div className="jobCardHeader">
                      <div>
                        <h4>{job.title}</h4>
                        <span className="departmentTag">{job.department} · {job.employment_type}</span>
                      </div>
                      <span className={`statusPill ${job.status.toLowerCase()}`}>
                        {job.status}
                      </span>
                    </div>

                    <p className="jobDescriptionSnippet">{job.description.slice(0, 150)}…</p>

                    <div className="skillsPillsWrapper">
                      {job.required_skills.split(',').map((s, idx) => s.trim() && (
                        <span key={idx} className="skillPill">{s.trim()}</span>
                      ))}
                    </div>

                    <div className="jobCardFooter">
                      <div className="jobMetaInfo">
                        <span>Level: <strong>{job.experience_level}</strong></span>
                        <span>Difficulty: <strong>{job.difficulty}</strong></span>
                      </div>
                      <Link
                        href={`/recruiter/interviews/new?job_id=${job.id}`}
                        className="btnScheduleForJob"
                      >
                        <span>Schedule Candidates</span>
                        <ChevronRight size={14} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
