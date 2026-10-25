#!/bin/bash
set -e

echo "========================================="
echo " Starting RTPL HireNeuron Verity Cloud   "
echo "========================================="

# Start FastAPI backend on internal port 8000
echo "Starting FastAPI Backend on 127.0.0.1:8000..."
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

# Wait for backend to become ready
echo "Waiting for FastAPI to initialize..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:8000/health > /dev/null 2>&1; then
        echo "FastAPI Backend is ready!"
        break
    fi
    sleep 1
done

# Start Next.js frontend on public port $PORT (Render provides dynamic $PORT, defaults to 3000)
TARGET_PORT="${PORT:-3000}"
echo "Starting Next.js Frontend on port ${TARGET_PORT}..."
cd /app/web
export BACKEND_INTERNAL_URL="http://127.0.0.1:8000"
exec node ./node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${TARGET_PORT}"
