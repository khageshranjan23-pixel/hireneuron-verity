'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  Settings,
  LogOut,
  ShieldCheck,
  PlusCircle,
  ExternalLink
} from 'lucide-react';
import { useEffect, useState } from 'react';

export default function RecruiterNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('Recruiter');

  useEffect(() => {
    const userStr = sessionStorage.getItem('rtpl_user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        setUserName(u.name || u.username || 'Recruiter');
      } catch (_) {}
    }
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('rtpl_token');
    sessionStorage.removeItem('rtpl_user');
    sessionStorage.removeItem('verity_recruiter');
    router.push('/recruiter/login');
  };

  const navItems = [
    { label: 'Overview', href: '/recruiter/dashboard', icon: LayoutDashboard },
    { label: 'Job Openings', href: '/recruiter/jobs', icon: Briefcase },
    { label: 'Candidates', href: '/recruiter/candidates', icon: Users },
    { label: 'Interviews', href: '/recruiter/interviews', icon: Calendar },
    { label: 'Settings', href: '/recruiter/settings', icon: Settings },
  ];

  return (
    <aside className="rtplSidebar">
      <div className="rtplSidebarBrand">
        <div className="brandBadge">
          <ShieldCheck size={20} />
        </div>
        <div>
          <div className="brandCompany">RTPL</div>
          <div className="brandSub">HireNeuron Verity</div>
        </div>
      </div>

      <div className="userProfileCard">
        <div className="userAvatar">{userName.slice(0, 2).toUpperCase()}</div>
        <div className="userInfo">
          <div className="userName">{userName}</div>
          <div className="userRole">Talent Acquisition</div>
        </div>
      </div>

      <nav className="rtplNav">
        <div className="navSectionTitle">RECRUITMENT WORKSPACE</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/recruiter/dashboard' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rtplNavLink ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebarQuickActions">
        <Link href="/recruiter/interviews/new" className="quickActionBtn">
          <PlusCircle size={16} />
          <span>Schedule Interview</span>
        </Link>
      </div>

      <div className="sidebarFooter">
        <button onClick={handleLogout} className="logoutBtn">
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
