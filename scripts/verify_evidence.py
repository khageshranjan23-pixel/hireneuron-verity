"""Verify event chain and stored snapshot hashes; exit nonzero on tampering."""
import sys,os,hmac,hashlib
from pathlib import Path
from dotenv import load_dotenv
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));load_dotenv()
from backend.app import store,evidence,core
with store.connect() as c:s=store.get(c,sys.argv[1])
prev='GENESIS'
for e in s['events']:
 data={k:v for k,v in e.items() if k!='seal'}
 assert e['previous']==prev,'Chain mismatch'
 assert hmac.compare_digest(e['seal'],core.seal(data,os.environ['SIGNING_KEY'])),'Record signature mismatch'
 assert hashlib.sha256(evidence.read(e['id'])).hexdigest()==e['snapshot_sha256'],'Snapshot mismatch'
 prev=e['seal']
print('Verified',len(s['events']),'events. This verifies integrity after server receipt, not physical authenticity.')
