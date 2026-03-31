#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildAdminHtml,
  buildMemberHtml,
  createInMemoryPrivateUsageStore,
} from './lib/private_usage_service.mjs';
import { hashPrivateAccessToken } from './lib/private_access_token.mjs';

const ROOT = resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp');
const FIXTURE_DIR = resolve(`${ROOT}/tests/fixtures/team_usage`);

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function loadJson(name) {
  return JSON.parse(readFileSync(resolve(`${FIXTURE_DIR}/${name}`), 'utf8'));
}

function createSyntheticDailyUsage(dayCount, memberIndex) {
  const rows = [];
  const start = new Date('2026-02-01T00:00:00Z');
  for (let index = 0; index < dayCount; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const wave = ((index + 3) * (memberIndex + 5)) % 11;
    const base = 180000 + memberIndex * 42000;
    const boost = index === dayCount - 1 ? (dayCount - memberIndex) * 90000 : 0;
    const inputTokens = base + wave * 32000 + boost;
    const cachedInputTokens = Math.round(inputTokens * (1.6 + (memberIndex % 3) * 0.35));
    const outputTokens = Math.round(inputTokens * 0.08);
    const reasoningOutputTokens = Math.round(inputTokens * 0.03);
    rows.push({
      date: date.toISOString().slice(0, 10),
      buckets: 2 + (memberIndex % 4),
      sessionsStarted: 1 + ((index + memberIndex) % 6),
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningOutputTokens,
      legacyTotalTokens: inputTokens + outputTokens + reasoningOutputTokens,
      accountedTotalTokens: inputTokens + cachedInputTokens + outputTokens + reasoningOutputTokens,
    });
  }
  return rows;
}

function createSyntheticMemberReport(memberIndex) {
  const dailyUsage = createSyntheticDailyUsage(60, memberIndex);
  const totalTokens = dailyUsage.reduce((sum, row) => sum + row.accountedTotalTokens, 0);
  const inputTokens = dailyUsage.reduce((sum, row) => sum + row.inputTokens, 0);
  const cachedInputTokens = dailyUsage.reduce((sum, row) => sum + row.cachedInputTokens, 0);
  const outputTokens = dailyUsage.reduce((sum, row) => sum + row.outputTokens, 0);
  const reasoningOutputTokens = dailyUsage.reduce((sum, row) => sum + row.reasoningOutputTokens, 0);
  const totalSessions = dailyUsage.reduce((sum, row) => sum + row.sessionsStarted, 0);
  return {
    generatedAt: '2026-04-01T00:00:00.000Z',
    timezone: 'Asia/Shanghai',
    hostname: `member-${memberIndex + 1}.local`,
    mode: 'synthetic-preview-report',
    summary: {
      totalBuckets: dailyUsage.reduce((sum, row) => sum + row.buckets, 0),
      totalSessions,
      totalTokens,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningOutputTokens,
      totalActiveSeconds: totalSessions * 600,
      totalDurationSeconds: totalSessions * 780,
      parserSuccessCount: 1,
      parserErrorCount: 0,
    },
    parserReports: [
      {
        source: memberIndex % 2 === 0 ? 'codex' : 'gemini-cli',
        buckets: dailyUsage.reduce((sum, row) => sum + row.buckets, 0),
        sessions: totalSessions,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
      },
    ],
    sessionSources: [
      {
        source: memberIndex % 2 === 0 ? 'codex' : 'gemini-cli',
        sessions: totalSessions,
        activeSeconds: totalSessions * 600,
        durationSeconds: totalSessions * 780,
        messageCount: totalSessions * 8,
      },
    ],
    dailyUsage,
  };
}

