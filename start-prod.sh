#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export TIMESHEET_ENV="${TIMESHEET_ENV:-production}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8888}"
export TIMESHEET_SEED_DEMO="${TIMESHEET_SEED_DEMO:-0}"

mkdir -p data

if [[ "${SECRET_KEY:-}" == "" || "${SECRET_KEY}" == "change-me-to-a-long-random-string" ]]; then
  echo "ERROR: Set SECRET_KEY in .env before production start" >&2
  exit 1
fi

if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

echo "Starting Timesheet (production) on http://${HOST}:${PORT}"
exec gunicorn \
  --bind "${HOST}:${PORT}" \
  --workers "${GUNICORN_WORKERS:-2}" \
  --timeout "${GUNICORN_TIMEOUT:-120}" \
  --access-logfile - \
  --error-logfile - \
  server:app
