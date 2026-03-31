import { createServer as createHttpServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

import { aggregateTeamReports } from './team_usage_report.mjs';

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(safeNumber(value));
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizePath(path) {
  return resolve(path);
}

function createEmptyState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    apiKeys: [],
    latestSubmissions: {},
  };
}

export function loadInternalUsageState(statePath) {
  const resolvedPath = normalizePath(statePath);
  if (!existsSync(resolvedPath)) return createEmptyState();
  const parsed = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  return {
    version: parsed.version || 1,
    createdAt: parsed.createdAt || new Date().toISOString(),
    apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [],
    latestSubmissions: parsed.latestSubmissions && typeof parsed.latestSubmissions === 'object'
      ? parsed.latestSubmissions
      : {},
  };
}

export function saveInternalUsageState(statePath, state) {
  const resolvedPath = normalizePath(statePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function generateApiKey() {
  return `vbu_${randomBytes(18).toString('hex')}`;
}

export function issueInternalUsageApiKey(statePath, { memberId, memberName, team }) {
  const state = loadInternalUsageState(statePath);
  const record = {
    apiKey: generateApiKey(),
    memberId,
    memberName,
    team,
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };
  state.apiKeys = state.apiKeys.filter((item) => item.memberId !== memberId);
  state.apiKeys.push(record);
  saveInternalUsageState(statePath, state);
  return record;
}

function findKeyRecord(state, apiKey) {
  return state.apiKeys.find((item) => item.apiKey === apiKey && !item.revokedAt) || null;
}

export function buildInternalTeamReport(state, options = {}) {
  const memberReports = Object.values(state.latestSubmissions).map((submission) => ({
    memberId: submission.memberId,
    memberName: submission.memberName,
    team: submission.team,
    reportPath: submission.reportPath || `state:${submission.memberId}`,
    report: submission.report,
  }));

  return aggregateTeamReports(memberReports, {
    teamName: options.teamName || 'Internal Usage Team',
    generatedAt: options.generatedAt || new Date().toISOString(),
  });
}

function buildSetupHtml(state, hostUrl) {
  const memberRows = state.apiKeys.map((item) => `
    <tr>
      <td>${esc(item.memberName)}</td>
      <td>${esc(item.team)}</td>
      <td>${esc(item.memberId)}</td>
      <td>${esc(item.apiKey.slice(0, 12))}...</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Internal Usage Setup</title>
  <style>
    body { font-family: "PingFang SC", "Noto Sans SC", sans-serif; margin: 0; padding: 24px; background: #f5f8fb; color: #12344d; }
    .wrap { max-width: 980px; margin: 0 auto; display: grid; gap: 18px; }
    .card { background: #fff; border: 1px solid #d7e3ef; border-radius: 18px; padding: 18px 20px; }
    code { background: #edf3f7; padding: 2px 6px; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #d7e3ef; padding: 8px 10px; text-align: left; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>Internal Usage Setup</h1>
      <p>当前这是一版内部自动上传 MVP。成员拿到 API key 后，可用本地 client 初始化并上传 usage 数据。</p>
      <p>Dashboard: <a href="${esc(hostUrl)}/usage">${esc(hostUrl)}/usage</a></p>
    </section>
    <section class="card">
      <h2>成员使用方式</h2>
      <pre><code>node internal_usage_client.mjs init --server-url ${esc(hostUrl)} --api-key vbu_xxx
node internal_usage_client.mjs sync</code></pre>
      <p>如果要用固定 fixture 或离线调试，也可以传 <code>--local-report-path</code>。</p>
    </section>
    <section class="card">
      <h2>已签发 API Key</h2>
      <table>
        <thead><tr><th>成员</th><th>团队</th><th>member_id</th><th>key prefix</th></tr></thead>
        <tbody>${memberRows || '<tr><td colspan="4">暂无</td></tr>'}</tbody>
      </table>
    </section>
  </div>
</body>
</html>`;
}

function buildDashboardHtml(report, state, hostUrl) {
  const memberRows = report.byMember.slice(0, 20).map((row) => `
    <tr>
      <td>${esc(row.memberName)}</td>
      <td>${esc(row.team)}</td>
      <td>${esc(row.hostname)}</td>
      <td>${esc(formatNumber(row.totalTokens))}</td>
      <td>${esc(formatNumber(row.totalSessions))}</td>
      <td>${esc(row.generatedAt)}</td>
    </tr>
  `).join('');

  const sourceRows = report.sourceUsage.slice(0, 20).map((row) => `
    <tr>
      <td>${esc(row.source)}</td>
      <td>${esc(formatNumber(row.memberCount))}</td>
      <td>${esc(formatNumber(row.totalTokens))}</td>
      <td>${esc(formatNumber(row.cachedInputTokens))}</td>
      <td>${esc(formatNumber(row.totalSessions))}</td>
    </tr>
  `).join('');

  const dailyRows = report.dailyUsage.slice(-21).map((row) => `
    <tr>
      <td>${esc(row.date)}</td>
      <td>${esc(formatNumber(row.memberCount))}</td>
      <td>${esc(formatNumber(row.accountedTotalTokens))}</td>
      <td>${esc(formatNumber(row.cachedInputTokens))}</td>
      <td>${esc(formatNumber(row.sessionsStarted))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${esc(report.teamName)} Dashboard</title>
  <style>
    body { margin: 0; padding: 24px; font-family: "PingFang SC", "Noto Sans SC", sans-serif; background: linear-gradient(180deg, #eef5f8 0%, #f8fbfd 100%); color: #12344d; }
    .wrap { max-width: 1280px; margin: 0 auto; display: grid; gap: 18px; }
    .card { background: #fff; border: 1px solid #d7e3ef; border-radius: 18px; padding: 18px 20px; box-shadow: 0 10px 26px rgba(18, 52, 77, 0.06); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .tile { border: 1px solid #d7e3ef; border-radius: 14px; padding: 12px 14px; background: #fbfdff; }
    .label { color: #5b7385; font-size: 12px; margin-bottom: 4px; }
    .value { font-size: 24px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #d7e3ef; padding: 8px 10px; text-align: right; }
    th:first-child, td:first-child, th:nth-child(2), td:nth-child(2), th:nth-child(3), td:nth-child(3) { text-align: left; }
    a { color: #1565c0; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>${esc(report.teamName)}</h1>
      <div>生成时间：${esc(report.generatedAt)} | setup：<a href="${esc(hostUrl)}/usage/setup">${esc(hostUrl)}/usage/setup</a></div>
    </section>
    <section class="card">
      <div class="grid">
        <div class="tile"><div class="label">总成员数</div><div class="value">${esc(formatNumber(report.summary.totalMembers))}</div></div>
        <div class="tile"><div class="label">总 tokens</div><div class="value">${esc(formatNumber(report.summary.totalTokens))}</div></div>
        <div class="tile"><div class="label">总 sessions</div><div class="value">${esc(formatNumber(report.summary.totalSessions))}</div></div>
        <div class="tile"><div class="label">已签发 key</div><div class="value">${esc(formatNumber(state.apiKeys.length))}</div></div>
      </div>
      <div class="grid" style="margin-top: 12px;">
        <div class="tile"><div class="label">Input</div><div class="value">${esc(formatNumber(report.summary.inputTokens))}</div></div>
        <div class="tile"><div class="label">Cached</div><div class="value">${esc(formatNumber(report.summary.cachedInputTokens))}</div></div>
        <div class="tile"><div class="label">Output</div><div class="value">${esc(formatNumber(report.summary.outputTokens))}</div></div>
        <div class="tile"><div class="label">Reasoning</div><div class="value">${esc(formatNumber(report.summary.reasoningOutputTokens))}</div></div>
      </div>
    </section>
    <section class="card">
      <h2>成员最新上传</h2>
      <table>
        <thead><tr><th>成员</th><th>团队</th><th>主机名</th><th>总 tokens</th><th>sessions</th><th>报告生成时间</th></tr></thead>
        <tbody>${memberRows || '<tr><td colspan="6">暂无上传</td></tr>'}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>来源汇总</h2>
      <table>
        <thead><tr><th>来源</th><th>覆盖成员</th><th>总 tokens</th><th>Cached</th><th>Sessions</th></tr></thead>
        <tbody>${sourceRows || '<tr><td colspan="5">暂无</td></tr>'}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>近 21 天趋势</h2>
      <table>
        <thead><tr><th>日期</th><th>活跃成员</th><th>总 tokens</th><th>Cached</th><th>Sessions Started</th></tr></thead>
        <tbody>${dailyRows || '<tr><td colspan="5">暂无</td></tr>'}</tbody>
      </table>
    </section>
  </div>
</body>
</html>`;
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function getApiKeyFromRequest(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2) + '\n';
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Connection': 'close',
  });
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Connection': 'close',
  });
  res.end(html);
}

