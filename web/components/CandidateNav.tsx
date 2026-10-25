'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogOut, User, Calendar, History } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function CandidateNav() {
  const router = useRouter();
  const [candidate, setCandidate] = useState<any>(null);

  useEffect(() => {
    const candStr = sessionStorage.getItem('rtpl_candidate');
    if (candStr) {
      try {
        setCandidate(JSON.parse(candStr));
      } catch (_) {}
    }
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('rtpl_token');
    sessionStorage.removeItem('rtpl_candidate');
    router.push('/candidate/login');
  };

  return (
    <header className="candidateHeader">
      <div className="candidateHeaderInner">
        <Link href="/candidate/dashboard" className="candidateBrand">
          <div className="brandBadge">
            <ShieldCheck size={18} />
          </div>
          <div>
            <span className="brandCompany">RTPL</span>
            <span className="brandPortal">Candidate Portal</span>
          </div>
        </Link>

        <nav className="candidateNavLinks">
          <Link href="/candidate/dashboard" className="candNavLink">
            <Calendar size={16} />
            <span>My Interviews</span>
          </Link>
          <Link href="/candidate/history" className="candNavLink">
            <History size={16} />
            <span>History</span>
          </Link>
        </nav>

        <div className="candidateUserArea">
          {candidate && (
            <div className="candidateBadge">
              <User size={15} />
              <span>{candidate.full_name || candidate.candidate_code}</span>
              <span className="candidateCodePill">{candidate.candidate_code}</span>
            </div>
          )}
          <button onClick={handleLogout} className="candLogoutBtn" title="Log Out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
