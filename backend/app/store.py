"""Transactional storage for RTPL HireNeuron Verity.
Manages sessions, user accounts, candidate profiles, recruitment job openings, and interview schedules.
Supports durable relational storage with automatic bootstrap for RTPL administration.
"""
import sqlite3
import json
import os
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Any, List, Optional

DB = os.getenv('DATABASE_PATH', 'data/verity.db')

def connect():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB, timeout=20, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA foreign_keys=ON')
    return c

def init():
    with connect() as c:
        # Existing core tables
        c.executescript("""
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS credentials(hash TEXT PRIMARY KEY, sid TEXT NOT NULL, role TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS pairing(hash TEXT PRIMARY KEY, sid TEXT NOT NULL, expires REAL NOT NULL, used INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS jobs(sid TEXT PRIMARY KEY, state TEXT NOT NULL, updated REAL NOT NULL);
        
        -- Enterprise User Management (Admin & Recruiters)
        CREATE TABLE IF NOT EXISTS users(
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'recruiter', -- 'admin' or 'recruiter'
            is_active INTEGER DEFAULT 1,
            created_at REAL NOT NULL
        );
        
        -- Candidate Profiles & Credentials
        CREATE TABLE IF NOT EXISTS candidates(
            id TEXT PRIMARY KEY,
            candidate_code TEXT UNIQUE NOT NULL, -- e.g. RTPL-CND-000001
            full_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT DEFAULT '',
            password_hash TEXT NOT NULL,
            temp_password_unhashed TEXT DEFAULT '',
            job_id TEXT DEFAULT '',
            resume_text TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1,
            created_at REAL NOT NULL
        );
        
        -- Job Openings
        CREATE TABLE IF NOT EXISTS recruitment_jobs(
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            department TEXT DEFAULT 'Engineering',
            employment_type TEXT DEFAULT 'Full-time',
            description TEXT NOT NULL,
            required_skills TEXT DEFAULT '',
            preferred_skills TEXT DEFAULT '',
            experience_level TEXT DEFAULT 'Mid-Level',
            difficulty TEXT DEFAULT 'intermediate',
            status TEXT DEFAULT 'ACTIVE', -- 'DRAFT', 'ACTIVE', 'CLOSED'
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
        
        -- Interview Schedules & Lifecycle
        CREATE TABLE IF NOT EXISTS interview_schedules(
            id TEXT PRIMARY KEY,
            session_id TEXT UNIQUE NOT NULL,
            candidate_id TEXT NOT NULL,
            job_id TEXT NOT NULL,
            title TEXT NOT NULL,
            scheduled_time REAL NOT NULL, -- epoch seconds
            duration_minutes INTEGER DEFAULT 30,
            early_join_minutes INTEGER DEFAULT 15,
            status TEXT DEFAULT 'SCHEDULED', -- 'DRAFT','SCHEDULED','READY_TO_JOIN','IN_PROGRESS','COMPLETED','REVIEW_READY','CANCELLED'
            created_at REAL NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        
        -- System & Organization Settings
        CREATE TABLE IF NOT EXISTS platform_settings(
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        
        -- Audit Trail
        CREATE TABLE IF NOT EXISTS audit_logs(
            id TEXT PRIMARY KEY,
            user_id TEXT,
            action TEXT NOT NULL,
            details TEXT NOT NULL,
            timestamp REAL NOT NULL
        );
        """)

        # Bootstrap default admin & recruiter if users table is empty
        row = c.execute('SELECT COUNT(*) FROM users').fetchone()
        if row[0] == 0:
            from .auth import hash_password
            now = time.time()
            admin_id = str(uuid.uuid4())
            admin_pw = os.getenv('INITIAL_ADMIN_PASSWORD', 'RTPLAdmin2026!')
            c.execute(
                "INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
                (admin_id, 'admin', 'admin@rtpl.internal', hash_password(admin_pw), 'RTPL Administrator', 'admin', now)
            )

            recruiter_id = str(uuid.uuid4())
            recruiter_pw = os.getenv('INITIAL_RECRUITER_PASSWORD', 'RTPLRecruiter2026!')
            c.execute(
                "INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
                (recruiter_id, 'recruiter', 'recruiter@rtpl.internal', hash_password(recruiter_pw), 'RTPL Talent Partner', 'recruiter', now)
            )

        # Bootstrap default settings
        defaults = {
            'organization_name': 'RTPL',
            'platform_title': 'HireNeuron Verity',
            'default_timezone': 'Asia/Kolkata',
            'default_question_count': '10',
            'early_join_minutes': '15',
            'require_dual_camera': 'optional'
        }
        for k, v in defaults.items():
            c.execute("INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)", (k, v))

