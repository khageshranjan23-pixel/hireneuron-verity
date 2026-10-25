#!/usr/bin/env python3
"""
RTPL HireNeuron Verity - SQLite to PostgreSQL Data Migration Script
Transfers schema and data from local verity.db to managed PostgreSQL.
"""
import os
import sys
import sqlite3
import argparse
from pathlib import Path

def migrate(sqlite_path: str, pg_url: str):
    import psycopg2
    from psycopg2.extras import execute_batch

    print(f"[*] Starting migration from SQLite: {sqlite_path}")
    print(f"[*] Target PostgreSQL URL: {pg_url.split('@')[-1] if '@' in pg_url else 'specified'}")

    if not os.path.exists(sqlite_path):
        print(f"[!] SQLite database not found at {sqlite_path}")
        return False

    sconn = sqlite3.connect(sqlite_path)
    sconn.row_factory = sqlite3.Row
    scur = sconn.cursor()

    pconn = psycopg2.connect(pg_url)
    pcur = pconn.cursor()

    schema_file = Path(__file__).resolve().parent.parent / "backend" / "migrations" / "001_init_schema.sql"
    if schema_file.exists():
        print("[*] Applying PostgreSQL DDL schema...")
        with open(schema_file, "r", encoding="utf-8") as f:
            pcur.execute(f.read())
        pconn.commit()

    tables = [
        "sessions",
        "credentials",
        "pairing",
        "jobs",
        "users",
        "candidates",
        "recruitment_jobs",
        "interview_schedules",
        "platform_settings",
        "audit_logs"
    ]

    for table in tables:
        try:
            scur.execute(f"SELECT * FROM {table}")
            rows = scur.fetchall()
            if not rows:
                print(f"[-] {table}: 0 rows to migrate.")
                continue

            col_names = [d[0] for d in scur.description]
            cols_str = ", ".join(col_names)
            placeholders = ", ".join(["%s"] * len(col_names))

            insert_sql = f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
            
            data = [tuple(r) for r in rows]
            execute_batch(pcur, insert_sql, data, page_size=100)
            pconn.commit()
            print(f"[+] {table}: Successfully migrated {len(data)} rows.")
        except Exception as e:
            print(f"[!] Error migrating table {table}: {e}")
            pconn.rollback()

    sconn.close()
    pconn.close()
    print("[*] Migration completed successfully.")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate SQLite verity.db to PostgreSQL")
    parser.add_argument("--sqlite", default="verity.db", help="Path to verity.db")
    parser.add_argument("--pg", default=os.getenv("DATABASE_URL"), help="PostgreSQL connection string")
    args = parser.parse_args()

    if not args.pg:
        print("[!] DATABASE_URL not set and --pg not provided.")
        sys.exit(1)

    success = migrate(args.sqlite, args.pg)
    sys.exit(0 if success else 1)