async function buildFixtureState(scenario = 'small-team') {
  const projectSlug = 'ba_agent_team';
  const isDense = scenario === 'dense-team';
  const aliceReport = loadJson('alice_local_usage_report.json');
  const bobReport = loadJson('bob_local_usage_report.json');
  const principals = [];
  const reports = [];
  const principalMap = {};

  const baseMembers = isDense
    ? Array.from({ length: 12 }, (_, index) => ({
        memberId: `member_${String(index + 1).padStart(2, '0')}`,
        memberName: `Member ${String(index + 1).padStart(2, '0')}`,
        team: index < 4 ? 'Search' : (index < 8 ? 'Infra' : 'Ops'),
        report: createSyntheticMemberReport(index),
      }))
    : [
        { memberId: 'alice', memberName: 'Alice', team: 'Search', report: aliceReport },
        { memberId: 'bob', memberName: 'Bob', team: 'Infra', report: bobReport },
        { memberId: 'ben', memberName: 'Ben', team: 'Admin', report: bobReport },
      ];

  const store = createInMemoryPrivateUsageStore({
    principals: (() => {
      for (const member of baseMembers) {
        principals.push({
          principalId: `${projectSlug}:${member.memberId}`,
          projectSlug,
          memberId: member.memberId,
          memberName: member.memberName,
          team: member.team,
          role: member.memberId === 'ben' || member.memberId === 'member_01' ? 'admin' : 'member',
          tokenHash: hashPrivateAccessToken(`preview_${member.memberId}`),
        });
        principalMap[member.memberId] = {
          principalId: `${projectSlug}:${member.memberId}`,
          projectSlug,
          memberId: member.memberId,
          memberName: member.memberName,
          team: member.team,
          role: member.memberId === 'ben' || member.memberId === 'member_01' ? 'admin' : 'member',
        };
      }
      return principals;
    })(),
    reports: (() => {
      for (const member of baseMembers) {
        reports.push({
          projectSlug,
          principalId: `${projectSlug}:${member.memberId}`,
          memberId: member.memberId,
          memberName: member.memberName,
          team: member.team,
          uploadedAt: '2026-04-01T00:00:00.000Z',
          report: member.report,
        });
      }
      return reports;
    })(),
  });

  const teamName = isDense ? 'BA Agent Team Dense Preview' : 'BA Agent Team';
  const teamReport = await store.getLatestTeamReport(projectSlug, { teamName });
  const memberReports = await store.getLatestTeamMemberReports(projectSlug);

  return {
    scenario,
    teamName,
    teamReport,
    memberReports,
    principals: principalMap,
  };
}

async function main() {
  const host = getArg('--host', '127.0.0.1');
  const port = Number(getArg('--port', '8787'));
  const scenario = getArg('--scenario', 'small-team');
  const state = await buildFixtureState(scenario);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === 'GET' && url.pathname === '/') {
      const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Private Usage Preview</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 32px; color: #12344d; background: #f4f7f9; }
      .card { max-width: 720px; margin: 0 auto; background: white; border: 1px solid #d7e3ef; border-radius: 18px; padding: 24px; }
      h1 { margin-top: 0; }
      ul { line-height: 1.8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Private Usage Preview</h1>
      <p>Use these local no-auth pages for screenshot QA.</p>
      <ul>
        <li><a href="/preview/team?scenario=small-team">Small team initial state</a></li>
        <li><a href="/preview/member/alice?scenario=small-team">Small team member state</a></li>
        <li><a href="/preview/team?scenario=dense-team">Dense team initial state</a></li>
        <li><a href="/preview/member/member_03?scenario=dense-team">Dense team member state</a></li>
      </ul>
    </div>
  </body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/preview/team') {
      const scopedState = url.searchParams.get('scenario') === state.scenario ? state : await buildFixtureState(url.searchParams.get('scenario') || 'small-team');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildAdminHtml('/private-ai-usage', scopedState.teamReport, scopedState.memberReports));
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/preview/member/')) {
      const scopedState = url.searchParams.get('scenario') === state.scenario ? state : await buildFixtureState(url.searchParams.get('scenario') || 'small-team');
      const memberId = url.pathname.split('/').pop();
      const principal = scopedState.principals[memberId];
      const latest = scopedState.memberReports.find((item) => item.memberId === memberId) || null;
      if (!principal || !latest) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildMemberHtml('/private-ai-usage', principal, latest));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/probe/team') {
      const scenarioName = url.searchParams.get('scenario') || 'small-team';
      const memberId = url.searchParams.get('member') || '';
      const startIndex = url.searchParams.get('start') || '';
      const endIndex = url.searchParams.get('end') || '';
      const body = `<!doctype html>
<html lang="en">
  <body style="margin:0">
    <iframe id="previewFrame" src="/preview/team?scenario=${encodeURIComponent(scenarioName)}" style="width:1440px;height:2200px;border:0"></iframe>
    <script>
      window.addEventListener('load', () => {
        setTimeout(() => {
          const doc = document.getElementById('previewFrame').contentWindow.document;
          if (${JSON.stringify(memberId)}) {
            const select = doc.getElementById('memberSelect');
            if (select) {
              select.value = ${JSON.stringify(memberId)};
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          setTimeout(() => {
            if (${JSON.stringify(startIndex)} !== '') {
              const start = doc.getElementById('startRange');
              if (start) {
                start.value = ${JSON.stringify(startIndex)};
                start.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
            if (${JSON.stringify(endIndex)} !== '') {
              const end = doc.getElementById('endRange');
              if (end) {
                end.value = ${JSON.stringify(endIndex)};
                end.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
          }, 1200);
        }, 1200);
      });
    </script>
  </body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  server.listen(port, host, () => {
    console.log(`Local private usage preview listening on http://${host}:${port}`);
  });
}

await main();
