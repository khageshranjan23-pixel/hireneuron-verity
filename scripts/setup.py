"""Run from repository root. Never overwrites existing secrets."""
from pathlib import Path
import secrets
from cryptography.fernet import Fernet
root=Path(__file__).resolve().parents[1]
p=root/'.env'
if p.exists():raise SystemExit('.env already exists; edit it rather than regenerating encryption keys.')
text=(root/'.env.example').read_text()
for name in ['RECRUITER_TOKEN','WORKER_TOKEN','SIGNING_KEY']:
 text=text.replace(name+'=REPLACE_ME',name+'='+secrets.token_urlsafe(32))
text=text.replace('EVIDENCE_KEY=REPLACE_ME','EVIDENCE_KEY='+Fernet.generate_key().decode())
p.write_text(text);p.chmod(0o600)
(root/'web/.env.local').write_text('NEXT_PUBLIC_API_URL=http://localhost:8000\n')
print('Created .env and web/.env.local. Open .env locally for your recruiter token. Keep keys private.')
