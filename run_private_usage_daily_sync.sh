#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_PATH="${1:-$ROOT_DIR/private_ops_seed/bootstrap_output/yc_admin_client_config.json}"

cd "$ROOT_DIR"
node internal_usage_client.mjs sync --config-path "$CONFIG_PATH"
