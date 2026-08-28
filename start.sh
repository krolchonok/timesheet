#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT="${1:-8888}"
export HOST="${HOST:-0.0.0.0}"
export PORT="$PORT"
echo "Starting timesheet server on http://${HOST}:${PORT}"
echo "  Local:   http://127.0.0.1:${PORT}"
echo "  Network: http://10.0.0.16:${PORT}"
echo "  Login:   admin/admin or user/user"
echo ""
echo "Note: port 8080 on 10.0.0.16 is redirected elsewhere (iptables -> 192.168.100.1)"
exec python3 server.py
