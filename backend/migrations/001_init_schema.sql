-- RTPL HireNeuron Verity PostgreSQL Schema Migration
-- Compatible with PostgreSQL 13+

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(128) PRIMARY KEY,
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
    hash VARCHAR(256) PRIMARY KEY,
    sid VARCHAR(128) NOT NULL,
    role VARCHAR(64) NOT NULL,
    expires DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS pairing (
    hash VARCHAR(256) PRIMARY KEY,
    sid VARCHAR(128) NOT NULL,
    expires DOUBLE PRECISION NOT NULL,
    used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs (
    sid VARCHAR(128) PRIMARY KEY,
    state VARCHAR(64) NOT NULL,
    updated DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY,
    username VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(64) NOT NULL DEFAULT 'recruiter',
    is_active INTEGER DEFAULT 1,
    created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS candidates (
    id VARCHAR(128) PRIMARY KEY,
    candidate_code VARCHAR(64) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(64) DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    temp_password_unhashed VARCHAR(255) DEFAULT '',
    job_id VARCHAR(128) DEFAULT '',
    resume_text TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS recruitment_jobs (
    id VARCHAR(128) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    department VARCHAR(128) DEFAULT 'Engineering',
    employment_type VARCHAR(64) DEFAULT 'Full-time',
    description TEXT NOT NULL,
    required_skills TEXT DEFAULT '',
    preferred_skills TEXT DEFAULT '',
    experience_level VARCHAR(64) DEFAULT 'Mid-Level',
    difficulty VARCHAR(64) DEFAULT 'intermediate',
    status VARCHAR(64) DEFAULT 'ACTIVE',
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS interview_schedules (
    id VARCHAR(128) PRIMARY KEY,
    session_id VARCHAR(128) UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    candidate_id VARCHAR(128) NOT NULL,
    job_id VARCHAR(128) NOT NULL,
    title VARCHAR(255) NOT NULL,
    scheduled_time DOUBLE PRECISION NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    early_join_minutes INTEGER DEFAULT 15,
    status VARCHAR(64) DEFAULT 'SCHEDULED',
    created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(128) PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128),
    action VARCHAR(128) NOT NULL,
    details TEXT NOT NULL,
    timestamp DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidates_code ON candidates(candidate_code);
CREATE INDEX IF NOT EXISTS idx_schedules_cand ON interview_schedules(candidate_id);
CREATE INDEX IF NOT EXISTS idx_schedules_time ON interview_schedules(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp);