export function createInternalUsageServer({ statePath, teamName = 'Internal Usage Team' }) {
  const resolvedStatePath = normalizePath(statePath);

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const hostUrl = `${url.protocol}//${url.host}`;

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/usage/setup') {
        const state = loadInternalUsageState(resolvedStatePath);
        sendHtml(res, 200, buildSetupHtml(state, hostUrl));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/usage') {
        const state = loadInternalUsageState(resolvedStatePath);
        const report = buildInternalTeamReport(state, { teamName });
        sendHtml(res, 200, buildDashboardHtml(report, state, hostUrl));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/internal-usage/report') {
        const state = loadInternalUsageState(resolvedStatePath);
        const report = buildInternalTeamReport(state, { teamName });
        sendJson(res, 200, report);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/usage/settings') {
        const apiKey = getApiKeyFromRequest(req);
        const state = loadInternalUsageState(resolvedStatePath);
        const keyRecord = apiKey ? findKeyRecord(state, apiKey) : null;
        if (!keyRecord) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        sendJson(res, 200, {
          uploadProject: true,
          memberId: keyRecord.memberId,
          memberName: keyRecord.memberName,
          team: keyRecord.team,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/internal-usage/upload') {
        const apiKey = getApiKeyFromRequest(req);
        const state = loadInternalUsageState(resolvedStatePath);
        const keyRecord = apiKey ? findKeyRecord(state, apiKey) : null;
        if (!keyRecord) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }

        const rawBody = await getRequestBody(req);
        const payload = rawBody ? JSON.parse(rawBody) : {};
        const report = payload.report || payload;
        if (!report || typeof report !== 'object' || !report.summary) {
          sendJson(res, 400, { error: 'INVALID_REPORT_PAYLOAD' });
          return;
        }

        state.latestSubmissions[keyRecord.memberId] = {
          memberId: keyRecord.memberId,
          memberName: keyRecord.memberName,
          team: keyRecord.team,
          apiKeyPrefix: keyRecord.apiKey.slice(0, 12),
          reportPath: `internal-upload:${keyRecord.memberId}`,
          submittedAt: new Date().toISOString(),
          report,
        };
        saveInternalUsageState(resolvedStatePath, state);

        const aggregated = buildInternalTeamReport(state, { teamName });
        sendJson(res, 200, {
          ok: true,
          memberId: keyRecord.memberId,
          submittedAt: state.latestSubmissions[keyRecord.memberId].submittedAt,
          summary: aggregated.summary,
        });
        return;
      }

      sendJson(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      sendJson(res, 500, {
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      });
    }
  });

  server.keepAliveTimeout = 1;
  server.headersTimeout = 2000;

  return server;
}
