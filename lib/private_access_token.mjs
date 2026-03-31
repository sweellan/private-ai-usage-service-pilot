import { createHash, randomBytes } from 'node:crypto';

function requiredString(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  return normalized;
}

function normalizeRole(role) {
  const normalized = requiredString(role || 'member', 'role').toLowerCase();
  if (!['admin', 'member'].includes(normalized)) {
    throw new Error(`Unsupported role: ${role}`);
  }
  return normalized;
}

export function generatePrivateAccessToken(prefix = 'vbu') {
  return `${prefix}_${randomBytes(24).toString('hex')}`;
}

export function hashPrivateAccessToken(token) {
  const normalized = requiredString(token, 'token');
  return createHash('sha256').update(normalized).digest('hex');
}

export function buildTokenHint(token) {
  const normalized = requiredString(token, 'token');
  return `${normalized.slice(0, 12)}...`;
}

export function buildPrincipalId(projectSlug, memberId) {
  return `${requiredString(projectSlug, 'projectSlug')}:${requiredString(memberId, 'memberId')}`;
}

export function issuePrivateAccessTokenBundle({
  projectSlug,
  memberId,
  memberName,
  team = '',
  role = 'member',
  email = '',
}) {
  const normalizedProjectSlug = requiredString(projectSlug, 'projectSlug');
  const normalizedMemberId = requiredString(memberId, 'memberId');
  const normalizedMemberName = requiredString(memberName, 'memberName');
  const normalizedRole = normalizeRole(role);
  const issuedAt = new Date().toISOString();
  const accessToken = generatePrivateAccessToken();
  const tokenHash = hashPrivateAccessToken(accessToken);
  const tokenHint = buildTokenHint(accessToken);

  return {
    projectSlug: normalizedProjectSlug,
    principalId: buildPrincipalId(normalizedProjectSlug, normalizedMemberId),
    memberId: normalizedMemberId,
    memberName: normalizedMemberName,
    team: String(team || ''),
    role: normalizedRole,
    email: String(email || ''),
    issuedAt,
    accessToken,
    tokenHash,
    tokenHint,
  };
}

export function renderPrincipalUpsertSql(bundle) {
  const projectSlug = requiredString(bundle.projectSlug, 'bundle.projectSlug').replaceAll("'", "''");
  const principalId = requiredString(bundle.principalId, 'bundle.principalId').replaceAll("'", "''");
  const memberId = requiredString(bundle.memberId, 'bundle.memberId').replaceAll("'", "''");
  const memberName = requiredString(bundle.memberName, 'bundle.memberName').replaceAll("'", "''");
  const team = String(bundle.team || '').replaceAll("'", "''");
  const role = normalizeRole(bundle.role).replaceAll("'", "''");
  const email = String(bundle.email || '').replaceAll("'", "''");
  const tokenHash = requiredString(bundle.tokenHash, 'bundle.tokenHash').replaceAll("'", "''");
  const tokenHint = requiredString(bundle.tokenHint, 'bundle.tokenHint').replaceAll("'", "''");

  return `insert into ai_usage.principals (
  principal_id,
  project_slug,
  member_id,
  member_name,
  team,
  email,
  role,
  token_hash,
  token_hint
)
values (
  '${principalId}',
  '${projectSlug}',
  '${memberId}',
  '${memberName}',
  '${team}',
  '${email}',
  '${role}',
  '${tokenHash}',
  '${tokenHint}'
)
on conflict (project_slug, member_id)
do update set
  member_name = excluded.member_name,
  team = excluded.team,
  email = excluded.email,
  role = excluded.role,
  token_hash = excluded.token_hash,
  token_hint = excluded.token_hint,
  revoked_at = null;`;
}
