import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  buildTeamRankingSnapshot,
  createInMemoryPrivateUsageStore,
  createPrivateUsageServer,
} from '../lib/private_usage_service.mjs';
import { hashPrivateAccessToken } from '../lib/private_access_token.mjs';

const FIXTURE_DIR = resolve(
  '/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/tests/fixtures/team_usage'
);

async function listenServer(server) {
  await new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  return server.address().port;
}

async function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    json: text ? JSON.parse(text) : null,
  };
}

test('member upload plus session login only exposes self view', async () => {
  const aliceToken = 'vbu_member_alice';
  const store = createInMemoryPrivateUsageStore({
    principals: [
      {
        principalId: 'ba_agent_team:alice',
        projectSlug: 'ba_agent_team',
        memberId: 'alice',
        memberName: 'Alice',
        team: 'Search',
        role: 'member',
        tokenHash: hashPrivateAccessToken(aliceToken),
      },
    ],
  });
  const server = createPrivateUsageServer({
    store,
    teamName: 'Fixture Private Team',
    basePath: '/usage',
    sessionSecret: 'test-secret',
  });
  const port = await listenServer(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const aliceReport = JSON.parse(readFileSync(join(FIXTURE_DIR, 'alice_local_usage_report.json'), 'utf8'));
    const upload = await request(`${baseUrl}/api/internal-usage/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'Content-Type': 'application/json',
      },
      body: { report: aliceReport },
    });
    assert.equal(upload.status, 200);
    assert.equal(upload.json.ok, true);

    const session = await request(`${baseUrl}/usage/api/private-usage/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { accessToken: aliceToken },
    });
    assert.equal(session.status, 200);
    assert.match(session.headers['set-cookie'], /aiu_private_session=/);

    const me = await request(`${baseUrl}/usage/api/private-usage/me`, {
      headers: { Cookie: session.headers['set-cookie'] },
    });
    assert.equal(me.status, 200);
    assert.equal(me.json.principal.memberId, 'alice');
    assert.equal(me.json.report.summary.totalTokens, 1000);

    const admin = await request(`${baseUrl}/usage/api/private-usage/admin/report`, {
      headers: { Cookie: session.headers['set-cookie'] },
    });
    assert.equal(admin.status, 403);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
});

test('admin session can read aggregate page after two uploads', async () => {
  const aliceToken = 'vbu_member_alice';
  const adminToken = 'vbu_admin_yc';
  const store = createInMemoryPrivateUsageStore({
    principals: [
      {
        principalId: 'ba_agent_team:alice',
        projectSlug: 'ba_agent_team',
        memberId: 'alice',
        memberName: 'Alice',
        team: 'Search',
        role: 'member',
        tokenHash: hashPrivateAccessToken(aliceToken),
      },
      {
        principalId: 'ba_agent_team:yc',
        projectSlug: 'ba_agent_team',
        memberId: 'yc',
        memberName: 'Yang Chao',
        team: 'BA',
        role: 'admin',
        tokenHash: hashPrivateAccessToken(adminToken),
      },
    ],
  });
  const server = createPrivateUsageServer({
    store,
    teamName: 'Fixture Private Team',
    basePath: '/usage',
    sessionSecret: 'test-secret',
  });
  const port = await listenServer(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const aliceReport = JSON.parse(readFileSync(join(FIXTURE_DIR, 'alice_local_usage_report.json'), 'utf8'));
    const bobAsAdminReport = JSON.parse(readFileSync(join(FIXTURE_DIR, 'bob_local_usage_report.json'), 'utf8'));

    await request(`${baseUrl}/api/internal-usage/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'Content-Type': 'application/json',
      },
      body: { report: aliceReport },
    });
    await request(`${baseUrl}/api/internal-usage/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: { report: bobAsAdminReport },
    });

    const session = await request(`${baseUrl}/usage/api/private-usage/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { accessToken: adminToken },
    });
    assert.equal(session.status, 200);

    const report = await request(`${baseUrl}/usage/api/private-usage/admin/report`, {
      headers: { Cookie: session.headers['set-cookie'] },
    });
    assert.equal(report.status, 200);
    assert.equal(report.json.summary.totalMembers, 2);
    assert.equal(report.json.summary.totalTokens, 3000);

    const html = await fetch(`${baseUrl}/usage`, {
      headers: { Cookie: session.headers['set-cookie'] },
    }).then((response) => response.text());
    assert.match(html, /Fixture Private Team/);
    assert.match(html, /Yang Chao/);
    assert.match(html, /视角切换/);
    assert.match(html, /chartTooltip/);
    assert.match(html, /scopeBar/);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
});

test('team ranking snapshot keeps all members and sorts by current period descending', async () => {
  const memberReports = Array.from({ length: 12 }, (_, index) => ({
    memberId: `m${index + 1}`,
    memberName: `Member ${String(index + 1).padStart(2, '0')}`,
    team: index % 2 === 0 ? 'A' : 'B',
    report: {
      summary: {
        totalTokens: 1000 + index,
      },
      dailyUsage: [
        {
          date: '2026-03-30',
          accountedTotalTokens: 10 + index,
          inputTokens: 10 + index,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          sessionsStarted: 1,
        },
        {
          date: '2026-03-31',
          accountedTotalTokens: index === 3 ? 999 : 100 + index,
          inputTokens: index === 3 ? 999 : 100 + index,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          sessionsStarted: 1,
        },
      ],
    },
  }));

  const snapshot = buildTeamRankingSnapshot(memberReports, {
    grain: 'day',
    endPeriod: '2026-03-31',
  });

  assert.equal(snapshot.rows.length, 12);
  assert.equal(snapshot.rows[0].memberId, 'm4');
  assert.equal(snapshot.rows[0].currentTokens, 999);
  assert.equal(snapshot.rows.some((row) => row.memberId === 'others'), false);
  for (let index = 1; index < snapshot.rows.length; index += 1) {
    assert.ok(snapshot.rows[index - 1].currentTokens >= snapshot.rows[index].currentTokens);
  }
});
