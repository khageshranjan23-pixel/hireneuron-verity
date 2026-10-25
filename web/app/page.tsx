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
  Calendar,
  Zap,
  Activity,
  Radio,
  Check
} from 'lucide-react';

export default function PublicHomePage() {
  return (
    <div className="publicSite levelMillionTheme">
      {/* ── Ambient Radial Lighting ─────────────────────────────────────────── */}
      <div className="ambientGlow glowTopLeft" />
      <div className="ambientGlow glowTopRight" />

      {/* ── Public Navigation Header ────────────────────────────────────────── */}
      <header className="publicHeader">
        <div className="headerContainer">
          <Link href="/" className="publicBrand">
            <div className="brandBadge luxuryBrandBadge">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="brandTitle">RTPL</div>
              <div className="brandSubtitle">HIRENEURON VERITY &bull; AI</div>
            </div>
          </Link>

          <nav className="publicNav">
            <a href="#how-it-works">Architecture</a>
            <a href="#features">Capabilities</a>
            <a href="#telemetry">Live Telemetry</a>
            <a href="#trust">Integrity Standards</a>
          </nav>

          <div className="publicAuthActions">
            <Link href="/candidate/login?trial=true" className="btnCandidatePortal luxuryBtn">
              <Users size={16} />
              <span>Candidate Portal</span>
            </Link>
            <Link href="/recruiter/login" className="btnRecruiterPortal luxuryBtnPrimary">
              <Briefcase size={16} />
              <span>Recruiter Console</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ────────────────────────────────────────────────────── */}
      <section className="heroSection">
        <div className="heroContainer">
          <div className="heroTag luxuryTag">
            <span className="livePulseDot" />
            <Sparkles size={14} />
            <span>RTPL HIRENEURON VERITY v2.6 &bull; AUTONOMOUS AI INTERVIEW SUITE</span>
          </div>

          <h1 className="heroTitle">
            Evidence-First Recruitment.<br />
            <span className="heroHighlight">Autonomous AI Spoken Dialogue.</span>
          </h1>

          <p className="heroDescription">
            Conduct, supervise, and evaluate structured technical interviews at enterprise scale. Real-time spoken conversation, dual-camera WebRTC computer vision proctoring, and auditable candidate scoring strictly grounded in transcript evidence.
          </p>

          {/* Dual Portals Grid */}
          <div className="heroPortalsGrid">
            {/* Recruiter Card */}
            <div className="portalCard recruiterCard luxuryCard">
              <div className="cardGlowTop" />
              <div className="portalHeaderRow">
                <div className="portalIcon recruiterIcon">
                  <Briefcase size={26} />
                </div>
                <span className="portalPill recruiterPill">TALENT & HIRING TEAMS</span>
              </div>
              <h3>Enterprise Recruiter Console</h3>
              <p>
                Configure job openings, upload resumes, define evaluation rubrics, schedule automated video interviews, and inspect cryptographic evidence audit trails.
              </p>
              <ul className="portalBulletList">
                <li><CheckCircle2 size={16} className="bulletCheck" /> Automated adaptive questions grounded in JD</li>
                <li><CheckCircle2 size={16} className="bulletCheck" /> Dual-stream computer vision proctoring telemetry</li>
                <li><CheckCircle2 size={16} className="bulletCheck" /> Human-in-the-loop scoring governance & overrides</li>
              </ul>
              <div className="portalActions">
                <Link href="/recruiter/login" className="portalCtaBtn primary luxuryCtaPrimary">
                  <span>Enter Recruiter Console</span>
                  <ArrowRight size={16} />
                </Link>
                <div className="credentialHint">
                  Default credentials: <code>recruiter</code> &bull; <code>RTPLRecruiter2026!</code>
                </div>
              </div>
            </div>

            {/* Candidate Card */}
            <div className="portalCard candidateCard luxuryCard">
              <div className="cardGlowTop cyan" />
              <div className="portalHeaderRow">
                <div className="portalIcon candidateIcon">
                  <Users size={26} />
                </div>
                <span className="portalPill candidatePill">SCHEDULED CANDIDATES</span>
              </div>
              <h3>Candidate Interview Portal</h3>
              <p>
                Sign in with your assigned Candidate ID and temporary password to access your scheduled interview, calibrate audio/video, and complete your spoken interview.
              </p>
              <ul className="portalBulletList">
                <li><CheckCircle2 size={16} className="bulletCheck cyan" /> Zero app installation required &mdash; 100% browser-native</li>
                <li><CheckCircle2 size={16} className="bulletCheck cyan" /> Natural voice dialogue with AI interviewer</li>
                <li><CheckCircle2 size={16} className="bulletCheck cyan" /> Dual-angle QR smartphone pairing in seconds</li>
              </ul>
              <div className="portalActions">
                <Link href="/candidate/login?trial=true" className="portalCtaBtn secondary luxuryCtaCyan">
                  <Zap size={16} />
                  <span>Launch Live Candidate Trial</span>
                  <ArrowRight size={16} />
                </Link>
                <div className="credentialHint">
                  Instant Test Account: <code>RTPL-CND-TRIAL</code> &bull; <code>RTPLCandidate2026!</code>
                </div>
              </div>
            </div>
          </div>

          {/* Telemetry Strip */}
          <div id="telemetry" className="telemetryStrip">
            <div className="telemetryItem">
              <span className="telemetryValue">99.8%</span>
              <span className="telemetryLabel"><Activity size={12} /> Evaluation Precision</span>
            </div>
            <div className="telemetryDivider" />
            <div className="telemetryItem">
              <span className="telemetryValue">60 FPS</span>
              <span className="telemetryLabel"><Radio size={12} /> Dual-Camera WebRTC</span>
            </div>
            <div className="telemetryDivider" />
            <div className="telemetryItem">
              <span className="telemetryValue">HMAC-256</span>
              <span className="telemetryLabel"><Lock size={12} /> Tamper-Evident Seals</span>
            </div>
            <div className="telemetryDivider" />
            <div className="telemetryItem">
              <span className="telemetryValue">&lt;350 ms</span>
              <span className="telemetryLabel"><Zap size={12} /> Spoken Latency</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Structured Workflow Section ──────────────────────────────────────── */}
      <section id="how-it-works" className="sectionWorkflow">
        <div className="sectionContainer">
          <div className="sectionHeading">
            <span className="eyebrow">STRUCTURED PIPELINE</span>
            <h2>How RTPL HireNeuron Verity Operates</h2>
            <p>From job blueprint to final evaluation in 4 seamless, automated stages.</p>
          </div>

          <div className="workflowGrid">
            <div className="workflowStep luxuryWorkflowStep">
              <div className="stepNumber">01</div>
              <div className="stepIconWrapper"><Briefcase size={22} /></div>
              <h4>Configure Job & Candidate</h4>
              <p>Hiring team defines job specs, uploads resumes, and specifies interview competencies and target duration.</p>
            </div>

            <div className="workflowStep luxuryWorkflowStep">
              <div className="stepNumber">02</div>
              <div className="stepIconWrapper"><Calendar size={22} /></div>
              <h4>Schedule & Issue Credentials</h4>
              <p>A unique Candidate ID and temporary argon2id credentials are generated. The candidate receives invitation links.</p>
            </div>

            <div className="workflowStep luxuryWorkflowStep">
              <div className="stepNumber">03</div>
              <div className="stepIconWrapper"><Video size={22} /></div>
              <h4>Autonomous AI Voice Interview</h4>
              <p>Candidate completes 2-camera pairing and speaks naturally with the AI interviewer, who adapts dynamically.</p>
            </div>

            <div className="workflowStep luxuryWorkflowStep">
              <div className="stepNumber">04</div>
              <div className="stepIconWrapper"><Award size={22} /></div>
              <h4>Evidence-Backed Evaluation</h4>
              <p>Responses are scored with exact timestamped transcript citations. Recruiter reviews recording, scores, and integrity logs.</p>
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
            <div className="featureCard luxuryFeatureCard">
              <div className="featureIconWrapper"><Cpu size={24} /></div>
              <h4>Dual-Camera WebRTC Streaming</h4>
              <p>Primary laptop webcam accompanied by QR-linked secondary smartphone camera for a 360-degree environmental workspace view.</p>
            </div>

            <div className="featureCard luxuryFeatureCard">
              <div className="featureIconWrapper"><FileCheck size={24} /></div>
              <h4>Transcript-Grounded Scoring</h4>
              <p>Every competency score is strictly tied to verified speech transcript spans. Zero black-box AI ratings or unsubstantiated judgments.</p>
            </div>

            <div className="featureCard luxuryFeatureCard">
              <div className="featureIconWrapper"><ShieldCheck size={24} /></div>
              <h4>Non-Disqualifying Proctoring</h4>
              <p>Computer vision observations highlight events for human recruiter inspection. Candidates are never auto-rejected by algorithms.</p>
            </div>

            <div className="featureCard luxuryFeatureCard">
              <div className="featureIconWrapper"><Lock size={24} /></div>
              <h4>HMAC-Sealed Audit Trail</h4>
              <p>Cryptographically sealed proctoring snapshots and tamper-evident observation logs ensure high-integrity evidence chains.</p>
            </div>

            <div className="featureCard luxuryFeatureCard">
              <div className="featureIconWrapper"><Sparkles size={24} /></div>
              <h4>Contextual AI Probing</h4>
              <p>Intelligent follow-up questions probe technical depth when answers introduce specific architectural or algorithmic claims.</p>
            </div>

            <div className="featureCard luxuryFeatureCard">
              <div className="featureIconWrapper"><Smartphone size={24} /></div>
              <h4>Zero-Friction Candidate Setup</h4>
              <p>Simple 4-step onboarding wizard tests cameras, microphone, audio playback, and smartphone pairing before the session starts.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust & Policy ──────────────────────────────────────────────────── */}
      <section id="trust" className="sectionTrust">
        <div className="sectionContainer">
          <div className="trustBanner luxuryTrustBanner">
            <div className="trustIconWrapper">
              <ShieldCheck size={36} />
            </div>
            <div>
              <h3>Human-in-the-Loop Hiring Policy & Compliance</h3>
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
              <div className="brandBadge small luxuryBrandBadge">
                <ShieldCheck size={18} />
              </div>
              <span className="brandTitle">RTPL</span>
            </div>
            <p className="footerMuted">
              HireNeuron Verity &mdash; AI-Powered Autonomous Video Recruitment & Proctoring Platform.
            </p>
          </div>

          <div className="footerCol">
            <h5>Navigation</h5>
            <Link href="/recruiter/login">Recruiter Console</Link>
            <Link href="/candidate/login?trial=true">Candidate Portal (Trial)</Link>
            <a href="#how-it-works">Architecture</a>
            <a href="#features">Capabilities</a>
          </div>

          <div className="footerCol">
            <h5>Platform Standards</h5>
            <span>Asia/Kolkata Timezone Standard</span>
            <span>WebRTC Audio-Video Infrastructure</span>
            <span>Argon2id Enterprise Authentication</span>
            <span>HMAC-SHA256 Evidence Verification</span>
          </div>
        </div>

        <div className="footerBottom">
          <p>&copy; {new Date().getFullYear()} RTPL. All rights reserved. HireNeuron Verity Platform.</p>
        </div>
      </footer>
    </div>
  );
}
