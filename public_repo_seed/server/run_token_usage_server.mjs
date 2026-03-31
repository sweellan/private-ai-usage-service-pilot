#!/usr/bin/env node

import { createTokenUsageServer } from './token_usage_service.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const stateFile = getArg('--state-file') || process.env.AI_USAGE_STATE_FILE;
const teamName = getArg('--team-name') || process.env.AI_USAGE_TEAM_NAME || 'AI Usage Upload Service';
const basePath = getArg('--base-path') || process.env.AI_USAGE_BASE_PATH || '/ai-usage';
const port = Number(getArg('--port') || process.env.AI_USAGE_SERVER_PORT || '3017');
const host = getArg('--host') || process.env.AI_USAGE_SERVER_HOST || '127.0.0.1';

if (!stateFile) {
  console.error('Usage: node run_token_usage_server.mjs --state-file <path> [--port <n>] [--host <host>] [--base-path <path>] [--team-name <name>]');
  process.exit(1);
}

const server = createTokenUsageServer({
  statePath: stateFile,
  teamName,
  basePath,
});

server.listen(port, host, () => {
  console.log(`ai-usage-server listening on http://${host}:${port}${basePath}`);
});
