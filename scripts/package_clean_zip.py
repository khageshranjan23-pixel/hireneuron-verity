"""Generates the clean distributable ZIP for HireNeuron Verity.
Ensures zero secrets, no node_modules, no .venv, no .next cache, and no temporary files.
"""
import os, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_DIRS = {
    '.git',
    '.venv',
    'node_modules',
    '.next',
    '__pycache__',
    'data',
    '.gemini',
    '.vscode'
}

EXCLUDE_EXTS = {
    '.pyc',
    '.pyo',
    '.pyd',
    '.zip',
    '.exe',
    '.db',
    '.sqlite',
    '.log'
}

EXCLUDE_FILES = {
    '.env',
    'test.db'
}

def package():
    out_path = ROOT / "HireNeuron_Verity_Final_Working_Prototype.zip"
    if out_path.exists():
        out_path.unlink()

    file_count = 0
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(ROOT.rglob('*')):
            if path.is_dir():
                continue
            
            # Check directory exclusions
            rel_parts = path.relative_to(ROOT).parts
            if any(part in EXCLUDE_DIRS for part in rel_parts):
                continue

            # Check filename exclusions
            if path.name in EXCLUDE_FILES or path.suffix.lower() in EXCLUDE_EXTS:
                continue

            arcname = str(path.relative_to(ROOT)).replace('\\', '/')
            zf.write(path, arcname)
            file_count += 1

    print(f"[✓] Created clean package: {out_path.name}")
    print(f"    - Files included: {file_count}")
    print(f"    - Size: {out_path.stat().st_size / 1024:.1f} KB")

if __name__ == '__main__':
    package()
