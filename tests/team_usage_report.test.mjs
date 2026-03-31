import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import {
  aggregateTeamReports,
  loadMemberManifest,
  loadMemberReports,
  writeTeamReportOutputs,
} from '../lib/team_usage_report.mjs';

const FIXTURE_DIR = resolve(
  '/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/tests/fixtures/team_usage'
);

test('loadMemberManifest resolves relative report paths from CSV', () => {
  const manifest = loadMemberManifest(join(FIXTURE_DIR, 'members.csv'));
  assert.equal(manifest.members.length, 2);
  assert.equal(manifest.members[0].memberId, 'alice');
  assert.equal(manifest.members[1].memberName, 'Bob');
  assert.ok(manifest.members[0].reportPath.endsWith('alice_local_usage_report.json'));
});

test('loadMemberManifest rejects duplicate member ids', () => {
  assert.throws(
    () => loadMemberManifest(join(FIXTURE_DIR, 'members_duplicate.csv')),
    /Duplicate member_id/
  );
});

test('aggregateTeamReports sums member, source, and daily totals correctly', () => {
  const manifest = loadMemberManifest(join(FIXTURE_DIR, 'members.csv'));
  const memberReports = loadMemberReports(manifest);
  const report = aggregateTeamReports(memberReports, {
    teamName: 'Fixture Team',
    generatedAt: '2026-03-30T10:00:00.000Z',
  });

  assert.equal(report.teamName, 'Fixture Team');
  assert.equal(report.summary.totalMembers, 2);
  assert.equal(report.summary.totalTokens, 3000);
  assert.equal(report.summary.cachedInputTokens, 1050);
  assert.equal(report.summary.totalSessions, 12);
  assert.equal(report.summary.parserSuccessCount, 4);
  assert.equal(report.summary.parserErrorCount, 1);
  assert.equal(report.summary.memberErrorCount, 1);
  assert.equal(report.byMember[0].memberName, 'Bob');
  assert.equal(report.byMember[0].totalTokens, 2000);

  const codex = report.sourceUsage.find((row) => row.source === 'codex');
  assert.ok(codex);
  assert.equal(codex.totalTokens, 1900);
  assert.equal(codex.memberCount, 2);
  assert.equal(codex.totalSessions, 8);
  assert.equal(codex.totalActiveSeconds, 6600);

  const day30 = report.dailyUsage.find((row) => row.date === '2026-03-30');
  assert.ok(day30);
  assert.equal(day30.accountedTotalTokens, 1300);
  assert.equal(day30.memberCount, 2);
  assert.equal(day30.sessionsStarted, 5);

  assert.equal(report.notes.projectAggregationAvailable, false);
});

test('writeTeamReportOutputs writes the expected artifact set', () => {
  const manifest = loadMemberManifest(join(FIXTURE_DIR, 'members.csv'));
  const memberReports = loadMemberReports(manifest);
  const report = aggregateTeamReports(memberReports, { teamName: 'Fixture Team' });
  const outputDir = mkdtempSync(join(tmpdir(), 'team-usage-output-'));

  writeTeamReportOutputs(report, outputDir);

  for (const filename of [
    'team_usage_report.json',
    'member_summary.csv',
    'source_usage.csv',
    'team_daily_usage.csv',
    'summary.md',
    'dashboard.html',
  ]) {
    assert.ok(existsSync(join(outputDir, filename)), `${filename} should exist`);
  }

  const summaryText = readFileSync(join(outputDir, 'summary.md'), 'utf8');
  assert.match(summaryText, /总 tokens（MECE）: 3,000/);
  assert.match(summaryText, /Bob \(Infra\): 2,000 tokens/);
});

test('CLI generates report artifacts from fixture manifest', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'team-usage-cli-'));

  execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/run_team_usage_report.mjs'),
      '--manifest',
      join(FIXTURE_DIR, 'members.csv'),
      '--output-dir',
      outputDir,
      '--team-name',
      'CLI Fixture Team',
    ],
    { stdio: 'pipe' }
  );

  const reportJson = JSON.parse(readFileSync(join(outputDir, 'team_usage_report.json'), 'utf8'));
  assert.equal(reportJson.teamName, 'CLI Fixture Team');
  assert.equal(reportJson.summary.totalTokens, 3000);
});

test('submission CLI wraps a local report into a single submission file', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'team-usage-submission-'));

  execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/run_team_usage_submission.mjs'),
      '--member-id',
      'alice',
      '--member-name',
      'Alice',
      '--team',
      'Search',
      '--local-report-path',
      join(FIXTURE_DIR, 'alice_local_usage_report.json'),
      '--output-dir',
      outputDir,
    ],
    { stdio: 'pipe' }
  );

  const submission = JSON.parse(readFileSync(join(outputDir, 'team_usage_submission.json'), 'utf8'));
  assert.equal(submission.memberId, 'alice');
  assert.equal(submission.memberName, 'Alice');
  assert.equal(submission.report.summary.totalTokens, 1000);
});

test('collector CLI aggregates wrapped submission files', () => {
  const submissionsDir = mkdtempSync(join(tmpdir(), 'team-usage-submissions-'));
  const aliceDir = join(submissionsDir, 'alice');
  const bobDir = join(submissionsDir, 'bob');
  const outputDir = mkdtempSync(join(tmpdir(), 'team-usage-collected-'));

  execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/run_team_usage_submission.mjs'),
      '--member-id',
      'alice',
      '--member-name',
      'Alice',
      '--team',
      'Search',
      '--local-report-path',
      join(FIXTURE_DIR, 'alice_local_usage_report.json'),
      '--output-dir',
      aliceDir,
    ],
    { stdio: 'pipe' }
  );

  execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/run_team_usage_submission.mjs'),
      '--member-id',
      'bob',
      '--member-name',
      'Bob',
      '--team',
      'Infra',
      '--local-report-path',
      join(FIXTURE_DIR, 'bob_local_usage_report.json'),
      '--output-dir',
      bobDir,
    ],
    { stdio: 'pipe' }
  );

  execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/collect_team_usage_submissions.mjs'),
      '--submissions-dir',
      submissionsDir,
      '--output-dir',
      outputDir,
      '--team-name',
      'Collected Fixture Team',
    ],
    { stdio: 'pipe' }
  );

  const reportJson = JSON.parse(readFileSync(join(outputDir, 'team_usage_report.json'), 'utf8'));
  assert.equal(reportJson.teamName, 'Collected Fixture Team');
  assert.equal(reportJson.summary.totalTokens, 3000);
  assert.equal(reportJson.byMember[0].memberName, 'Bob');
});
