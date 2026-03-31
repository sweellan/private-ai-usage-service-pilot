#!/usr/bin/env node

import { resolve } from 'node:path';
import {
  aggregateTeamReports,
  loadMemberManifest,
  loadMemberReports,
  writeTeamReportOutputs,
} from './lib/team_usage_report.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const manifestPath = getArg('--manifest');
const outputDir = getArg('--output-dir');
const teamName = getArg('--team-name') || 'Internal Team Usage';

if (!manifestPath || !outputDir) {
  console.error('Usage: node run_team_usage_report.mjs --manifest <members.csv|json> --output-dir <dir> [--team-name <name>]');
  process.exit(1);
}

const manifest = loadMemberManifest(resolve(manifestPath));
const memberReports = loadMemberReports(manifest);
const report = aggregateTeamReports(memberReports, { teamName });
writeTeamReportOutputs(report, resolve(outputDir));

console.log(`已写入团队报告: ${resolve(outputDir)}`);
