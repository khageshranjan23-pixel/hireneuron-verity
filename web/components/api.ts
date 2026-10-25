export const BASE = typeof window !== 'undefined' ? '/backend' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');

export async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    cache: 'no-store'
  });
  
  if (!r.ok) {
    let e;
    try {
      e = await r.json();
    } catch {
      e = { detail: 'Service unavailable' };
    }
    throw new Error(typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail));
  }
  return r.json();
}

export type Span = {
  id: string;
  text: string;
  phase: string;
  offset: number;
  source?: string;
};

export type QuestionScores = {
  status: string;
  scores?: Record<string, number>;
  evidence?: { span_id: string; quote: string }[];
  rationale: string;
  demonstrated_concepts?: string[];
  technical_correctness?: string;
  reasoning_and_problem_solving?: string;
  explanation_clarity?: string;
  areas_needing_further_assessment?: string[];
  strengths?: string[];
  gaps?: string[];
  model?: string;
};

export type Question = {
  id: string;
  slot: number;
  text: string;
  category: string;
  skill: string;
  locked: boolean;
  status: string;
  spans: Span[];
  followup: string | null;
  scores: QuestionScores | null;
};

export type WorkExperience = {
  role: string;
  company: string;
  duration?: string;
  summary?: string;
};

export type Education = {
  degree: string;
  institution: string;
  year?: string;
};

export type CandidateProfile = {
  name?: string;
  email?: string;
  skills?: string[];
  experience?: WorkExperience[];
  education?: Education[];
  projects?: string[];
  certifications?: string[];
};

export type SkillAlignment = {
  matched_skills?: string[];
  claimed_skills?: string[];
  missing_skills?: string[];
  alignment_summary?: string;
};

export type RecordingInfo = {
  id: string;
  filename: string;
  sha256: string;
  size: number;
  duration_seconds?: number;
  created_at: number;
  status: string;
  provenance?: string;
};

export type Session = {
  id: string;
  state: string;
  current: number;
  phase: string;
  pending_skip: boolean;
  started_at: number | null;
  question_started_at: number | null;
  config: {
    candidate_name: string;
    job_title: string;
    skills: string[];
    duration_minutes: number;
    answer_seconds: number;
    job_description?: string;
  };
  questions: Question[];
  generation: string;
  profile?: CandidateProfile;
  alignment?: SkillAlignment;
  recording?: RecordingInfo | null;
  events: {
    id: string;
    type: string;
    role: string;
    severity: string;
    offset: number;
    frame_count: number;
    received_at?: number;
    seal?: string;
    snapshot_sha256?: string;
  }[];
  audit: {
    id: string;
    target_id: string;
    score?: number;
    reason: string;
    disposition?: string;
    reviewer?: string;
    at?: number;
  }[];
  coverage: Record<string, {
    received_at: number;
    frames: Record<string, number>;
    algorithm?: string;
  }>;
};

export type RecruitmentJob = {
  id: string;
  title: string;
  department: string;
  employment_type: string;
  description: string;
  required_skills: string;
  preferred_skills?: string;
  experience_level: string;
  difficulty: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  created_at: number;
};

export type Candidate = {
  id: string;
  candidate_code: string;
  full_name: string;
  email: string;
  phone?: string;
  job_id?: string;
  resume_text?: string;
  temp_password_unhashed?: string;
  temp_password?: string;
  created_at: number;
};

export type InterviewSchedule = {
  id: string;
  session_id: string;
  candidate_id: string;
  job_id: string;
  title: string;
  scheduled_time: number;
  duration_minutes: number;
  early_join_minutes: number;
  status: string;
  candidate_name?: string;
  candidate_code?: string;
  candidate_email?: string;
  job_title?: string;
  job_department?: string;
  created_at: number;
};

export type RecruiterMetrics = {
  total_jobs: number;
  active_jobs: number;
  total_candidates: number;
  upcoming_interviews: number;
  in_progress_interviews: number;
  completed_interviews: number;
  reports_pending_review: number;
};

