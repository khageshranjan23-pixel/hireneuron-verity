"""Transactional single-node prototype storage. Serialize mutations across workers."""
import sqlite3,json,os
from contextlib import contextmanager
from pathlib import Path
DB=os.getenv('DATABASE_PATH','data/verity.db')
def connect():
 Path(DB).parent.mkdir(parents=True,exist_ok=True)
 c=sqlite3.connect(DB,timeout=15,isolation_level=None);c.row_factory=sqlite3.Row
 c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA foreign_keys=ON');return c

def init():
 with connect() as c:
  c.executescript("""CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS credentials(hash TEXT PRIMARY KEY, sid TEXT NOT NULL, role TEXT NOT NULL, expires REAL NOT NULL);
  CREATE TABLE IF NOT EXISTS pairing(hash TEXT PRIMARY KEY,sid TEXT NOT NULL,expires REAL NOT NULL,used INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS jobs(sid TEXT PRIMARY KEY,state TEXT NOT NULL,updated REAL NOT NULL);""")
@contextmanager
def tx():
 c=connect();c.execute('BEGIN IMMEDIATE')
 try: yield c;c.commit()
 except Exception: c.rollback();raise
 finally:c.close()
def get(c,sid):
 row=c.execute('SELECT data FROM sessions WHERE id=?',(sid,)).fetchone()
 if not row: raise KeyError('Session not found')
 return json.loads(row[0])
def put(c,s):
 s['revision']+=1
 c.execute('INSERT INTO sessions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',(s['id'],json.dumps(s)))
