#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aggregateTeamReports, writeTeamReportOutputs } from './lib/team_usage_report.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function requiredArg(name) {
  const value = getArg(name);
  if (!value) throw new Error(`Missing required arg: ${name}`);
  return value;
}

function walkForSubmissionFiles(rootDir) {
  const matches = [];
  for (const entry of readdirSync(rootDir)) {
    const fullPath = join(rootDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      matches.push(...walkForSubmissionFiles(fullPath));
      continue;
    }
    if (entry === 'team_usage_submission.json') {
      matches.push(fullPath);
    }
  }
  return matches.sort();
}

const submissionsDir = resolve(requiredArg('--submissions-dir'));
const outputDir = resolve(requiredArg('--output-dir'));
const teamName = getArg('--team-name') || 'Internal Team Usage';

const submissionFiles = walkForSubmissionFiles(submissionsDir);
if (submissionFiles.length === 0) {
  throw new Error(`No team_usage_submission.json files found under: ${submissionsDir}`);
}

const memberReports = submissionFiles.map((submissionPath) => {
  const submission = JSON.parse(readFileSync(submissionPath, 'utf8'));
  if (!submission || typeof submission !== 'object' || !submission.report) {
    throw new Error(`Invalid submission file: ${submissionPath}`);
  }
  return {
    memberId: submission.memberId,
    memberName: submission.memberName,
    team: submission.team,
    reportPath: submissionPath,
    report: submission.report,
  };
});

const report = aggregateTeamReports(memberReports, { teamName });
writeTeamReportOutputs(report, outputDir);

console.log(`已收集 ${submissionFiles.length} 份提交，并写入团队报告: ${outputDir}`);
