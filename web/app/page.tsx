'use client';
import Link from 'next/link';
import {
  ShieldCheck,
  Briefcase,
  Users,
  Video,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Lock,
  Smartphone,
  Cpu,
  FileCheck,
  Award,
  Calendar
} from 'lucide-react';

export default function PublicHomePage() {
  return (
    <div className="publicSite">
      {/* ── Public Navigation Header ────────────────────────────────────────── */}
      <header className="publicHeader">
        <div className="headerContainer">
          <Link href="/" className="publicBrand">
            <div className="brandBadge">
              <ShieldCheck size={24} />
            </div>
            <div>
              <div className="brandTitle">RTPL</div>
              <div className="brandSubtitle">HireNeuron Verity</div>
            </div>
          </Link>

          <nav className="publicNav">
            <a href="#how-it-works">How It Works</a>
            <a href="#features">Platform Features</a>
            <a href="#trust">Integrity & Trust</a>
          </nav>

          <div className="publicAuthActions">
            <Link href="/candidate/login" className="btnCandidatePortal">
              <Users size={16} />
              <span>Candidate Login</span>
            </Link>
            <Link href="/recruiter/login" className="btnRecruiterPortal">
              <Briefcase size={16} />
              <span>Recruiter Login</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ────────────────────────────────────────────────────── */}
      <section className="heroSection">
        <div className="heroContainer">
          <div className="heroTag">
            <Sparkles size={14} />
            <span>Autonomous AI Video Interview & Proctoring Platform</span>
          </div>

          <h1 className="heroTitle">
            Evidence-First Recruitment.<br />
            <span className="heroHighlight">Autonomous AI Interviews.</span>
          </h1>

          <p className="heroDescription">
            RTPL HireNeuron Verity empowers organizations to schedule, conduct, and evaluate structured technical interviews at enterprise scale. Real-time spoken dialogue, dual-camera computer vision monitoring, and auditable evaluation grounded in transcript evidence.
          </p>

          <div className="heroPortalsGrid">
            {/* Recruiter Card */}
            <div className="portalCard recruiterCard">
              <div className="portalIcon">
                <Briefcase size={28} />
              </div>
              <h3>For Talent Acquisition & Hiring Teams</h3>
              <p>
                Configure job openings, upload resumes, define evaluation rubrics, schedule automated video interviews, and review evidence-backed candidate reports.
              </p>
              <ul className="portalBulletList">
                <li><CheckCircle2 size={16} /> Automated question generation grounded in JD</li>
                <li><CheckCircle2 size={16} /> Live monitoring and proctoring audit trails</li>
                <li><CheckCircle2 size={16} /> Human hiring decision policy & score overrides</li>
              </ul>
              <Link href="/recruiter/login" className="portalCtaBtn primary">
                <span>Enter Recruiter Portal</span>
                <ArrowRight size={16} />
              </Link>
            </div>

            {/* Candidate Card */}
            <div className="portalCard candidateCard">
              <div className="portalIcon">
                <Users size={28} />
              </div>
              <h3>For Job Candidates</h3>
              <p>
                Log in with your assigned Candidate ID and temporary password to access your scheduled interview, test devices, and complete your spoken interview.
              </p>
              <ul className="portalBulletList">
                <li><CheckCircle2 size={16} /> Zero software installation required</li>
                <li><CheckCircle2 size={16} /> Natural voice conversation with AI interviewer</li>
                <li><CheckCircle2 size={16} /> Real-time speech transcription & verification</li>
              </ul>
              <Link href="/candidate/login" className="portalCtaBtn secondary">
                <span>Enter Candidate Portal</span>
                <ArrowRight size={16} />
              </Link>
              <div style={{ marginTop: 10, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
                Instant Trial Access: <code style={{ background: '#f1f5f9', padding: '2px 5px', borderRadius: 4, fontWeight: 600 }}>RTPL-CND-TRIAL</code> &middot; <code style={{ background: '#f1f5f9', padding: '2px 5px', borderRadius: 4, fontWeight: 600 }}>RTPLCandidate2026!</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="sectionWorkflow">
        <div className="sectionContainer">
          <div className="sectionHeading">
            <span className="eyebrow">STRUCTURED WORKFLOW</span>
            <h2>How RTPL HireNeuron Verity Operates</h2>
            <p>From job blueprint to final evaluation in 4 seamless steps.</p>
          </div>

          <div className="workflowGrid">
            <div className="workflowStep">
              <div className="stepNumber">01</div>
              <div className="stepIcon"><Briefcase size={22} /></div>
              <h4>Configure Job & Candidate</h4>
              <p>Recruiter defines job requirements, uploads resumes, and specifies interview competencies and duration.</p>
            </div>

            <div className="workflowStep">
              <div className="stepNumber">02</div>
              <div className="stepIcon"><Calendar size={22} /></div>
              <h4>Schedule & Issue Credentials</h4>
              <p>A unique Candidate ID and temporary credentials are generated. The candidate accesses their personal dashboard.</p>
            </div>

            <div className="workflowStep">
              <div className="stepNumber">03</div>
              <div className="stepIcon"><Video size={22} /></div>
              <h4>Autonomous AI Voice Interview</h4>
              <p>Candidate completes 2-camera setup and enters the live room. The AI asks questions and adapts with follow-ups.</p>
            </div>

            <div className="workflowStep">
              <div className="stepNumber">04</div>
              <div className="stepIcon"><Award size={22} /></div>
              <h4>Evidence-Backed Evaluation</h4>
              <p>Gemini evaluates transcript responses with exact citations. Recruiter reviews recording, scores, and integrity logs.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Key Technical Features ──────────────────────────────────────────── */}
      <section id="features" className="sectionFeatures">
        <div className="sectionContainer">
          <div className="sectionHeading">
            <span className="eyebrow">ENTERPRISE CAPABILITIES</span>
            <h2>Engineered for Fair, Auditable Assessments</h2>
          </div>

          <div className="featuresGrid">
            <div className="featureCard">
              <Cpu size={26} className="featureIcon" />
              <h4>Dual-Camera WebRTC Streaming</h4>
              <p>Primary laptop webcam accompanied by QR-linked secondary smartphone camera for a comprehensive environmental perspective.</p>
            </div>

            <div className="featureCard">
              <FileCheck size={26} className="featureIcon" />
              <h4>Transcript-Grounded Scoring</h4>
              <p>Every competency score is tied to verified speech transcript spans. No black-box AI ratings or unsubstantiated judgments.</p>
            </div>

            <div className="featureCard">
              <ShieldCheck size={26} className="featureIcon" />
              <h4>Non-Disqualifying Proctoring</h4>
              <p>Computer vision observations highlight events for human recruiter inspection. Candidates are never auto-rejected by algorithms.</p>
            </div>

            <div className="featureCard">
              <Lock size={26} className="featureIcon" />
              <h4>HMAC-Sealed Audit Trail</h4>
              <p>Cryptographically sealed proctoring snapshots and tamper-evident observation logs ensure high-integrity evidence chains.</p>
            </div>

            <div className="featureCard">
              <Sparkles size={26} className="featureIcon" />
              <h4>Contextual AI Probing</h4>
              <p>Intelligent follow-up questions probe technical depth when answers introduce specific architectural or algorithmic claims.</p>
            </div>

            <div className="featureCard">
              <Smartphone size={26} className="featureIcon" />
              <h4>Zero-Friction Candidate Setup</h4>
              <p>Simple 4-step onboarding wizard tests cameras, microphone, audio playback, and smartphone pairing before the interview begins.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust & Policy ──────────────────────────────────────────────────── */}
      <section id="trust" className="sectionTrust">
        <div className="sectionContainer">
          <div className="trustBanner">
            <ShieldCheck size={36} className="trustIcon" />
            <div>
              <h3>Human-in-the-Loop Hiring Policy</h3>
              <p>
                RTPL HireNeuron Verity adheres to transparent AI ethics. AI models provide structured summaries, transcript analysis, and computer-vision observations. All hiring decisions, score adjustments, and interview reviews remain under the sole authority of qualified human recruitment professionals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Public Footer ───────────────────────────────────────────────────── */}
      <footer className="publicFooter">
        <div className="footerContainer">
          <div className="footerCol brandCol">
            <div className="publicBrand">
              <div className="brandBadge small">
                <ShieldCheck size={18} />
              </div>
              <span className="brandTitle">RTPL</span>
            </div>
            <p className="footerMuted">
              HireNeuron Verity — AI-Powered Autonomous Video Recruitment & Proctoring Platform.
            </p>
          </div>

          <div className="footerCol">
            <h5>Navigation</h5>
            <Link href="/recruiter/login">Recruiter Portal</Link>
            <Link href="/candidate/login">Candidate Portal</Link>
            <a href="#how-it-works">How It Works</a>
            <a href="#features">Features</a>
          </div>

          <div className="footerCol">
            <h5>Platform Standards</h5>
            <span>Asia/Kolkata Timezone Standard</span>
            <span>WebRTC Audio-Video Infrastructure</span>
            <span>Argon2id Enterprise Authentication</span>
            <span>HMAC Evidence Verification</span>
          </div>
        </div>

        <div className="footerBottom">
          <p>© {new Date().getFullYear()} RTPL. All rights reserved. HireNeuron Verity Platform.</p>
        </div>
      </footer>
    </div>
  );
}
