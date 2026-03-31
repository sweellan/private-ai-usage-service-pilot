#!/usr/bin/env node

import {
  issuePrivateAccessTokenBundle,
  renderPrincipalUpsertSql,
} from './lib/private_access_token.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const projectSlug = getArg('--project-slug');
const memberId = getArg('--member-id');
const memberName = getArg('--member-name');
const team = getArg('--team') || '';
const role = getArg('--role') || 'member';
const email = getArg('--email') || '';
const format = getArg('--format') || 'json';

if (!projectSlug || !memberId || !memberName) {
  console.error('Usage: node issue_private_access_token_bundle.mjs --project-slug <slug> --member-id <id> --member-name <name> [--team <team>] [--role member|admin] [--email <email>] [--format json|sql|bundle]');
  process.exit(1);
}

const bundle = issuePrivateAccessTokenBundle({
  projectSlug,
  memberId,
  memberName,
  team,
  role,
  email,
});

switch (format) {
  case 'json':
    console.log(JSON.stringify(bundle, null, 2));
    break;
  case 'sql':
    console.log(renderPrincipalUpsertSql(bundle));
    break;
  case 'bundle':
    console.log(JSON.stringify({
      projectSlug: bundle.projectSlug,
      principalId: bundle.principalId,
      memberId: bundle.memberId,
      memberName: bundle.memberName,
      team: bundle.team,
      role: bundle.role,
      email: bundle.email,
      issuedAt: bundle.issuedAt,
      accessToken: bundle.accessToken,
      tokenHint: bundle.tokenHint,
      principalUpsertSql: renderPrincipalUpsertSql(bundle),
    }, null, 2));
    break;
  default:
    console.error(`Unsupported format: ${format}`);
    process.exit(1);
}
