#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
VENDOR_DIR="$PROJECT_ROOT/__sys/vendor/vibe-usage"
RUNS_DIR="$PROJECT_ROOT/runs"
TIMESTAMP="$(date '+%y%m%d_%H%M')"
RUN_DIR="$RUNS_DIR/${TIMESTAMP}_DailyLocalUsageReport"

mkdir -p "$RUNS_DIR"

if [ ! -d "$VENDOR_DIR" ] || [ ! -f "$VENDOR_DIR/package.json" ]; then
  echo "Missing local vendor at $VENDOR_DIR" >&2
  echo "This report runs in local-only mode and does not clone or pull upstream." >&2
  echo "Prepare __sys/vendor/vibe-usage manually before running this script." >&2
  exit 1
fi

node "$PROJECT_ROOT/run_local_usage_report.mjs" --output-dir "$RUN_DIR"

echo "Artifacts:"
echo "  $PROJECT_ROOT/dashboard.html"
echo "  $RUN_DIR/summary.md"
echo "  $RUN_DIR/local_usage_report.json"