@contextmanager
def tx():
    c = connect()
    c.execute('BEGIN IMMEDIATE')
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()

# Existing core session methods (DO NOT CHANGE SIGNATURES)
def get(c, sid: str) -> Dict[str, Any]:
    row = c.execute('SELECT data FROM sessions WHERE id=?', (sid,)).fetchone()
    if not row:
        raise KeyError('Session not found')
    return json.loads(row[0])

def put(c, s: Dict[str, Any]):
    s['revision'] += 1
    c.execute('INSERT INTO sessions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (s['id'], json.dumps(s)))

# ── User queries ─────────────────────────────────────────────────────────────
def get_user_by_username_or_email(c, identifier: str) -> Optional[Dict[str, Any]]:
    row = c.execute(
        "SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1",
        (identifier, identifier)
    ).fetchone()
    return dict(row) if row else None

def get_user_by_id(c, user_id: str) -> Optional[Dict[str, Any]]:
    row = c.execute("SELECT * FROM users WHERE id = ? AND is_active = 1", (user_id,)).fetchone()
    return dict(row) if row else None

def list_users(c) -> List[Dict[str, Any]]:
    rows = c.execute("SELECT id, username, email, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]

def create_user(c, username: str, email: str, password_hash: str, full_name: str, role: str = 'recruiter') -> Dict[str, Any]:
    uid = str(uuid.uuid4())
    now = time.time()
    c.execute(
        "INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
        (uid, username, email, password_hash, full_name, role, now)
    )
    return {'id': uid, 'username': username, 'email': email, 'full_name': full_name, 'role': role, 'created_at': now}

# ── Candidate queries ─────────────────────────────────────────────────────────
def count_candidates(c) -> int:
    return c.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]

def get_candidate_by_code(c, code: str) -> Optional[Dict[str, Any]]:
    row = c.execute("SELECT * FROM candidates WHERE candidate_code = ? AND is_active = 1", (code.strip().upper(),)).fetchone()
    return dict(row) if row else None

def get_candidate_by_id(c, candidate_id: str) -> Optional[Dict[str, Any]]:
    row = c.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
    return dict(row) if row else None

def list_candidates(c) -> List[Dict[str, Any]]:
    rows = c.execute("SELECT id, candidate_code, full_name, email, phone, job_id, resume_text, is_active, created_at, temp_password_unhashed FROM candidates ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]

def create_candidate(c, full_name: str, email: str, phone: str, password_hash: str, temp_password: str, job_id: str = '', resume_text: str = '') -> Dict[str, Any]:
    next_idx = count_candidates(c) + 1
    code = f"RTPL-CND-{next_idx:06d}"
    cid = str(uuid.uuid4())
    now = time.time()
    c.execute(
        "INSERT INTO candidates (id, candidate_code, full_name, email, phone, password_hash, temp_password_unhashed, job_id, resume_text, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
        (cid, code, full_name, email, phone, password_hash, temp_password, job_id, resume_text, now)
    )
    return {
        'id': cid,
        'candidate_code': code,
        'full_name': full_name,
        'email': email,
        'phone': phone,
        'temp_password': temp_password,
        'job_id': job_id,
        'created_at': now
    }

# ── Job Openings ─────────────────────────────────────────────────────────────
def list_recruitment_jobs(c) -> List[Dict[str, Any]]:
    rows = c.execute("SELECT * FROM recruitment_jobs ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]

def get_recruitment_job(c, job_id: str) -> Optional[Dict[str, Any]]:
    row = c.execute("SELECT * FROM recruitment_jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None

def create_recruitment_job(c, title: str, department: str, employment_type: str, description: str, required_skills: str, preferred_skills: str, experience_level: str, difficulty: str, status: str = 'ACTIVE') -> Dict[str, Any]:
    jid = str(uuid.uuid4())
    now = time.time()
    c.execute(
        "INSERT INTO recruitment_jobs (id, title, department, employment_type, description, required_skills, preferred_skills, experience_level, difficulty, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (jid, title, department, employment_type, description, required_skills, preferred_skills, experience_level, difficulty, status, now, now)
    )
    return {
        'id': jid,
        'title': title,
        'department': department,
        'employment_type': employment_type,
        'description': description,
        'required_skills': required_skills,
        'preferred_skills': preferred_skills,
        'experience_level': experience_level,
        'difficulty': difficulty,
        'status': status,
        'created_at': now
    }

# ── Interview Schedules ──────────────────────────────────────────────────────
def create_interview_schedule(c, session_id: str, candidate_id: str, job_id: str, title: str, scheduled_time: float, duration_minutes: int = 30, early_join_minutes: int = 15) -> Dict[str, Any]:
    iid = str(uuid.uuid4())
    now = time.time()
    c.execute(
        "INSERT INTO interview_schedules (id, session_id, candidate_id, job_id, title, scheduled_time, duration_minutes, early_join_minutes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)",
        (iid, session_id, candidate_id, job_id, title, scheduled_time, duration_minutes, early_join_minutes, now)
    )
    return {
        'id': iid,
        'session_id': session_id,
        'candidate_id': candidate_id,
        'job_id': job_id,
        'title': title,
        'scheduled_time': scheduled_time,
        'duration_minutes': duration_minutes,
        'early_join_minutes': early_join_minutes,
        'status': 'SCHEDULED',
        'created_at': now
    }

def get_schedule_by_session_id(c, sid: str) -> Optional[Dict[str, Any]]:
    row = c.execute("SELECT * FROM interview_schedules WHERE session_id = ?", (sid,)).fetchone()
    return dict(row) if row else None

def get_schedule_by_id(c, schedule_id: str) -> Optional[Dict[str, Any]]:
    row = c.execute("SELECT * FROM interview_schedules WHERE id = ?", (schedule_id,)).fetchone()
    return dict(row) if row else None

def list_all_schedules(c) -> List[Dict[str, Any]]:
    query = """
    SELECT s.*, c.candidate_code, c.full_name as candidate_name, c.email as candidate_email, j.title as job_title, j.department as job_department
    FROM interview_schedules s
    LEFT JOIN candidates c ON s.candidate_id = c.id
    LEFT JOIN recruitment_jobs j ON s.job_id = j.id
    ORDER BY s.scheduled_time ASC
    """
    rows = c.execute(query).fetchall()
    return [dict(r) for r in rows]

def list_candidate_schedules(c, candidate_id: str) -> List[Dict[str, Any]]:
    query = """
    SELECT s.*, c.candidate_code, c.full_name as candidate_name, j.title as job_title, j.department as job_department
    FROM interview_schedules s
    LEFT JOIN candidates c ON s.candidate_id = c.id
    LEFT JOIN recruitment_jobs j ON s.job_id = j.id
    WHERE s.candidate_id = ?
    ORDER BY s.scheduled_time ASC
    """
    rows = c.execute(query, (candidate_id,)).fetchall()
    return [dict(r) for r in rows]

def update_schedule_status(c, session_id: str, new_status: str):
    c.execute("UPDATE interview_schedules SET status = ? WHERE session_id = ?", (new_status, session_id))

def log_audit(c, user_id: Optional[str], action: str, details: str):
    c.execute(
        "INSERT INTO audit_logs (id, user_id, action, details, timestamp) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), user_id, action, details, time.time())
    )
