import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createInternalUsageServer,
  issueInternalUsageApiKey,
  loadInternalUsageState,
} from '../lib/internal_usage_service.mjs';
import {
  getClientStatus,
  initializeClient,
  runClientSync,
} from '../lib/internal_usage_client.mjs';

const FIXTURE_DIR = resolve(
  '/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/tests/fixtures/team_usage'
);

async function requestJson(url, { method = 'GET', apiKey = null, body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return JSON.parse(text);
}

async function listenServer(server) {
  await new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  return server.address().port;
}

test('issueInternalUsageApiKey stores a vbu-prefixed key in state', () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'usage-state-')), 'state.json');
  const record = issueInternalUsageApiKey(statePath, {
    memberId: 'alice',
    memberName: 'Alice',
    team: 'Search',
  });
  assert.match(record.apiKey, /^vbu_[a-f0-9]+$/);
  const state = loadInternalUsageState(statePath);
  assert.equal(state.apiKeys.length, 1);
  assert.equal(state.apiKeys[0].memberName, 'Alice');
});

test('server upload flow aggregates two members and exposes report endpoint', async () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'usage-server-state-')), 'state.json');
  const aliceKey = issueInternalUsageApiKey(statePath, {
    memberId: 'alice',
    memberName: 'Alice',
    team: 'Search',
  });
  const bobKey = issueInternalUsageApiKey(statePath, {
    memberId: 'bob',
    memberName: 'Bob',
    team: 'Infra',
  });

  const server = createInternalUsageServer({ statePath, teamName: 'Fixture Auto Upload Team' });
  const port = await listenServer(server);

  try {
    const settings = await requestJson(`http://127.0.0.1:${port}/api/usage/settings`, {
      apiKey: aliceKey.apiKey,
    });
    assert.equal(settings.memberName, 'Alice');
    assert.equal(settings.uploadProject, true);

    const aliceReport = JSON.parse(readFileSync(join(FIXTURE_DIR, 'alice_local_usage_report.json'), 'utf8'));
    const bobReport = JSON.parse(readFileSync(join(FIXTURE_DIR, 'bob_local_usage_report.json'), 'utf8'));

    const uploadAlice = await requestJson(`http://127.0.0.1:${port}/api/internal-usage/upload`, {
      method: 'POST',
      apiKey: aliceKey.apiKey,
      body: { report: aliceReport },
    });
    assert.equal(uploadAlice.ok, true);
    assert.equal(uploadAlice.summary.totalTokens, 1000);

    const uploadBob = await requestJson(`http://127.0.0.1:${port}/api/internal-usage/upload`, {
      method: 'POST',
      apiKey: bobKey.apiKey,
      body: { report: bobReport },
    });
    assert.equal(uploadBob.summary.totalTokens, 3000);

    const report = await requestJson(`http://127.0.0.1:${port}/api/internal-usage/report`);
    assert.equal(report.teamName, 'Fixture Auto Upload Team');
    assert.equal(report.summary.totalMembers, 2);
    assert.equal(report.summary.totalTokens, 3000);
    assert.equal(report.byMember[0].memberName, 'Bob');

    const dashboardHtml = await fetch(`http://127.0.0.1:${port}/usage`).then((response) => response.text());
    assert.match(dashboardHtml, /Fixture Auto Upload Team/);
    assert.match(dashboardHtml, /Bob/);
    assert.match(dashboardHtml, /3,000/);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
});

test('client init sync status works end-to-end against local server', async () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'usage-client-state-')), 'state.json');
  const configPath = join(mkdtempSync(join(tmpdir(), 'usage-client-config-')), 'config.json');
  const keyRecord = issueInternalUsageApiKey(statePath, {
    memberId: 'alice',
    memberName: 'Alice',
    team: 'Search',
  });

  const server = createInternalUsageServer({ statePath, teamName: 'Client E2E Team' });
  const port = await listenServer(server);
  const serverUrl = `http://127.0.0.1:${port}`;

  try {
    initializeClient({ serverUrl, apiKey: keyRecord.apiKey }, configPath);

    const statusOutput = getClientStatus(configPath);
    assert.equal(statusOutput.configured, true);
    assert.equal(statusOutput.serverUrl, serverUrl);

    const syncOutput = await runClientSync({
      localReportPath: join(FIXTURE_DIR, 'alice_local_usage_report.json'),
    }, configPath);
    assert.equal(syncOutput.uploadResult.ok, true);

    const report = await requestJson(`${serverUrl}/api/internal-usage/report`);
    assert.equal(report.summary.totalTokens, 1000);
    assert.equal(report.summary.totalMembers, 1);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
});
