import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  bootstrapAdminKey,
  createTokenUsageServer,
  issueMemberKeyAsAdmin,
  loadTokenUsageState,
} from '../public_repo_seed/server/token_usage_service.mjs';
import {
  getClientConfigStatus,
  initializeTokenUsageClient,
  syncTokenUsageReport,
} from '../public_repo_seed/client/token_usage_client.mjs';

const FIXTURE_DIR = resolve(
  '/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/tests/fixtures'
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

test('admin bootstrap and member key issuance are stored in state', () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'token-rbac-state-')), 'state.json');
  const admin = bootstrapAdminKey(statePath, { label: 'owner' });
  assert.match(admin.apiKey, /^vbu_admin_[a-f0-9]+$/);

  const alice = issueMemberKeyAsAdmin(statePath, {
    adminApiKey: admin.apiKey,
    memberId: 'alice',
    memberName: 'Alice',
    team: 'Search',
  });
  assert.match(alice.apiKey, /^vbu_member_[a-f0-9]+$/);

  const state = loadTokenUsageState(statePath);
  assert.equal(state.principals.length, 2);
  assert.equal(state.principals.find((item) => item.role === 'admin').label, 'owner');
  assert.equal(state.principals.find((item) => item.memberId === 'alice').memberName, 'Alice');
});

test('member can upload and see self data but cannot access admin dashboard', async () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'token-rbac-server-')), 'state.json');
  const admin = bootstrapAdminKey(statePath, { label: 'owner' });
  const alice = issueMemberKeyAsAdmin(statePath, {
    adminApiKey: admin.apiKey,
    memberId: 'alice',
    memberName: 'Alice',
    team: 'Search',
  });

  const server = createTokenUsageServer({ statePath, teamName: 'Token Usage Team' });
  const port = await listenServer(server);
  const baseUrl = `http://127.0.0.1:${port}/ai-usage`;

  try {
    const aliceReport = JSON.parse(readFileSync(join(FIXTURE_DIR, 'alice_local_usage_report.json'), 'utf8'));
    const upload = await request(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': alice.apiKey,
      },
      body: { report: aliceReport },
    });
    assert.equal(upload.status, 200);
    assert.equal(upload.json.ok, true);
    assert.equal(upload.json.summary.totalTokens, 1000);

    const login = await request(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { apiKey: alice.apiKey },
    });
    assert.equal(login.status, 200);
    assert.equal(login.json.role, 'member');
    assert.match(login.headers['set-cookie'], /aiu_session=/);

    const me = await request(`${baseUrl}/api/me`, {
      headers: { Cookie: login.headers['set-cookie'] },
    });
    assert.equal(me.status, 200);
    assert.equal(me.json.member.memberId, 'alice');
    assert.equal(me.json.report.summary.totalTokens, 1000);

    const adminDashboard = await request(`${baseUrl}/api/admin/dashboard`, {
      headers: { Cookie: login.headers['set-cookie'] },
    });
    assert.equal(adminDashboard.status, 403);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
});

test('admin can view global dashboard after two member uploads', async () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'token-rbac-admin-')), 'state.json');
  const admin = bootstrapAdminKey(statePath, { label: 'owner' });
  const alice = issueMemberKeyAsAdmin(statePath, {
    adminApiKey: admin.apiKey,
    memberId: 'alice',
    memberName: 'Alice',
    team: 'Search',
  });
  const bob = issueMemberKeyAsAdmin(statePath, {
    adminApiKey: admin.apiKey,
    memberId: 'bob',
    memberName: 'Bob',
    team: 'Infra',
  });

  const server = createTokenUsageServer({ statePath, teamName: 'Token Usage Team' });
  const port = await listenServer(server);
  const baseUrl = `http://127.0.0.1:${port}/ai-usage`;

  try {
    const aliceReport = JSON.parse(readFileSync(join(FIXTURE_DIR, 'alice_local_usage_report.json'), 'utf8'));
    const bobReport = JSON.parse(readFileSync(join(FIXTURE_DIR, 'bob_local_usage_report.json'), 'utf8'));

    await request(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': alice.apiKey },
      body: { report: aliceReport },
    });
    await request(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': bob.apiKey },
      body: { report: bobReport },
    });

    const login = await request(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { apiKey: admin.apiKey },
    });
    assert.equal(login.status, 200);
    assert.equal(login.json.role, 'admin');

    const dashboard = await request(`${baseUrl}/api/admin/dashboard`, {
      headers: { Cookie: login.headers['set-cookie'] },
    });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.json.summary.totalTokens, 3000);
    assert.equal(dashboard.json.summary.totalMembers, 2);
    assert.equal(dashboard.json.byMember[0].memberName, 'Bob');

    const adminPage = await fetch(`${baseUrl}/admin/dashboard`, {
      headers: { Cookie: login.headers['set-cookie'] },
    }).then((response) => response.text());
    assert.match(adminPage, /Token Usage Team/);
    assert.match(adminPage, /3,000/);
    assert.match(adminPage, /Bob/);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
});

test('setup page is secretless and does not expose real issued keys', async () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'token-rbac-setup-')), 'state.json');
  const admin = bootstrapAdminKey(statePath, { label: 'owner' });
  const alice = issueMemberKeyAsAdmin(statePath, {
    adminApiKey: admin.apiKey,
    memberId: 'alice',
    memberName: 'Alice',
    team: 'Search',
  });

  const server = createTokenUsageServer({ statePath, teamName: 'Token Usage Team' });
  const port = await listenServer(server);
  const baseUrl = `http://127.0.0.1:${port}/ai-usage`;

  try {
    const setupHtml = await fetch(`${baseUrl}/setup`).then((response) => response.text());
    assert.match(setupHtml, /Token Usage Upload Setup/);
    assert.doesNotMatch(setupHtml, new RegExp(alice.apiKey));
    assert.doesNotMatch(setupHtml, new RegExp(admin.apiKey));
    assert.match(setupHtml, /Ask your admin for a member key/);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
});

test('public-repo-ready client syncs a real token report into the RBAC server', async () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'token-rbac-client-state-')), 'state.json');
  const configPath = join(mkdtempSync(join(tmpdir(), 'token-rbac-client-config-')), 'config.json');
  const admin = bootstrapAdminKey(statePath, { label: 'owner' });
  const alice = issueMemberKeyAsAdmin(statePath, {
    adminApiKey: admin.apiKey,
    memberId: 'alice',
    memberName: 'Alice',
    team: 'Search',
  });

  const server = createTokenUsageServer({ statePath, teamName: 'Token Usage Team' });
  const port = await listenServer(server);
  const baseUrl = `http://127.0.0.1:${port}/ai-usage`;

  try {
    initializeTokenUsageClient({ serverBaseUrl: baseUrl, apiKey: alice.apiKey }, configPath);
    const status = getClientConfigStatus(configPath);
    assert.equal(status.configured, true);
    assert.equal(status.serverBaseUrl, baseUrl);

    const syncResult = await syncTokenUsageReport({
      reportPath: join(FIXTURE_DIR, 'alice_local_usage_report.json'),
    }, configPath);
    assert.equal(syncResult.uploadResult.ok, true);
    assert.equal(syncResult.uploadResult.summary.totalTokens, 1000);

    const state = loadTokenUsageState(statePath);
    assert.ok(state.latestReports.alice);
    assert.equal(state.latestReports.alice.report.summary.totalTokens, 1000);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
});
