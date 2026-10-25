import os,hashlib,secrets
from pathlib import Path
from cryptography.fernet import Fernet
from .core import seal,uid

def key():return Fernet(os.environ['EVIDENCE_KEY'].encode())
def persist(s,jpeg,meta):
 root=Path(os.getenv('EVIDENCE_PATH','data/evidence'));root.mkdir(parents=True,exist_ok=True)
 eid=uid();path=root/(eid+'.enc');tmp=root/(eid+'.tmp')
 sha=hashlib.sha256(jpeg).hexdigest();tmp.write_bytes(key().encrypt(jpeg));os.replace(tmp,path)
 if hashlib.sha256(key().decrypt(path.read_bytes())).hexdigest()!=sha:raise ValueError('Stored checksum failed')
 record=dict(id=eid,session_id=s['id'],**meta,snapshot_sha256=sha,previous=s['events'][-1]['seal'] if s['events'] else 'GENESIS')
 record['seal']=seal(record,os.environ['SIGNING_KEY']);s['events'].append(record);return record

def read(eid):
 # Caller resolves exact event ID from authorized session before calling.
 return key().decrypt((Path(os.getenv('EVIDENCE_PATH','data/evidence'))/(eid+'.enc')).read_bytes())
