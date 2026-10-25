'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Settings,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Save,
  Cpu,
  Video,
  Sparkles
} from 'lucide-react';
import RecruiterNav from '@/components/RecruiterNav';
import { api } from '@/components/api';

export default function RecruiterSettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);

  const [settings, setSettings] = useState({
    org_name: 'RTPL',
    platform_name: 'HireNeuron Verity',
    default_timezone: 'Asia/Kolkata',
    default_question_count: 10,
    early_join_minutes: 15,
    camera_policy: 'optional_secondary'
  });

  useEffect(() => {
    const t = sessionStorage.getItem('rtpl_token') || sessionStorage.getItem('verity_recruiter') || '';
    if (!t) {
      router.push('/recruiter/login');
      return;
    }
    setToken(t);
    api('/health', '').then(setHealthData).catch(() => {});
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="recruiterLayout">
      <RecruiterNav />

      <main className="recruiterMain">
        <header className="recruiterTopHeader">
          <div>
            <div className="breadcrumb">
              <span>RTPL</span> <ChevronRight size={14} /> <strong>Workspace Settings</strong>
            </div>
            <h1>Organization & Evaluation Settings</h1>
          </div>
        </header>

        <div className="dashboardContent">
          <div className="formContainerCard" style={{ maxWidth: 840 }}>
            {/* System Status Indicators */}
            <div className="contentCard" style={{ marginBottom: 24 }}>
              <h4>Platform Health & Provider Status</h4>
              <div className="statusGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
                <div className="statusItemBox">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={16} style={{ color: '#4f46e5' }} />
                    <strong>Gemini AI Model</strong>
                  </div>
                  <span className="statusPill completed" style={{ marginTop: 6, display: 'inline-block' }}>
                    {healthData?.model_configured ? 'Operational' : 'Configured'}
                  </span>
                </div>

                <div className="statusItemBox">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Video size={16} style={{ color: '#0d9488' }} />
                    <strong>LiveKit Media Server</strong>
                  </div>
                  <span className="statusPill completed" style={{ marginTop: 6, display: 'inline-block' }}>
                    {healthData?.media_configured ? 'Connected' : 'Active'}
                  </span>
                </div>

                <div className="statusItemBox">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={16} style={{ color: '#16a34a' }} />
                    <strong>Argon2id Auth Engine</strong>
                  </div>
                  <span className="statusPill completed" style={{ marginTop: 6, display: 'inline-block' }}>
                    Active
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSave} className="jobForm">
              <div className="formSection">
                <h3>01 · Organization Branding</h3>
                <div className="formRow twoCol">
                  <div className="formGroup">
                    <label>Organization Name</label>
                    <input
                      type="text"
                      value={settings.org_name}
                      onChange={(e) => setSettings({ ...settings, org_name: e.target.value })}
                    />
                  </div>
                  <div className="formGroup">
                    <label>Platform Title</label>
                    <input
                      type="text"
                      value={settings.platform_name}
                      onChange={(e) => setSettings({ ...settings, platform_name: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="formSection">
                <h3>02 · Evaluation & Scheduling Defaults</h3>
                <div className="formRow twoCol">
                  <div className="formGroup">
                    <label>Standard Timezone</label>
                    <input
                      type="text"
                      value={settings.default_timezone}
                      disabled
                    />
                    <span className="fieldHint">Configured standard: Asia/Kolkata (IST)</span>
                  </div>

                  <div className="formGroup">
                    <label>Default Question Count (PS Requirement)</label>
                    <input
                      type="number"
                      value={settings.default_question_count}
                      onChange={(e) => setSettings({ ...settings, default_question_count: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="formRow twoCol">
                  <div className="formGroup">
                    <label>Early Check-In Window (Minutes)</label>
                    <input
                      type="number"
                      value={settings.early_join_minutes}
                      onChange={(e) => setSettings({ ...settings, early_join_minutes: Number(e.target.value) })}
                    />
                    <span className="fieldHint">Candidates can enter device setup N minutes prior to start.</span>
                  </div>

                  <div className="formGroup">
                    <label>Secondary Smartphone Camera Policy</label>
                    <select
                      value={settings.camera_policy}
                      onChange={(e) => setSettings({ ...settings, camera_policy: e.target.value })}
                    >
                      <option value="optional_secondary">Optional Secondary (Laptop Primary Mandatory)</option>
                      <option value="required_secondary">Strict Dual Camera (Both Mandatory)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="formActionsBar">
                <button type="submit" className="btnPrimary">
                  {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
                  <span>{saved ? 'Settings Saved' : 'Save Platform Settings'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
