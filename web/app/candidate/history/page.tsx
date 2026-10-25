'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { History, Calendar, CheckCircle2, ChevronRight, ShieldCheck } from 'lucide-react';
import CandidateNav from '@/components/CandidateNav';
import { api, InterviewSchedule } from '@/components/api';

export default function CandidateHistoryPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [schedules, setSchedules] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = sessionStorage.getItem('rtpl_token') || '';
    if (!t) {
      router.push('/candidate/login');
      return;
    }
    setToken(t);
    loadHistory(t);
  }, []);

  const loadHistory = async (authToken: string) => {
    setLoading(true);
    try {
      const data = await api('/api/candidate/interviews', authToken);
      setSchedules(data);
    } catch (_) {}
    finally {
      setLoading(false);
    }
  };

  return (
    <div className="candidatePortalLayout">
      <CandidateNav />

      <main className="candidateMain">
        <div className="candidateContainer" style={{ maxWidth: 840 }}>
          <div className="sectionHeading" style={{ marginBottom: 24 }}>
            <div className="breadcrumb">
              <Link href="/candidate/dashboard">Portal</Link> <ChevronRight size={14} /> <strong>History</strong>
            </div>
            <h2>Assessment History & Records</h2>
            <p>Review past interview submissions and recruitment milestones.</p>
          </div>

          <div className="contentCard">
            {loading ? (
              <div className="tableLoading">Loading interview history…</div>
            ) : schedules.length === 0 ? (
              <div className="tableEmptyState">
                <History size={42} />
                <h4>No interview records found</h4>
                <p>When you complete interviews with RTPL, your record history will appear here.</p>
              </div>
            ) : (
              <div className="historyList">
                {schedules.map((s) => (
                  <div key={s.id} className="historyItemCard">
                    <div className="historyItemHeader">
                      <div>
                        <h4>{s.job_title}</h4>
                        <span className="departmentTag">RTPL · {s.job_department || 'Engineering'}</span>
                      </div>
                      <span className={`statusPill ${s.status.toLowerCase()}`}>
                        {s.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="historyItemMeta">
                      <div>
                        <Calendar size={15} />
                        <span>
                          {new Date(s.scheduled_time * 1000).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            timeZone: 'Asia/Kolkata'
                          })}
                        </span>
                      </div>
                      <div>
                        <span>Duration: {s.duration_minutes} minutes</span>
                      </div>
                    </div>

                    <div className="historyNotice">
                      <ShieldCheck size={16} />
                      <span>
                        Interview responses and verified proctoring snapshots have been securely delivered to RTPL talent acquisition.
                      </span>
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
