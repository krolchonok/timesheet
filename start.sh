#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8888}"
export TIMESHEET_ENV="${TIMESHEET_ENV:-development}"
export HOST="${HOST:-0.0.0.0}"
export PORT="$PORT"
export TIMESHEET_SEED_DEMO="${TIMESHEET_SEED_DEMO:-1}"

mkdir -p data

if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

echo "Starting Timesheet (development) on http://${HOST}:${PORT}"
echo "  Login: admin/admin or user/user (demo)"
echo ""
exec python3 server.py
