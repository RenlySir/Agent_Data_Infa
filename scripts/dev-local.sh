#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${TMPDIR:-/tmp}/agent-data-infa"
mkdir -p "$LOG_DIR"

GATEWAY_PORT="${GATEWAY_PORT:-8787}"
CONSOLE_PORT="${CONSOLE_PORT:-5173}"
MEMORY_GATEWAY_API_KEY="${MEMORY_GATEWAY_API_KEY:-dev-memory-key}"
MEMORY_PROVIDER="${MEMORY_PROVIDER:-noop}"
DETACH="${DETACH:-0}"

if [[ "$DETACH" == "1" ]]; then
  if ! command -v screen >/dev/null 2>&1; then
    echo "Detached mode requires screen." >&2
    exit 1
  fi

  screen -S agent-data-gateway -X quit >/dev/null 2>&1 || true
  screen -S agent-data-console -X quit >/dev/null 2>&1 || true

  screen -dmS agent-data-gateway bash -lc "cd '$ROOT_DIR/apps/memory-gateway' && PORT='$GATEWAY_PORT' MEMORY_PROVIDER='$MEMORY_PROVIDER' MEMORY_GATEWAY_API_KEY='$MEMORY_GATEWAY_API_KEY' npm run dev >'$LOG_DIR/gateway.log' 2>&1"
  screen -dmS agent-data-console bash -lc "cd '$ROOT_DIR/apps/memory-console' && npm run dev -- --port '$CONSOLE_PORT' >'$LOG_DIR/console.log' 2>&1"

  echo "Memory Gateway: http://localhost:$GATEWAY_PORT"
  echo "Memory Console: http://localhost:$CONSOLE_PORT"
  echo "Logs: $LOG_DIR"
  echo "Stop: screen -S agent-data-gateway -X quit; screen -S agent-data-console -X quit"
  exit 0
fi

cleanup() {
  if [[ -n "${GATEWAY_PID:-}" ]] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    kill "$GATEWAY_PID" 2>/dev/null || true
  fi
  if [[ -n "${CONSOLE_PID:-}" ]] && kill -0 "$CONSOLE_PID" 2>/dev/null; then
    kill "$CONSOLE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

(
  cd "$ROOT_DIR/apps/memory-gateway"
  PORT="$GATEWAY_PORT" \
    MEMORY_PROVIDER="$MEMORY_PROVIDER" \
    MEMORY_GATEWAY_API_KEY="$MEMORY_GATEWAY_API_KEY" \
    npm run dev >"$LOG_DIR/gateway.log" 2>&1
) &
GATEWAY_PID=$!

(
  cd "$ROOT_DIR/apps/memory-console"
  npm run dev -- --port "$CONSOLE_PORT" >"$LOG_DIR/console.log" 2>&1
) &
CONSOLE_PID=$!

echo "Memory Gateway: http://localhost:$GATEWAY_PORT"
echo "Memory Console: http://localhost:$CONSOLE_PORT"
echo "Logs: $LOG_DIR"

wait "$GATEWAY_PID" "$CONSOLE_PID"
