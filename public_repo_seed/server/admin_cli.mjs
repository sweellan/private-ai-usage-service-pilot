#!/usr/bin/env node

import { bootstrapAdminKey, issueMemberKeyAsAdmin } from './token_usage_service.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const command = process.argv[2];
const stateFile = getArg('--state-file');

if (!command || ['help', '--help', '-h'].includes(command)) {
  console.log(`Usage:
  node admin_cli.mjs bootstrap-admin --state-file <path> [--label <label>]
  node admin_cli.mjs issue-member --state-file <path> --admin-api-key <key> --member-id <id> --member-name <name> --team <team>`);
  process.exit(0);
}

if (!stateFile) {
  console.error('Missing required arg: --state-file');
  process.exit(1);
}

switch (command) {
  case 'bootstrap-admin': {
    const label = getArg('--label') || 'admin';
    const admin = bootstrapAdminKey(stateFile, { label });
    console.log(JSON.stringify(admin, null, 2));
    break;
  }
  case 'issue-member': {
    const adminApiKey = getArg('--admin-api-key');
    const memberId = getArg('--member-id');
    const memberName = getArg('--member-name');
    const team = getArg('--team');
    if (!adminApiKey || !memberId || !memberName || !team) {
      console.error('Usage: node admin_cli.mjs issue-member --state-file <path> --admin-api-key <key> --member-id <id> --member-name <name> --team <team>');
      process.exit(1);
    }
    const member = issueMemberKeyAsAdmin(stateFile, {
      adminApiKey,
      memberId,
      memberName,
      team,
    });
    console.log(JSON.stringify(member, null, 2));
    break;
  }
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
