import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';

import { createTokenUsageServer } from '../public_repo_seed/server/token_usage_service.mjs';

const FIXTURE_DIR = resolve(
  '/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/tests/fixtures'
);

async function listenServer(server) {
  await new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  return server.address().port;
}

function runNodeAsync(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('node', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`node ${args.join(' ')} failed with code ${code}\n${stderr}`));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

test('admin CLI can bootstrap admin and issue member keys', () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'public-cli-state-')), 'state.json');
  const adminOutput = execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/server/admin_cli.mjs'),
      'bootstrap-admin',
      '--state-file',
      statePath,
      '--label',
      'owner',
    ],
    { encoding: 'utf8' }
  );
  const admin = JSON.parse(adminOutput);
  assert.match(admin.apiKey, /^vbu_admin_/);

  const memberOutput = execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/server/admin_cli.mjs'),
      'issue-member',
      '--state-file',
      statePath,
      '--admin-api-key',
      admin.apiKey,
      '--member-id',
      'alice',
      '--member-name',
      'Alice',
      '--team',
      'Search',
    ],
    { encoding: 'utf8' }
  );
  const member = JSON.parse(memberOutput);
  assert.match(member.apiKey, /^vbu_member_/);
  assert.equal(member.memberName, 'Alice');
});

test('client CLI init/status/sync works against token usage server', async () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'public-cli-server-')), 'state.json');
  const configPath = join(mkdtempSync(join(tmpdir(), 'public-cli-config-')), 'config.json');

  const admin = JSON.parse(execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/server/admin_cli.mjs'),
      'bootstrap-admin',
      '--state-file',
      statePath,
      '--label',
      'owner',
    ],
    { encoding: 'utf8' }
  ));

  const member = JSON.parse(execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/server/admin_cli.mjs'),
      'issue-member',
      '--state-file',
      statePath,
      '--admin-api-key',
      admin.apiKey,
      '--member-id',
      'alice',
      '--member-name',
      'Alice',
      '--team',
      'Search',
    ],
    { encoding: 'utf8' }
  ));

  const server = createTokenUsageServer({ statePath, teamName: 'CLI Token Team' });
  const port = await listenServer(server);
  const baseUrl = `http://127.0.0.1:${port}/ai-usage`;

  try {
    await runNodeAsync([
        resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/client/cli.mjs'),
        'init',
        '--server-base-url',
        baseUrl,
        '--api-key',
        member.apiKey,
        '--config-path',
        configPath,
      ]);

    const status = JSON.parse(await runNodeAsync([
        resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/client/cli.mjs'),
        'status',
        '--config-path',
        configPath,
      ]));
    assert.equal(status.configured, true);
    assert.equal(status.serverBaseUrl, baseUrl);

    const sync = JSON.parse(await runNodeAsync([
        resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/client/cli.mjs'),
        'sync',
        '--config-path',
        configPath,
        '--report-path',
        join(FIXTURE_DIR, 'alice_local_usage_report.json'),
      ]));
    assert.equal(sync.uploadResult.ok, true);
    assert.equal(sync.uploadResult.summary.totalTokens, 1000);

    const me = await fetch(`${baseUrl}/api/me`, {
      headers: { 'X-API-Key': member.apiKey },
    }).then((response) => response.json());
    assert.equal(me.member.memberName, 'Alice');
    assert.equal(me.report.summary.totalTokens, 1000);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
});
