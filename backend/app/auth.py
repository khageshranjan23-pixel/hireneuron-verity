"""Enterprise Authentication and Role Management for RTPL HireNeuron Verity.
Implements Argon2id password hashing, JWT sessions, role verification, and candidate credential generation.
Preserves legacy bearer token fallback for automated workers.
"""
import os
import time
import secrets
import string
import jwt
from typing import Optional, Dict, Any
from fastapi import HTTPException, Header, Cookie, Depends
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

ph = PasswordHasher()

JWT_SECRET = os.getenv('SIGNING_KEY', 'default-rtpl-signing-key-32-chars-min-len')
JWT_ALGORITHM = 'HS256'
TOKEN_EXPIRY_SECONDS = 86400 * 7  # 7 days

def hash_password(plain: str) -> str:
    """Hash password with Argon2id."""
    return ph.hash(plain)

def verify_password(hashed: str, plain: str) -> bool:
    """Verify password against Argon2id hash."""
    try:
        return ph.verify(hashed, plain)
    except (VerifyMismatchError, InvalidHashError):
        return False

def generate_random_password(length: int = 12) -> str:
    """Generate a secure, human-readable temporary password for candidates."""
    chars = string.ascii_letters + string.digits + "!@#$"
    prefix = "RTPL-"
    body = "".join(secrets.choice(chars) for _ in range(length - 5))
    return prefix + body

def generate_candidate_code(next_num: int) -> str:
    """Format canonical candidate code, e.g. RTPL-CND-000001."""
    return f"RTPL-CND-{next_num:06d}"

def create_access_token(payload: Dict[str, Any], expires_seconds: float = TOKEN_EXPIRY_SECONDS) -> str:
    """Issue a signed JWT access token."""
    to_encode = payload.copy()
    to_encode.update({
        'exp': time.time() + expires_seconds,
        'iat': time.time()
    })
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT access token."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, 'Session expired. Please log in again.')
    except jwt.PyJWTError:
        raise HTTPException(401, 'Invalid authentication token.')

def extract_token_from_request(
    authorization: str = Header(default=''),
    rtpl_token: Optional[str] = Cookie(default=None)
) -> str:
    """Extract token from Authorization Bearer header or HttpOnly cookie."""
    if authorization.startswith('Bearer '):
        return authorization[7:].strip()
    if rtpl_token:
        return rtpl_token.strip()
    return ''

def get_current_principal(
    token: str = Depends(extract_token_from_request)
) -> Dict[str, Any]:
    """Resolve current user/candidate/worker principal from token or legacy environment token."""
    if not token:
        raise HTTPException(401, 'Authentication required.')

    # 1. Backwards compatibility: Check legacy RECRUITER_TOKEN from env
    recruiter_token_env = os.getenv('RECRUITER_TOKEN', '')
    if recruiter_token_env and secrets.compare_digest(token, recruiter_token_env):
        return {
            'role': 'recruiter',
            'id': 'legacy-recruiter-id',
            'username': 'recruiter_admin',
            'name': 'RTPL Lead Recruiter',
            'sid': None,
            'is_legacy': True
        }

    # 2. Backwards compatibility: Check legacy WORKER_TOKEN from env
    worker_token_env = os.getenv('WORKER_TOKEN', '')
    if worker_token_env and secrets.compare_digest(token, worker_token_env):
        return {
            'role': 'worker',
            'id': 'legacy-worker-id',
            'username': 'system_worker',
            'name': 'HireNeuron Worker',
            'sid': None,
            'is_legacy': True
        }

    # 3. Check legacy credentials table (e.g. minted candidate tokens from session creator)
    from . import store, core
    with store.connect() as c:
        row = c.execute(
            'SELECT * FROM credentials WHERE hash=? AND expires>?',
            (core.digest(token), time.time())
        ).fetchone()
        if row:
            d = dict(row)
            return {
                'role': d['role'],
                'id': d['sid'],
                'sid': d['sid'],
                'candidate_id': d['sid'],
                'name': 'Candidate',
                'is_legacy': True
            }

    # 4. Standard JWT token
    data = decode_access_token(token)
    return data

def require_recruiter(principal: Dict[str, Any] = Depends(get_current_principal)) -> Dict[str, Any]:
    """Guard route to admin or recruiter roles only."""
    if principal.get('role') not in ('recruiter', 'admin', 'worker'):
        raise HTTPException(403, 'Recruiter or Administrator privileges required.')
    return principal

def require_admin(principal: Dict[str, Any] = Depends(get_current_principal)) -> Dict[str, Any]:
    """Guard route to admin role only."""
    if principal.get('role') != 'admin':
        raise HTTPException(403, 'Administrator privileges required.')
    return principal

def require_candidate(principal: Dict[str, Any] = Depends(get_current_principal)) -> Dict[str, Any]:
    """Guard route to candidate role only."""
    if principal.get('role') != 'candidate':
        raise HTTPException(403, 'Candidate login required.')
    return principal
