#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function requiredArg(name) {
  const value = getArg(name);
  if (!value) {
    throw new Error(`Missing required arg: ${name}`);
  }
  return value;
}

const memberId = requiredArg('--member-id');
const memberName = requiredArg('--member-name');
const team = requiredArg('--team');
const outputDir = resolve(requiredArg('--output-dir'));
const localReportPathOverride = getArg('--local-report-path');

mkdirSync(outputDir, { recursive: true });

let localReportPath;
if (localReportPathOverride) {
  localReportPath = resolve(localReportPathOverride);
} else {
  const rawOutputDir = join(outputDir, 'raw_local_report');
  mkdirSync(rawOutputDir, { recursive: true });
  execFileSync(
    'node',
    [
      resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/run_local_usage_report.mjs'),
      '--output-dir',
      rawOutputDir,
    ],
    { stdio: 'inherit' }
  );
  localReportPath = join(rawOutputDir, 'local_usage_report.json');
}

const report = JSON.parse(readFileSync(localReportPath, 'utf8'));
const submission = {
  submissionVersion: 1,
  submittedAt: new Date().toISOString(),
  memberId,
  memberName,
  team,
  report,
};

writeFileSync(
  join(outputDir, 'team_usage_submission.json'),
  JSON.stringify(submission, null, 2) + '\n',
  'utf8'
);

writeFileSync(
  join(outputDir, 'README.md'),
  [
    '# Team Usage Submission',
    '',
    `- member_id: ${memberId}`,
    `- member_name: ${memberName}`,
    `- team: ${team}`,
    '',
    '## Return File',
    '- Send back `team_usage_submission.json` only.',
    '',
    '## Notes',
    '- This submission embeds the member metadata and the full local usage report.',
    '- If `raw_local_report/` exists, it is only for local inspection and does not need to be returned separately.',
    '',
  ].join('\n'),
  'utf8'
);

console.log(`已写入成员提交包: ${outputDir}`);
