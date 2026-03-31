#!/usr/bin/env node

import { createInternalUsageServer } from './lib/internal_usage_service.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const statePath = getArg('--state-file');
const teamName = getArg('--team-name') || 'Internal Usage Team';
const port = Number(getArg('--port') || '8765');

if (!statePath) {
  console.error('Usage: node run_internal_usage_server.mjs --state-file <path> [--port <n>] [--team-name <name>]');
  process.exit(1);
}

const server = createInternalUsageServer({ statePath, teamName });
server.listen(port, '127.0.0.1', () => {
  console.log(`Internal usage server listening on http://127.0.0.1:${port}`);
});
