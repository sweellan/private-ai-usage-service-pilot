import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrincipalId,
  buildTokenHint,
  hashPrivateAccessToken,
  issuePrivateAccessTokenBundle,
  renderPrincipalUpsertSql,
} from '../lib/private_access_token.mjs';

test('issuePrivateAccessTokenBundle returns one token bundle with hashed principal data', () => {
  const bundle = issuePrivateAccessTokenBundle({
    projectSlug: 'ba_agent_team',
    memberId: 'alice',
    memberName: 'Alice',
    team: 'Search',
    role: 'member',
    email: 'alice@example.com',
  });

  assert.equal(bundle.projectSlug, 'ba_agent_team');
  assert.equal(bundle.principalId, 'ba_agent_team:alice');
  assert.equal(bundle.role, 'member');
  assert.match(bundle.accessToken, /^vbu_[a-f0-9]+$/);
  assert.equal(bundle.tokenHash, hashPrivateAccessToken(bundle.accessToken));
  assert.equal(bundle.tokenHint, buildTokenHint(bundle.accessToken));
});

test('renderPrincipalUpsertSql emits one upsert statement for Supabase seeding', () => {
  const bundle = issuePrivateAccessTokenBundle({
    projectSlug: 'ba_agent_team',
    memberId: 'yc',
    memberName: 'Yang Chao',
    team: 'BA',
    role: 'admin',
    email: 'yc.thu08@gmail.com',
  });

  const sql = renderPrincipalUpsertSql(bundle);
  assert.match(sql, /insert into ai_usage\.principals/);
  assert.match(sql, /on conflict \(project_slug, member_id\)/);
  assert.match(sql, /'admin'/);
  assert.match(sql, /yc\.thu08@gmail\.com/);
  assert.match(sql, new RegExp(bundle.tokenHash));
});

test('buildPrincipalId keeps project and member scope explicit', () => {
  assert.equal(buildPrincipalId('ba_agent_team', 'alice'), 'ba_agent_team:alice');
});
