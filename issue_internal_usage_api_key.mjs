#!/usr/bin/env node

import { issueInternalUsageApiKey } from './lib/internal_usage_service.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const statePath = getArg('--state-file');
const memberId = getArg('--member-id');
const memberName = getArg('--member-name');
const team = getArg('--team');

if (!statePath || !memberId || !memberName || !team) {
  console.error('Usage: node issue_internal_usage_api_key.mjs --state-file <path> --member-id <id> --member-name <name> --team <team>');
  process.exit(1);
}

const record = issueInternalUsageApiKey(statePath, { memberId, memberName, team });
console.log(JSON.stringify(record, null, 2));
