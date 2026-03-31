import { createServer as createHttpServer } from 'node:http';
import { createHash, createHmac } from 'node:crypto';

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

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function getUsagePeriodKey(date, grain) {
  if (grain === 'day') return date;
  if (grain === 'month') return String(date).slice(0, 7);
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

export function getUsagePeriodLabel(key, grain) {
  if (grain === 'day') return key.slice(5);
  if (grain === 'month') return key;
  return `${key.slice(5)} wk`;
}

function normalizeUsageReport(report) {
  if (!report || typeof report !== 'object') {
    return {
      summary: {},
      parserReports: [],
      sessionSources: [],
      dailyUsage: [],
    };
  }

  if (Array.isArray(report.dailyUsage) || Array.isArray(report.parserReports)) {
    return {
      ...report,
      summary: report.summary || {},
      parserReports: Array.isArray(report.parserReports) ? report.parserReports : [],
      sessionSources: Array.isArray(report.sessionSources) ? report.sessionSources : [],
      dailyUsage: Array.isArray(report.dailyUsage) ? report.dailyUsage : [],
    };
  }

  const meta = report.meta || {};
  const summary = report.summary || {};
  const items = Array.isArray(report.items) ? report.items : [];
  const source = meta.source || 'unknown';

  return {
    ...report,
    generatedAt: meta.generatedAt || report.generatedAt || null,
    timezone: meta.timezone || report.timezone || 'unknown',
    hostname: meta.hostname || report.hostname || 'unknown',
    mode: meta.source || report.mode || 'normalized-upload-report',
    summary: {
      totalTokens: Number(summary.totalTokens || 0),
      inputTokens: Number(summary.inputTokens || 0),
      cachedInputTokens: Number(summary.cachedInputTokens || 0),
      outputTokens: Number(summary.outputTokens || 0),
      reasoningOutputTokens: Number(summary.reasoningOutputTokens || 0),
      totalSessions: Number(summary.totalSessions || 0),
      totalBuckets: Number(summary.totalBuckets || 0),
      totalActiveSeconds: Number(summary.totalActiveSeconds || 0),
      totalDurationSeconds: Number(summary.totalDurationSeconds || 0),
      parserSuccessCount: Number(summary.parserSuccessCount || (summary.sourceCount ? 1 : 0)),
      parserErrorCount: Number(summary.parserErrorCount || 0),
      sourceCount: Number(summary.sourceCount || (source ? 1 : 0)),
    },
    parserReports: source ? [{
      source,
      totalTokens: Number(summary.totalTokens || 0),
      inputTokens: Number(summary.inputTokens || 0),
      cachedInputTokens: Number(summary.cachedInputTokens || 0),
      outputTokens: Number(summary.outputTokens || 0),
      reasoningOutputTokens: Number(summary.reasoningOutputTokens || 0),
      sessions: Number(summary.totalSessions || 0),
      buckets: Number(summary.totalBuckets || 0),
    }] : [],
    sessionSources: source ? [{
      source,
      sessions: Number(summary.totalSessions || 0),
      activeSeconds: Number(summary.totalActiveSeconds || 0),
      durationSeconds: Number(summary.totalDurationSeconds || 0),
      messageCount: Number(summary.totalSessions || 0),
    }] : [],
    dailyUsage: items.map((item) => ({
      date: item.date,
      buckets: Number(item.buckets || 0),
      sessionsStarted: Number(item.sessionsStarted || item.eventCount || 0),
      inputTokens: Number(item.inputTokens || 0),
      cachedInputTokens: Number(item.cachedInputTokens || 0),
      outputTokens: Number(item.outputTokens || 0),
      reasoningOutputTokens: Number(item.reasoningOutputTokens || 0),
      legacyTotalTokens: Number(item.legacyTotalTokens || item.totalTokens || 0),
      accountedTotalTokens: Number(item.accountedTotalTokens || item.totalTokens || 0),
    })),
  };
}

export function aggregateUsageRows(rows, grain) {
  const map = new Map();
  for (const row of rows || []) {
    const key = getUsagePeriodKey(row.date, grain);
    if (!map.has(key)) {
      map.set(key, {
        period: key,
        label: getUsagePeriodLabel(key, grain),
        accountedTotalTokens: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        sessionsStarted: 0,
      });
    }
    const target = map.get(key);
    target.accountedTotalTokens += Number(row.accountedTotalTokens || 0);
    target.inputTokens += Number(row.inputTokens || 0);
    target.cachedInputTokens += Number(row.cachedInputTokens || 0);
    target.outputTokens += Number(row.outputTokens || 0);
    target.reasoningOutputTokens += Number(row.reasoningOutputTokens || 0);
    target.sessionsStarted += Number(row.sessionsStarted || 0);
  }
  return Array.from(map.values()).sort((a, b) => String(a.period).localeCompare(String(b.period)));
}

function findLatestUsagePeriod(memberReports, grain) {
  let latest = null;
  for (const member of memberReports || []) {
    const rows = aggregateUsageRows(normalizeUsageReport(member.report).dailyUsage || [], grain);
    const candidate = rows.at(-1)?.period || null;
    if (candidate && (!latest || String(candidate).localeCompare(String(latest)) > 0)) {
      latest = candidate;
    }
  }
  return latest;
}

function buildZeroRankingRow(member) {
  return {
    memberId: member.memberId,
    memberName: member.memberName,
    team: member.team,
    currentTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: safeNumber(normalizeUsageReport(member.report).summary?.totalTokens || 0),
    isOthers: false,
  };
}

export function buildTeamRankingSnapshot(memberReports, {
  grain = 'day',
  endPeriod = null,
} = {}) {
  const resolvedEndPeriod = endPeriod || findLatestUsagePeriod(memberReports, grain);
  const ranked = (memberReports || []).map((member) => {
    const report = normalizeUsageReport(member.report);
    const point = aggregateUsageRows(report.dailyUsage || [], grain)
      .find((row) => row.period === resolvedEndPeriod);
    if (!point) {
      return buildZeroRankingRow(member);
    }
    return {
      memberId: member.memberId,
      memberName: member.memberName,
      team: member.team,
      currentTokens: safeNumber(point.accountedTotalTokens),
      inputTokens: safeNumber(point.inputTokens),
      cachedInputTokens: safeNumber(point.cachedInputTokens),
      outputTokens: safeNumber(point.outputTokens),
      reasoningOutputTokens: safeNumber(point.reasoningOutputTokens),
      totalTokens: safeNumber(report.summary?.totalTokens),
      isOthers: false,
    };
  }).sort((a, b) =>
    safeNumber(b.currentTokens) - safeNumber(a.currentTokens) ||
    String(a.memberName || '').localeCompare(String(b.memberName || ''))
  );

  return {
    endPeriod: resolvedEndPeriod,
    rows: ranked,
    fullRows: ranked,
  };
}

function normalizeBasePath(basePath) {
  if (!basePath || basePath === '/') return '';
  return `/${String(basePath).replace(/^\/+|\/+$/g, '')}`;
}

function withBasePath(basePath, pathname) {
  const normalized = normalizeBasePath(basePath);
  if (!normalized) return pathname;
  if (pathname === '/') return normalized;
  return `${normalized}${pathname}`;
}

async function readRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readBody(req) {
  const raw = await readRequest(req);
  const contentType = String(req.headers['content-type'] || '');
  if (!raw) return {};
  if (contentType.includes('application/json')) {
    return JSON.parse(raw);
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  return {};
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const apiKeyHeader = req.headers['x-api-key'];
  return typeof apiKeyHeader === 'string' && apiKeyHeader.trim() ? apiKeyHeader.trim() : null;
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2) + '\n';
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    Connection: 'close',
    ...extraHeaders,
  });
  res.end(body);
}

function sendHtml(res, statusCode, html, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    Connection: 'close',
    ...extraHeaders,
  });
  res.end(html);
}

function buildSessionToken(sessionSecret, principal, ttlHours = 24) {
  const payload = {
    principalId: principal.principalId,
    projectSlug: principal.projectSlug,
    memberId: principal.memberId,
    memberName: principal.memberName,
    team: principal.team,
    role: principal.role,
    exp: Date.now() + ttlHours * 3600 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(sessionSecret, token) {
  if (!token || !token.includes('.')) return null;
  const [encodedPayload, signature] = token.split('.', 2);
  const expected = createHmac('sha256', sessionSecret).update(encodedPayload).digest('base64url');
  if (signature !== expected) return null;
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function getSessionFromCookie(req, sessionSecret) {
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(/(?:^|;\s*)aiu_private_session=([^;]+)/);
  if (!match) return null;
  return verifySessionToken(sessionSecret, match[1]);
}

function buildLoginHtml(basePath) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Private AI Usage Login</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111827; background: #f7fafc; }
      .card { max-width: 560px; background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 20px; }
      form { display: grid; gap: 12px; }
      input { padding: 10px 12px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 10px; }
      button { padding: 10px 12px; font-size: 14px; border-radius: 10px; border: 0; background: #0f766e; color: white; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Private AI Usage Access</h1>
      <p>Paste your private access token once to open the correct page.</p>
      <form method="post" action="${esc(withBasePath(basePath, '/api/private-usage/session'))}">
        <input name="accessToken" placeholder="vbu_xxx" />
        <button type="submit">Open page</button>
      </form>
    </div>
  </body>
</html>`;
}

function buildUsageDetailSections(report, { title = 'Usage Detail', subtitle = '' } = {}) {
  const summary = report?.summary || {};
  const sourceRows = (report?.parserReports || []).map((row) => `
    <tr>
      <td>${esc(row.source || 'unknown')}</td>
      <td>${esc(formatNumber(row.totalTokens || 0))}</td>
      <td>${esc(formatNumber(row.inputTokens || 0))}</td>
      <td>${esc(formatNumber(row.cachedInputTokens || 0))}</td>
      <td>${esc(formatNumber(row.outputTokens || 0))}</td>
      <td>${esc(formatNumber(row.reasoningOutputTokens || 0))}</td>
      <td>${esc(formatNumber(row.sessions || 0))}</td>
    </tr>
  `).join('');
  const dailyRows = (report?.dailyUsage || []).slice(-31).map((row) => `
    <tr>
      <td>${esc(row.date)}</td>
      <td>${esc(formatNumber(row.accountedTotalTokens || 0))}</td>
      <td>${esc(formatNumber(row.inputTokens || 0))}</td>
      <td>${esc(formatNumber(row.cachedInputTokens || 0))}</td>
      <td>${esc(formatNumber(row.outputTokens || 0))}</td>
      <td>${esc(formatNumber(row.reasoningOutputTokens || 0))}</td>
      <td>${esc(formatNumber(row.sessionsStarted || 0))}</td>
    </tr>
  `).join('');
  return `
    <section class="card">
      <h2>${esc(title)}</h2>
      ${subtitle ? `<p class="subtle">${esc(subtitle)}</p>` : ''}
      <div class="grid">
        <div class="card inset"><div>Total tokens</div><div class="metric">${esc(formatNumber(summary.totalTokens || 0))}</div></div>
        <div class="card inset"><div>Total sessions</div><div class="metric">${esc(formatNumber(summary.totalSessions || 0))}</div></div>
        <div class="card inset"><div>Total buckets</div><div class="metric">${esc(formatNumber(summary.totalBuckets || 0))}</div></div>
        <div class="card inset"><div>Input</div><div class="metric">${esc(formatNumber(summary.inputTokens || 0))}</div></div>
        <div class="card inset"><div>Cached</div><div class="metric">${esc(formatNumber(summary.cachedInputTokens || 0))}</div></div>
        <div class="card inset"><div>Output</div><div class="metric">${esc(formatNumber(summary.outputTokens || 0))}</div></div>
        <div class="card inset"><div>Reasoning</div><div class="metric">${esc(formatNumber(summary.reasoningOutputTokens || 0))}</div></div>
      </div>
    </section>
    <section class="card">
      <h2>Source Breakdown</h2>
      <table>
        <thead><tr><th>Source</th><th>Total</th><th>Input</th><th>Cached</th><th>Output</th><th>Reasoning</th><th>Sessions</th></tr></thead>
        <tbody>${sourceRows || '<tr><td colspan="7">No source breakdown yet.</td></tr>'}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>Daily Token Usage</h2>
      <table>
        <thead><tr><th>Date</th><th>Total</th><th>Input</th><th>Cached</th><th>Output</th><th>Reasoning</th><th>Sessions Started</th></tr></thead>
        <tbody>${dailyRows || '<tr><td colspan="7">No daily breakdown yet.</td></tr>'}</tbody>
      </table>
    </section>
  `;
}

function buildDashboardShellHtml(basePath, {
  pageTitle,
  heading,
  role,
  teamName,
  scopes,
  currentScopeId,
  currentLabel,
  currentReport,
}) {
  const payload = {
    role,
    teamName,
    scopes,
    currentScopeId,
    currentLabel,
    currentReport,
    basePath,
  };
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(pageTitle)}</title>
    <style>
      :root {
        --bg: #edf3f7;
        --card: #ffffff;
        --ink: #12344d;
        --muted: #5b7385;
        --line: #d7e3ef;
        --accent: #1565c0;
        --accent-soft: #eaf3ff;
        --green: #2e7d32;
        --teal: #00838f;
        --orange: #ef6c00;
        --pink: #d81b60;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
        background: linear-gradient(180deg, #eef5f8 0%, #f7fbfd 100%);
        color: var(--ink);
        padding: 18px 14px 28px;
      }
      .wrap { max-width: 1024px; margin: 0 auto; display: grid; gap: 16px; }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 18px 20px;
        box-shadow: 0 14px 36px rgba(18, 52, 77, 0.08);
      }
      h1 { margin: 0; font-size: 31px; line-height: 1.1; letter-spacing: -0.02em; }
      h2 { margin: 0 0 10px; font-size: 18px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 12px; }
      .tile { border: 1px solid var(--line); border-radius: 16px; padding: 14px 15px; background: #fbfdff; min-height: 92px; }
      .label { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
      .value { font-size: 24px; font-weight: 700; line-height: 1.1; }
      .small { color: var(--muted); font-size: 13px; line-height: 1.55; }
      .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .hero {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }
      .hero-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 10px;
      }
      .hero-link {
        color: var(--accent);
        text-decoration: none;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 9px 14px;
        background: #fff;
        font-size: 13px;
      }
      .hero-meta {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .hero-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        background: #f6fafc;
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 12px;
      }
      .controls {
        display: grid;
        grid-template-columns: minmax(250px, auto) minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }
      .controls-group { display: grid; gap: 14px; }
      .scope-switcher {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .member-select-wrap {
        display: grid;
        gap: 6px;
        min-width: 240px;
      }
      .member-select-note {
        color: var(--muted);
        font-size: 12px;
      }
      .range-block {
        display: grid;
        gap: 12px;
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px 16px;
        background: #fbfdff;
      }
      .range-row {
        display: grid;
        grid-template-columns: 78px 1fr 104px;
        gap: 10px;
        align-items: center;
      }
      .scope-btn {
        border: 1px solid var(--line);
        background: #fff;
        color: var(--ink);
        border-radius: 999px;
        padding: 9px 15px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }
      .scope-btn.active {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
      }
      .grain-btn {
        border: 1px solid var(--line);
        background: #fff;
        color: var(--ink);
        border-radius: 999px;
        padding: 9px 15px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }
      .grain-btn.active {
        background: var(--ink);
        color: #fff;
        border-color: var(--ink);
      }
      select {
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #fff;
        color: var(--ink);
        min-height: 42px;
      }
      input[type="range"] {
        width: 100%;
        accent-color: var(--accent);
      }
      .two-col { display: grid; grid-template-columns: 1fr; gap: 18px; }
      .chart-shell {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px;
        background: linear-gradient(180deg, #fbfdff 0%, #f7fbfd 100%);
        overflow-x: hidden;
        overflow-y: hidden;
        position: relative;
        min-height: 396px;
        max-width: 100%;
      }
      .chart-tip {
        position: absolute;
        pointer-events: none;
        z-index: 10;
        min-width: 220px;
        max-width: 280px;
        background: rgba(18, 52, 77, 0.96);
        color: #fff;
        border-radius: 12px;
        padding: 10px 12px;
        box-shadow: 0 14px 30px rgba(18, 52, 77, 0.24);
        font-size: 12px;
        line-height: 1.45;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 120ms ease, transform 120ms ease;
      }
      .chart-tip.show { opacity: 1; transform: translateY(0); }
      svg { display: block; margin: 0 auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border-bottom: 1px solid var(--line); padding: 10px 12px; text-align: right; }
      th:first-child, td:first-child { text-align: left; }
      a { color: var(--accent); }
      @media (max-width: 900px) {
        body { padding: 12px 10px 22px; }
        .card { padding: 16px; border-radius: 18px; }
        h1 { font-size: 24px; }
        .hero { flex-direction: column; }
        .two-col { grid-template-columns: 1fr; }
        .controls { grid-template-columns: 1fr; }
        .range-row { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="card">
        <div class="hero">
          <div>
            <div class="hero-kicker">Private AI Usage Dashboard</div>
            <h1>${esc(heading)}</h1>
            <div class="hero-meta">
              <div class="hero-chip">当前角色：${esc(role)}</div>
              <div class="hero-chip">团队：${esc(teamName || currentLabel || '-')}</div>
            </div>
          </div>
          <a class="hero-link" href="${esc(withBasePath(basePath, '/logout'))}">Logout</a>
        </div>
      </section>
      <section class="card">
        <h2>视角切换与时间控制</h2>
        <div class="controls">
          <div class="controls-group">
            <div>
              <div class="label">查看对象</div>
              <div class="toolbar" id="scopeBar"></div>
            </div>
            <div>
              <div class="label">时间粒度</div>
              <div id="grainBar" class="toolbar"></div>
            </div>
          </div>
          <div class="range-block">
            <div class="range-row">
              <div class="label">开始周期</div>
              <input id="startRange" type="range" min="0" max="0" value="0" />
              <div id="startLabel">-</div>
            </div>
            <div class="range-row">
              <div class="label">结束周期</div>
              <input id="endRange" type="range" min="0" max="0" value="0" />
              <div id="endLabel">-</div>
            </div>
            <p class="small" id="rangeNote"></p>
          </div>
        </div>
        <p class="small" id="scopeNote"></p>
      </section>
      <section class="card">
        <h2 id="chartTitle"></h2>
        <p class="small" id="chartNote"></p>
        <div class="chart-shell">
          <svg id="mainChart" viewBox="0 0 1180 430"></svg>
          <div id="chartTooltip" class="chart-tip"></div>
        </div>
      </section>
      <section class="card">
        <h2 id="summaryTitle"></h2>
        <div class="grid" id="summaryGrid"></div>
      </section>
      <section class="card">
        <div class="two-col">
          <div>
            <h2 id="leftTableTitle"></h2>
            <table><thead id="leftHead"></thead><tbody id="leftBody"></tbody></table>
          </div>
          <div>
            <h2 id="rightTableTitle"></h2>
            <table><thead id="rightHead"></thead><tbody id="rightBody"></tbody></table>
          </div>
        </div>
      </section>
    </div>
    <script>
      const dashboardData = ${JSON.stringify(payload)};
      const fmt = new Intl.NumberFormat('en-US');
      const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
      const grainOrder = ['day', 'week', 'month'];
      const grainLabels = { day: 'By Day', week: 'By Week', month: 'By Month' };
      const colorPalette = ['#1565c0', '#ef6c00', '#2e7d32', '#6a1b9a', '#00838f', '#ad1457', '#455a64'];
      const uiState = {
        scopeId: dashboardData.currentScopeId,
        grain: 'day',
        startIndex: 0,
        endIndex: 0,
      };

      function escHtml(value) {
        return String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;');
      }

      function normalizeReport(report) {
        if (!report || typeof report !== 'object') {
          return { summary: {}, byMember: [], sourceUsage: [], parserReports: [], dailyUsage: [] };
        }
        if (Array.isArray(report.dailyUsage) || Array.isArray(report.byMember) || Array.isArray(report.parserReports)) {
          return {
            ...report,
            summary: report.summary || {},
            byMember: Array.isArray(report.byMember) ? report.byMember : [],
            sourceUsage: Array.isArray(report.sourceUsage) ? report.sourceUsage : [],
            parserReports: Array.isArray(report.parserReports) ? report.parserReports : [],
            dailyUsage: Array.isArray(report.dailyUsage) ? report.dailyUsage : [],
          };
        }
        const meta = report.meta || {};
        const summary = report.summary || {};
        const items = Array.isArray(report.items) ? report.items : [];
        return {
          ...report,
          summary: {
            totalTokens: Number(summary.totalTokens || 0),
            inputTokens: Number(summary.inputTokens || 0),
            cachedInputTokens: Number(summary.cachedInputTokens || 0),
            outputTokens: Number(summary.outputTokens || 0),
            reasoningOutputTokens: Number(summary.reasoningOutputTokens || 0),
            totalSessions: Number(summary.totalSessions || 0),
            totalBuckets: Number(summary.totalBuckets || 0),
            sourceCount: Number(summary.sourceCount || 1),
          },
          parserReports: [{
            source: meta.source || 'unknown',
            totalTokens: Number(summary.totalTokens || 0),
            inputTokens: Number(summary.inputTokens || 0),
            cachedInputTokens: Number(summary.cachedInputTokens || 0),
            outputTokens: Number(summary.outputTokens || 0),
            reasoningOutputTokens: Number(summary.reasoningOutputTokens || 0),
            sessions: Number(summary.totalSessions || 0),
          }],
          dailyUsage: items.map((item) => ({
            date: item.date,
            accountedTotalTokens: Number(item.accountedTotalTokens || item.totalTokens || 0),
            inputTokens: Number(item.inputTokens || 0),
            cachedInputTokens: Number(item.cachedInputTokens || 0),
            outputTokens: Number(item.outputTokens || 0),
            reasoningOutputTokens: Number(item.reasoningOutputTokens || 0),
            sessionsStarted: Number(item.sessionsStarted || item.eventCount || 0),
          })),
          byMember: [],
          sourceUsage: [],
        };
      }

      function getScope(scopeId) {
        return dashboardData.scopes.find((scope) => scope.id === scopeId) || dashboardData.scopes[0];
      }

      function getPeriodKey(date, grain) {
        if (grain === 'day') return date;
        if (grain === 'month') return String(date).slice(0, 7);
        const d = new Date(date + 'T00:00:00Z');
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() - day + 1);
        return d.toISOString().slice(0, 10);
      }

      function getPeriodLabel(key, grain) {
        if (grain === 'day') return key.slice(5);
        if (grain === 'month') return key;
        return key.slice(5) + ' wk';
      }

      function aggregateDailyRows(rows, grain) {
        const map = new Map();
        (rows || []).forEach((row) => {
          const key = getPeriodKey(row.date, grain);
          if (!map.has(key)) {
            map.set(key, {
              period: key,
              label: getPeriodLabel(key, grain),
              accountedTotalTokens: 0,
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              reasoningOutputTokens: 0,
              sessionsStarted: 0,
            });
          }
          const target = map.get(key);
          target.accountedTotalTokens += Number(row.accountedTotalTokens || 0);
          target.inputTokens += Number(row.inputTokens || 0);
          target.cachedInputTokens += Number(row.cachedInputTokens || 0);
          target.outputTokens += Number(row.outputTokens || 0);
          target.reasoningOutputTokens += Number(row.reasoningOutputTokens || 0);
          target.sessionsStarted += Number(row.sessionsStarted || 0);
        });
        return Array.from(map.values()).sort((a, b) => String(a.period).localeCompare(String(b.period)));
      }

      function getScopeRows(scope, grain) {
        if (scope.kind !== 'team') {
          return aggregateDailyRows((normalizeReport(scope.report).dailyUsage || []), grain);
        }
        const periods = new Map();
        dashboardData.scopes.filter((item) => item.kind === 'member').forEach((memberScope) => {
          aggregateDailyRows((normalizeReport(memberScope.report).dailyUsage || []), grain).forEach((row) => {
            if (!periods.has(row.period)) {
              periods.set(row.period, {
                period: row.period,
                label: row.label,
                accountedTotalTokens: 0,
                inputTokens: 0,
                cachedInputTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
                sessionsStarted: 0,
              });
            }
            const target = periods.get(row.period);
            target.accountedTotalTokens += row.accountedTotalTokens;
            target.inputTokens += row.inputTokens;
            target.cachedInputTokens += row.cachedInputTokens;
            target.outputTokens += row.outputTokens;
            target.reasoningOutputTokens += row.reasoningOutputTokens;
            target.sessionsStarted += row.sessionsStarted;
          });
        });
        return Array.from(periods.values()).sort((a, b) => String(a.period).localeCompare(String(b.period)));
      }

      function getFilteredRows(rows) {
        if (!rows.length) return [];
        const start = Math.max(0, Math.min(uiState.startIndex, rows.length - 1));
        const end = Math.max(start, Math.min(uiState.endIndex, rows.length - 1));
        return rows.slice(start, end + 1);
      }

      function getDefaultWindowSize(scope, grain) {
        const memberCount = dashboardData.scopes.filter((item) => item.kind === 'member').length;
        if (scope?.kind === 'team') {
          if (grain === 'day') return memberCount > 8 ? 7 : 14;
          if (grain === 'week') return 8;
          return 6;
        }
        if (grain === 'day') return 30;
        if (grain === 'week') return 12;
        return 12;
      }

      function resetRangeToRecent(scope, rows) {
        if (!rows.length) {
          uiState.startIndex = 0;
          uiState.endIndex = 0;
          return;
        }
        uiState.endIndex = rows.length - 1;
        uiState.startIndex = Math.max(0, rows.length - getDefaultWindowSize(scope, uiState.grain));
      }

      function shouldShowXAxisLabel(index, total) {
        if (total <= 10) return true;
        const step = Math.max(1, Math.ceil(total / 8));
        return index === 0 || index === total - 1 || index % step === 0;
      }

      function getLatestTeamPeriod(grain) {
        const teamScope = getScope('team');
        return getScopeRows(teamScope, grain).at(-1)?.period || null;
      }

      function buildTeamRankingRows(grain, endPeriod) {
        const resolvedEndPeriod = endPeriod || getLatestTeamPeriod(grain);
        const memberRows = dashboardData.scopes
          .filter((item) => item.kind === 'member')
          .map((item) => {
            const point = aggregateDailyRows((normalizeReport(item.report).dailyUsage || []), grain)
              .find((row) => row.period === resolvedEndPeriod);
            return {
              memberId: item.id,
              memberName: item.label,
              team: item.team || '',
              currentTokens: Number(point?.accountedTotalTokens || 0),
              inputTokens: Number(point?.inputTokens || 0),
              cachedInputTokens: Number(point?.cachedInputTokens || 0),
              outputTokens: Number(point?.outputTokens || 0),
              reasoningOutputTokens: Number(point?.reasoningOutputTokens || 0),
              totalTokens: Number(normalizeReport(item.report).summary?.totalTokens || 0),
              isOthers: false,
            };
          })
          .sort((a, b) => b.currentTokens - a.currentTokens || String(a.memberName).localeCompare(String(b.memberName)));

        return {
          rows: memberRows,
          fullRows: memberRows,
        };
      }

      function renderScopeBar(activeScopeId, sortPeriod = null) {
        const bar = document.getElementById('scopeBar');
        const memberScopes = dashboardData.scopes.filter((scope) => scope.kind === 'member');
        if (dashboardData.role === 'admin' && memberScopes.length > 1) {
          const rankedMembers = buildTeamRankingRows(uiState.grain, sortPeriod || getLatestTeamPeriod(uiState.grain)).fullRows;
          bar.innerHTML =
            '<div class="scope-switcher">' +
              '<button class="scope-btn' + (activeScopeId === 'team' ? ' active' : '') + '" data-scope-id="team">Team</button>' +
              '<div class="member-select-wrap">' +
                '<select id="memberSelect">' +
                  '<option value="">按当前结束周期排序选择成员</option>' +
                  rankedMembers.map((item) =>
                    '<option value="' + escHtml(item.memberId) + '"' + (activeScopeId === item.memberId ? ' selected' : '') + '>' +
                      escHtml(item.memberName + ' · ' + compact.format(item.currentTokens || 0)) +
                    '</option>'
                  ).join('') +
                '</select>' +
                '<div class="member-select-note">排序规则：当前结束周期 tokens 从高到低</div>' +
              '</div>' +
            '</div>';
          bar.querySelector('[data-scope-id="team"]')?.addEventListener('click', () => renderScope('team', true));
          bar.querySelector('#memberSelect')?.addEventListener('change', (event) => {
            const targetScopeId = event.target.value;
            if (targetScopeId) renderScope(targetScopeId, true);
          });
          return;
        }

        bar.innerHTML = dashboardData.scopes.map((scope) =>
          '<button class="scope-btn' + (scope.id === activeScopeId ? ' active' : '') + '" data-scope-id="' + escHtml(scope.id) + '">' + escHtml(scope.label) + '</button>'
        ).join('');
        bar.querySelectorAll('[data-scope-id]').forEach((node) => {
          node.addEventListener('click', () => renderScope(node.getAttribute('data-scope-id'), true));
        });
      }

      function renderGrainBar() {
        const bar = document.getElementById('grainBar');
        bar.innerHTML = grainOrder.map((grain) =>
          '<button class="grain-btn' + (grain === uiState.grain ? ' active' : '') + '" data-grain="' + grain + '">' + grainLabels[grain] + '</button>'
        ).join('');
        bar.querySelectorAll('[data-grain]').forEach((node) => {
          node.addEventListener('click', () => {
            uiState.grain = node.getAttribute('data-grain');
            renderScope(uiState.scopeId, true);
          });
        });
      }

      function renderRangeControls(rows) {
        const startRange = document.getElementById('startRange');
        const endRange = document.getElementById('endRange');
        const startLabel = document.getElementById('startLabel');
        const endLabel = document.getElementById('endLabel');
        if (!rows.length) {
          startLabel.textContent = '-';
          endLabel.textContent = '-';
          document.getElementById('rangeNote').textContent = '当前范围内暂无数据';
          return;
        }
        const scope = getScope(uiState.scopeId);
        if (uiState.endIndex >= rows.length || uiState.startIndex >= rows.length) {
          resetRangeToRecent(scope, rows);
        }
        startRange.min = '0';
        startRange.max = String(rows.length - 1);
        endRange.min = '0';
        endRange.max = String(rows.length - 1);
        startRange.value = String(uiState.startIndex);
        endRange.value = String(uiState.endIndex);
        startRange.oninput = () => {
          uiState.startIndex = Number(startRange.value);
          if (uiState.startIndex > uiState.endIndex) uiState.endIndex = uiState.startIndex;
          renderScope(uiState.scopeId, false);
        };
        endRange.oninput = () => {
          uiState.endIndex = Number(endRange.value);
          if (uiState.endIndex < uiState.startIndex) uiState.startIndex = uiState.endIndex;
          renderScope(uiState.scopeId, false);
        };
        const filtered = getFilteredRows(rows);
        startLabel.textContent = filtered[0].label;
        endLabel.textContent = filtered[filtered.length - 1].label;
        document.getElementById('rangeNote').textContent = '当前范围：' + filtered[0].label + ' 到 ' + filtered[filtered.length - 1].label + '，共 ' + filtered.length + ' 个周期';
      }

      function renderSummary(scope, rows) {
        const summary = rows.reduce((acc, row) => {
          acc.totalTokens += Number(row.accountedTotalTokens || 0);
          acc.inputTokens += Number(row.inputTokens || 0);
          acc.cachedInputTokens += Number(row.cachedInputTokens || 0);
          acc.outputTokens += Number(row.outputTokens || 0);
          acc.reasoningOutputTokens += Number(row.reasoningOutputTokens || 0);
          acc.totalSessions += Number(row.sessionsStarted || 0);
          return acc;
        }, {
          totalTokens: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          totalSessions: 0,
        });
        document.getElementById('summaryTitle').textContent = scope.kind === 'team' ? '团队总览统计' : (scope.label + ' 总览统计');
        document.getElementById('summaryGrid').innerHTML = [
          ['总 tokens', summary.totalTokens],
          ['Input', summary.inputTokens],
          ['Cached', summary.cachedInputTokens],
          ['Output', summary.outputTokens],
          ['Reasoning', summary.reasoningOutputTokens],
          ['总 sessions', summary.totalSessions],
          ['周期数', rows.length],
          ['粒度', grainLabels[uiState.grain]],
        ].map(([label, value]) =>
          '<div class="tile"><div class="label">' + escHtml(label) + '</div><div class="value">' + escHtml(typeof value === 'string' ? value : fmt.format(Number(value || 0))) + '</div></div>'
        ).join('');
      }

      function getVisualHeights(row, maxValue, plotHeight) {
        const total = Math.max(Number(row.total || 0), 0);
        const raw = {
          inputTokens: Number(row.inputTokens || 0),
          cachedInputTokens: Number(row.cachedInputTokens || 0),
          outputTokens: Number(row.outputTokens || 0),
          reasoningOutputTokens: Number(row.reasoningOutputTokens || 0),
        };
        const cachedShare = total > 0 ? raw.cachedInputTokens / total : 0;
        const nonCachedTotal = raw.inputTokens + raw.outputTokens + raw.reasoningOutputTokens;
        const visual = (cachedShare > 0.72 && nonCachedTotal > 0)
          ? {
              inputTokens: total * 0.28 * (raw.inputTokens / nonCachedTotal),
              cachedInputTokens: total * 0.72,
              outputTokens: total * 0.28 * (raw.outputTokens / nonCachedTotal),
              reasoningOutputTokens: total * 0.28 * (raw.reasoningOutputTokens / nonCachedTotal),
            }
          : raw;
        const totalHeightPx = total > 0 ? (total / maxValue) * plotHeight : 0;
        const heights = {
          inputTokens: total > 0 ? Math.max(0, visual.inputTokens / maxValue * plotHeight) : 0,
          cachedInputTokens: total > 0 ? Math.max(0, visual.cachedInputTokens / maxValue * plotHeight) : 0,
          outputTokens: total > 0 ? Math.max(0, visual.outputTokens / maxValue * plotHeight) : 0,
          reasoningOutputTokens: total > 0 ? Math.max(0, visual.reasoningOutputTokens / maxValue * plotHeight) : 0,
        };
        const keys = ['outputTokens', 'reasoningOutputTokens'];
        for (const key of keys) {
          if (raw[key] > 0 && heights[key] < 5) {
            const need = 5 - heights[key];
            heights[key] = 5;
            heights.cachedInputTokens = Math.max(0, heights.cachedInputTokens - need);
          }
        }
        return heights;
      }

      function renderStackedChart(scope, rows) {
        const tooltip = document.getElementById('chartTooltip');
        const svg = document.getElementById('mainChart');
        const endPeriod = rows.at(-1)?.period || null;
        const teamRanking = scope.kind === 'team' ? buildTeamRankingRows(uiState.grain, endPeriod) : null;
        const teamLegendRows = scope.kind === 'team'
          ? Math.max(1, Math.ceil((teamRanking?.rows.length || 0) / 4))
          : 1;
        const title = scope.kind === 'team' ? '团队分周期成员对比' : '按时间总量 + Breakdown';
        document.getElementById('chartTitle').textContent = title;
        document.getElementById('chartNote').textContent = scope.kind === 'team'
          ? ('团队视角按当前结束周期排序并展示所有成员。当前结束周期：' + (rows.at(-1)?.label || '-'))
          : '总量标签会长期显示；当 cached 占比过大时，图内会压缩 cached 的视觉占比，保证其余部分也能看到。';
        const width = 1120;
        const height = scope.kind === 'team'
          ? Math.max(380, 360 + (teamLegendRows - 1) * 20)
          : 340;
        const left = 72;
        const right = 28;
        const top = 56;
        const bottom = scope.kind === 'team' ? 92 + teamLegendRows * 20 : 92;
        const plotWidth = width - left - right;
        const plotHeight = height - top - bottom;
        const stepX = plotWidth / Math.max(rows.length, 1);
        const barWidth = Math.max(scope.kind === 'team' ? 8 : 14, Math.min(scope.kind === 'team' ? 14 : 24, stepX * 0.55));
        const palette = { inputTokens: '#2e7d32', cachedInputTokens: '#00838f', outputTokens: '#ef6c00', reasoningOutputTokens: '#d81b60' };
        const maxValue = scope.kind === 'team'
          ? Math.max(
              ...((teamRanking?.rows || []).flatMap((member) =>
                rows.map((row) => Number(
                  new Map(aggregateDailyRows((normalizeReport(getScope(member.memberId).report).dailyUsage || []), uiState.grain).map((item) => [item.period, item]))
                    .get(row.period)?.accountedTotalTokens || 0
                ))
              )),
              1
            )
          : Math.max(...rows.map((row) => Number(row.total || row.accountedTotalTokens || 0)), 1);
        const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = maxValue * ratio;
          const y = top + plotHeight - ratio * plotHeight;
          return '<line x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '" stroke="#d7e3ef" stroke-width="1" />' +
            '<text x="' + (left - 10) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="#476072">' + escHtml(compact.format(value)) + '</text>';
        }).join('');
        let bars = '';
        let legend = '';
        if (scope.kind === 'team') {
          const rankingRows = teamRanking?.rows || [];
          const series = rankingRows.map((member, index) => {
            const map = new Map(aggregateDailyRows((normalizeReport(getScope(member.memberId).report).dailyUsage || []), uiState.grain).map((row) => [row.period, row]));
            return {
              ...member,
              color: colorPalette[index % colorPalette.length],
              map,
            };
          });
          const groupWidth = Math.max(28, Math.min(74, stepX * 0.88));
          const innerBarWidth = Math.max(2, Math.min(12, groupWidth / Math.max(series.length, 1)));
          const latestPeriod = rows.at(-1)?.period || null;
          bars = rows.map((row, index) => {
            const baseX = left + index * stepX + (stepX - groupWidth) / 2;
            const xLabel = shouldShowXAxisLabel(index, rows.length)
              ? '<text x="' + (baseX + groupWidth / 2) + '" y="' + (top + plotHeight + 22) + '" text-anchor="middle" font-size="11" fill="#476072">' + escHtml(row.label) + '</text>'
              : '';
            const barGroup = series.map((member, memberIndex) => {
              const point = member.map.get(row.period) || { accountedTotalTokens: 0 };
              const value = Number(point.accountedTotalTokens || 0);
              const x = baseX + memberIndex * innerBarWidth;
              const y = top + plotHeight - (value / maxValue) * plotHeight;
              const h = top + plotHeight - y;
              const label = row.period === latestPeriod && value > 0
                ? '<text x="' + (x + innerBarWidth / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="9" fill="#12344d">' + escHtml(compact.format(value)) + '</text>'
                : '';
              return '<rect data-index="' + index + '" data-series="' + memberIndex + '" x="' + x + '" y="' + y + '" width="' + Math.max(1.5, innerBarWidth - 0.5) + '" height="' + h + '" fill="' + member.color + '" rx="3"></rect>' + label;
            }).join('');
            return barGroup + xLabel;
          }).join('');
          legend = series.map((member, index) => {
            const x = left + (index % 4) * 235;
            const y = height - 28 - Math.floor(index / 4) * 18;
            return '<rect x="' + x + '" y="' + (y - 10) + '" width="16" height="12" fill="' + member.color + '" rx="3"></rect>' +
              '<text x="' + (x + 24) + '" y="' + y + '" font-size="12" fill="#476072">' + escHtml(member.memberName) + '</text>';
          }).join('');
        } else {
          const labels = { inputTokens: 'Input', cachedInputTokens: 'Cached', outputTokens: 'Output', reasoningOutputTokens: 'Reasoning' };
          bars = rows.map((row, index) => {
            const stackedRow = {
              total: Number(row.accountedTotalTokens || 0),
              inputTokens: Number(row.inputTokens || 0),
              cachedInputTokens: Number(row.cachedInputTokens || 0),
              outputTokens: Number(row.outputTokens || 0),
              reasoningOutputTokens: Number(row.reasoningOutputTokens || 0),
            };
            const x = left + index * stepX + (stepX - barWidth) / 2;
            let running = top + plotHeight;
            const heights = getVisualHeights(stackedRow, maxValue, plotHeight);
            const segments = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens'].map((key) => {
              const segmentHeight = heights[key] || 0;
              const y = running - segmentHeight;
              running = y;
              if (segmentHeight <= 0) return '';
              return '<rect data-index="' + index + '" x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + segmentHeight + '" fill="' + palette[key] + '" rx="5"></rect>';
            }).join('');
            return segments +
              '<text x="' + (x + barWidth / 2) + '" y="' + (running - 8) + '" text-anchor="middle" font-size="11" fill="#0d3557">' + escHtml(compact.format(stackedRow.total)) + '</text>' +
              (shouldShowXAxisLabel(index, rows.length)
                ? '<text x="' + (x + barWidth / 2) + '" y="' + (top + plotHeight + 22) + '" text-anchor="middle" font-size="11" fill="#476072">' + escHtml(row.label) + '</text>'
                : '');
          }).join('');
          legend = Object.entries(labels).map(([key, label], index) => {
            const x = left + index * 170;
            const y = height - 28;
            return '<rect x="' + x + '" y="' + (y - 10) + '" width="16" height="12" fill="' + palette[key] + '" rx="3"></rect>' +
              '<text x="' + (x + 24) + '" y="' + y + '" font-size="12" fill="#476072">' + escHtml(label) + '</text>';
          }).join('');
        }
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.maxWidth = '100%';
        svg.innerHTML = '<rect width="' + width + '" height="' + height + '" fill="#f8fbfd" rx="18"></rect>' +
          '<text x="' + left + '" y="24" font-size="18" font-weight="700" fill="#12344d">' + escHtml(title) + '</text>' +
          grid + bars + legend;
        svg.querySelectorAll('[data-index]').forEach((node) => {
          node.style.cursor = 'pointer';
          node.addEventListener('mouseenter', (event) => {
            const row = rows[Number(event.target.getAttribute('data-index'))];
            if (scope.kind === 'team') {
              const series = dashboardData.scopes
                .filter((item) => item.kind === 'member')
                .map((item) => {
                  const point = aggregateDailyRows((normalizeReport(item.report).dailyUsage || []), uiState.grain).find((entry) => entry.period === row.period);
                  return '<div>' + escHtml(item.label) + ': ' + escHtml(fmt.format(Number(point?.accountedTotalTokens || 0))) + '</div>';
                }).join('');
              tooltip.innerHTML = '<strong>' + escHtml(row.label) + '</strong>' + series;
            } else {
              tooltip.innerHTML =
                '<strong>' + escHtml(row.label) + '</strong>' +
                '<div>Total: ' + escHtml(fmt.format(Number(row.accountedTotalTokens || 0))) + '</div>' +
                '<div>Input: ' + escHtml(fmt.format(Number(row.inputTokens || 0))) + '</div>' +
                '<div>Cached: ' + escHtml(fmt.format(Number(row.cachedInputTokens || 0))) + '</div>' +
                '<div>Output: ' + escHtml(fmt.format(Number(row.outputTokens || 0))) + '</div>' +
                '<div>Reasoning: ' + escHtml(fmt.format(Number(row.reasoningOutputTokens || 0))) + '</div>';
            }
            tooltip.classList.add('show');
          });
          node.addEventListener('mousemove', (event) => {
            const shell = document.getElementById('mainChart').closest('.chart-shell');
            const rect = shell.getBoundingClientRect();
            tooltip.style.left = Math.min(event.clientX - rect.left + 14, rect.width - 260) + 'px';
            tooltip.style.top = Math.max(event.clientY - rect.top - 8, 12) + 'px';
          });
          node.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
        });
      }

      function renderTable(headId, bodyId, columns, rows) {
        document.getElementById(headId).innerHTML = '<tr>' + columns.map((col) => '<th>' + escHtml(col.label) + '</th>').join('') + '</tr>';
        document.getElementById(bodyId).innerHTML =
          (rows || []).map((row) => '<tr>' + columns.map((col) => '<td>' + escHtml(col.format ? col.format(row[col.key], row) : row[col.key]) + '</td>').join('') + '</tr>').join('') ||
          '<tr><td colspan="' + columns.length + '">暂无数据</td></tr>';
      }

      function renderScope(scopeId, resetWindow = false) {
        const scope = getScope(scopeId);
        scope.report = normalizeReport(scope.report);
        uiState.scopeId = scope.id;
        const rows = getScopeRows(scope, uiState.grain);
        if (!rows.length) {
          uiState.startIndex = 0;
          uiState.endIndex = 0;
        } else if (resetWindow || uiState.endIndex >= rows.length || uiState.startIndex >= rows.length) {
          resetRangeToRecent(scope, rows);
        }
        const filteredRows = getFilteredRows(rows);
        renderScopeBar(scope.id, filteredRows.at(-1)?.period || null);
        renderGrainBar();
        renderRangeControls(rows);
        document.getElementById('scopeNote').textContent = scope.kind === 'team'
          ? '当前查看团队视角。主图按当前结束周期做成员排名，下方表格与主图保持同序，所有成员都会展示。'
          : '当前查看成员视角。主图优先展示该成员的总量与 breakdown，随后再展开来源和逐日明细。';
        renderStackedChart(scope, filteredRows);
        renderSummary(scope, filteredRows);

        if (scope.kind === 'team') {
          const rankingSnapshot = buildTeamRankingRows(uiState.grain, filteredRows.at(-1)?.period || null);
          document.getElementById('leftTableTitle').textContent = '成员列表';
          renderTable('leftHead', 'leftBody', [
            { key: 'memberName', label: '成员' },
            { key: 'team', label: '团队' },
            { key: 'currentTokens', label: (filteredRows.at(-1)?.label || '当前') + ' tokens', format: (v) => fmt.format(Number(v || 0)) },
            { key: 'totalTokens', label: '窗口总 tokens', format: (v) => fmt.format(Number(v || 0)) },
          ], rankingSnapshot.fullRows || []);
          document.getElementById('rightTableTitle').textContent = '团队每日明细';
          renderTable('rightHead', 'rightBody', [
            { key: 'period', label: '日期' },
            { key: 'accountedTotalTokens', label: '总 tokens', format: (v) => fmt.format(Number(v || 0)) },
            { key: 'inputTokens', label: 'Input', format: (v) => fmt.format(Number(v || 0)) },
            { key: 'cachedInputTokens', label: 'Cached', format: (v) => fmt.format(Number(v || 0)) },
            { key: 'outputTokens', label: 'Output', format: (v) => fmt.format(Number(v || 0)) },
          ], [...filteredRows].reverse());
          return;
        }

        document.getElementById('leftTableTitle').textContent = '个人来源 Breakdown';
        renderTable('leftHead', 'leftBody', [
          { key: 'source', label: '来源' },
          { key: 'totalTokens', label: '总 tokens', format: (v) => fmt.format(Number(v || 0)) },
          { key: 'inputTokens', label: 'Input', format: (v) => fmt.format(Number(v || 0)) },
          { key: 'cachedInputTokens', label: 'Cached', format: (v) => fmt.format(Number(v || 0)) },
          { key: 'outputTokens', label: 'Output', format: (v) => fmt.format(Number(v || 0)) },
        ], scope.report.parserReports || []);
        document.getElementById('rightTableTitle').textContent = '个人每日明细';
        renderTable('rightHead', 'rightBody', [
          { key: 'period', label: '日期' },
          { key: 'accountedTotalTokens', label: '总 tokens', format: (v) => fmt.format(Number(v || 0)) },
          { key: 'inputTokens', label: 'Input', format: (v) => fmt.format(Number(v || 0)) },
          { key: 'cachedInputTokens', label: 'Cached', format: (v) => fmt.format(Number(v || 0)) },
          { key: 'outputTokens', label: 'Output', format: (v) => fmt.format(Number(v || 0)) },
        ], [...filteredRows].reverse());
      }

      renderScope(dashboardData.currentScopeId, true);
    </script>
  </body>
</html>`;
}

export function buildMemberHtml(basePath, principal, latest) {
  const report = latest?.report || { summary: {}, parserReports: [], dailyUsage: [] };
  return buildDashboardShellHtml(basePath, {
    pageTitle: `${principal.memberName} · Private AI Usage`,
    heading: `${principal.memberName} · Private AI Usage`,
    role: principal.role,
    teamName: principal.team,
    scopes: [{
      id: principal.memberId,
      label: principal.memberName,
      team: principal.team,
      kind: 'member',
      report,
    }],
    currentScopeId: principal.memberId,
    currentLabel: principal.memberName,
    currentReport: report,
  });
}

export function buildAdminHtml(basePath, report, memberReports = [], selectedMemberId = '') {
  const selected = memberReports.find((item) => item.memberId === selectedMemberId) || null;
  const scopes = [
    { id: 'team', label: 'Team', team: report.teamName, kind: 'team', report },
    ...memberReports.map((item) => ({
      id: item.memberId,
      label: item.memberName,
      team: item.team || '',
      kind: 'member',
      report: item.report || { summary: {}, parserReports: [], dailyUsage: [] },
    })),
  ];
  return buildDashboardShellHtml(basePath, {
    pageTitle: `${report.teamName} · Admin`,
    heading: `${report.teamName} · Admin`,
    role: 'admin',
    teamName: report.teamName,
    scopes,
    currentScopeId: selected ? selected.memberId : 'team',
    currentLabel: selected ? selected.memberName : 'Team',
    currentReport: selected ? selected.report : report,
  });
}

export function createInMemoryPrivateUsageStore(initial = {}) {
  const principalsByHash = new Map();
  const latestReports = new Map();

  for (const principal of initial.principals || []) {
    principalsByHash.set(principal.tokenHash, { ...principal });
  }
  for (const report of initial.reports || []) {
    latestReports.set(`${report.projectSlug}:${report.memberId}`, { ...report });
  }

  return {
    async getPrincipalByAccessToken(accessToken) {
      return principalsByHash.get(sha256(accessToken)) || null;
    },
    async recordUsageUpload(principal, report, meta = {}) {
      const uploadedAt = new Date().toISOString();
      latestReports.set(`${principal.projectSlug}:${principal.memberId}`, {
        projectSlug: principal.projectSlug,
        principalId: principal.principalId,
        memberId: principal.memberId,
        memberName: principal.memberName,
        team: principal.team,
        uploadedAt,
        clientVersion: meta.clientVersion || null,
        report: normalizeUsageReport(report),
      });
      return { uploadedAt };
    },
    async getLatestReportForPrincipal(principal) {
      return latestReports.get(`${principal.projectSlug}:${principal.memberId}`) || null;
    },
    async getLatestTeamReport(projectSlug, options = {}) {
      const memberReports = Array.from(latestReports.values())
        .filter((item) => item.projectSlug === projectSlug)
        .map((item) => ({
          memberId: item.memberId,
          memberName: item.memberName,
          team: item.team,
          reportPath: `supabase:${item.memberId}`,
          report: normalizeUsageReport(item.report),
        }));
      return aggregateTeamReports(memberReports, options);
    },
    async getLatestTeamMemberReports(projectSlug) {
      return Array.from(latestReports.values())
        .filter((item) => item.projectSlug === projectSlug)
        .map((item) => ({
          memberId: item.memberId,
          memberName: item.memberName,
          team: item.team,
          uploadedAt: item.uploadedAt,
          report: normalizeUsageReport(item.report),
        }));
    },
  };
}

export function createSupabasePrivateUsageStore({
  supabaseUrl,
  serviceRoleKey,
  projectSlug,
}) {
  const baseUrl = `${String(supabaseUrl).replace(/\/$/, '')}/rest/v1`;

  async function request(path, { method = 'GET', body = null, acceptProfile = 'ai_usage', contentProfile = null, prefer = null } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(acceptProfile ? { 'Accept-Profile': acceptProfile } : {}),
        ...(contentProfile ? { 'Content-Profile': contentProfile } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Supabase request failed: ${response.status} ${text}`);
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    async getPrincipalByAccessToken(accessToken) {
      const tokenHash = sha256(accessToken);
      const rows = await request(
        `/principals?select=principal_id,project_slug,member_id,member_name,team,email,role,token_hint&project_slug=eq.${encodeURIComponent(projectSlug)}&token_hash=eq.${tokenHash}&revoked_at=is.null&limit=1`
      );
      if (!rows?.length) return null;
      const row = rows[0];
      return {
        principalId: row.principal_id,
        projectSlug: row.project_slug,
        memberId: row.member_id,
        memberName: row.member_name,
        team: row.team || '',
        email: row.email || '',
        role: row.role,
        tokenHint: row.token_hint,
      };
    },
    async recordUsageUpload(principal, report, meta = {}) {
      const rawHash = sha256(JSON.stringify(report));
      const uploadedAt = new Date().toISOString();
      const payload = {
        project_slug: principal.projectSlug,
        principal_id: principal.principalId,
        member_id: principal.memberId,
        member_name: principal.memberName,
        team: principal.team,
        hostname: report.hostname || null,
        client_version: meta.clientVersion || null,
        uploaded_at: uploadedAt,
        report_generated_at: report.generatedAt || null,
        raw_hash: rawHash,
        report,
        summary: report.summary || {},
      };
      await request('/usage_reports', {
        method: 'POST',
        body: payload,
        contentProfile: 'ai_usage',
        prefer: 'return=representation',
      });
      await request('/upload_events', {
        method: 'POST',
        body: {
          project_slug: principal.projectSlug,
          principal_id: principal.principalId,
          member_id: principal.memberId,
          event_type: 'upload',
          payload: {
            uploadedAt,
            rawHash,
            tokenHint: principal.tokenHint || null,
          },
        },
        contentProfile: 'ai_usage',
        prefer: 'return=minimal',
      });
      return { uploadedAt };
    },
    async getLatestReportForPrincipal(principal) {
      const rows = await request(
        `/latest_usage_reports?select=uploaded_at,report&project_slug=eq.${encodeURIComponent(principal.projectSlug)}&member_id=eq.${encodeURIComponent(principal.memberId)}&limit=1`
      );
      if (!rows?.length) return null;
      return {
        uploadedAt: rows[0].uploaded_at,
        report: normalizeUsageReport(rows[0].report),
      };
    },
    async getLatestTeamReport(targetProjectSlug, options = {}) {
      const rows = await request(
        `/latest_usage_reports?select=member_id,member_name,team,uploaded_at,report&project_slug=eq.${encodeURIComponent(targetProjectSlug)}`
      );
      const memberReports = (rows || []).map((item) => ({
        memberId: item.member_id,
        memberName: item.member_name,
        team: item.team || '',
        reportPath: `supabase:${item.member_id}`,
        report: normalizeUsageReport(item.report),
      }));
      return aggregateTeamReports(memberReports, options);
    },
    async getLatestTeamMemberReports(targetProjectSlug) {
      const rows = await request(
        `/latest_usage_reports?select=member_id,member_name,team,uploaded_at,report&project_slug=eq.${encodeURIComponent(targetProjectSlug)}`
      );
      return (rows || []).map((item) => ({
        memberId: item.member_id,
        memberName: item.member_name,
        team: item.team || '',
        uploadedAt: item.uploaded_at,
        report: normalizeUsageReport(item.report),
      }));
    },
  };
}

export function createPrivateUsageServer({
  store,
  teamName = 'Private AI Usage Team',
  basePath = '/usage',
  sessionSecret,
  sessionTtlHours = 24,
}) {
  if (!store) throw new Error('store is required');
  if (!sessionSecret) throw new Error('sessionSecret is required');

  const normalizedBasePath = normalizeBasePath(basePath);

  async function resolvePrincipal(req) {
    const session = getSessionFromCookie(req, sessionSecret);
    if (session) return session;
    const accessToken = getBearerToken(req);
    if (!accessToken) return null;
    return store.getPrincipalByAccessToken(accessToken);
  }

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const principal = await resolvePrincipal(req);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true, service: 'private-usage-service' });
        return;
      }

      if (req.method === 'GET' && url.pathname === withBasePath(normalizedBasePath, '/login')) {
        sendHtml(res, 200, buildLoginHtml(normalizedBasePath));
        return;
      }

      if (req.method === 'POST' && url.pathname === withBasePath(normalizedBasePath, '/api/private-usage/session')) {
        const body = await readBody(req);
        const accessToken = String(body.accessToken || '').trim();
        const loginPrincipal = accessToken ? await store.getPrincipalByAccessToken(accessToken) : null;
        if (!loginPrincipal) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        const cookie = buildSessionToken(sessionSecret, loginPrincipal, sessionTtlHours);
        const wantsJson = String(req.headers.accept || '').includes('application/json') || String(req.headers['content-type'] || '').includes('application/json');
        if (wantsJson) {
          sendJson(res, 200, {
            ok: true,
            principal: loginPrincipal,
          }, {
            'Set-Cookie': `aiu_private_session=${cookie}; Path=/; HttpOnly; SameSite=Lax`,
          });
          return;
        }
        res.writeHead(302, {
          Location: withBasePath(normalizedBasePath, '/'),
          'Set-Cookie': `aiu_private_session=${cookie}; Path=/; HttpOnly; SameSite=Lax`,
        });
        res.end();
        return;
      }

      if (req.method === 'GET' && url.pathname === withBasePath(normalizedBasePath, '/logout')) {
        res.writeHead(302, {
          Location: withBasePath(normalizedBasePath, '/login'),
          'Set-Cookie': 'aiu_private_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        });
        res.end();
        return;
      }

      if (req.method === 'GET' && (
        url.pathname === withBasePath(normalizedBasePath, '/') ||
        url.pathname === normalizedBasePath ||
        url.pathname === `${normalizedBasePath}/`
      )) {
        if (!principal) {
          sendHtml(res, 200, buildLoginHtml(normalizedBasePath));
          return;
        }
        if (principal.role === 'admin') {
          const report = await store.getLatestTeamReport(principal.projectSlug, { teamName });
          const memberReports = await store.getLatestTeamMemberReports(principal.projectSlug);
          const selectedMemberId = String(url.searchParams.get('member') || '').trim();
          sendHtml(res, 200, buildAdminHtml(normalizedBasePath, report, memberReports, selectedMemberId));
          return;
        }
        const latest = await store.getLatestReportForPrincipal(principal);
        sendHtml(res, 200, buildMemberHtml(normalizedBasePath, principal, latest));
        return;
      }

      if (req.method === 'GET' && url.pathname === withBasePath(normalizedBasePath, '/api/usage/settings')) {
        if (!principal) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        sendJson(res, 200, {
          uploadProject: true,
          memberId: principal.memberId,
          memberName: principal.memberName,
          team: principal.team,
          role: principal.role,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/usage/settings') {
        if (!principal) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        sendJson(res, 200, {
          uploadProject: true,
          memberId: principal.memberId,
          memberName: principal.memberName,
          team: principal.team,
          role: principal.role,
        });
        return;
      }

      if (req.method === 'POST' && (
        url.pathname === withBasePath(normalizedBasePath, '/api/private-usage/upload') ||
        url.pathname === withBasePath(normalizedBasePath, '/api/internal-usage/upload') ||
        url.pathname === '/api/internal-usage/upload'
      )) {
        if (!principal) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        const body = await readBody(req);
        const report = body.report || body;
        if (!report || typeof report !== 'object' || !report.summary) {
          sendJson(res, 400, { error: 'INVALID_REPORT_PAYLOAD' });
          return;
        }
        const upload = await store.recordUsageUpload(principal, report, {
          clientVersion: body.clientVersion || null,
        });
        const teamReport = await store.getLatestTeamReport(principal.projectSlug, { teamName });
        sendJson(res, 200, {
          ok: true,
          memberId: principal.memberId,
          submittedAt: upload.uploadedAt,
          summary: teamReport.summary,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === withBasePath(normalizedBasePath, '/api/private-usage/me')) {
        if (!principal) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        const latest = await store.getLatestReportForPrincipal(principal);
        sendJson(res, 200, {
          principal,
          uploadedAt: latest?.uploadedAt || null,
          report: latest?.report || null,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === withBasePath(normalizedBasePath, '/api/private-usage/admin/report')) {
        if (!principal) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        if (principal.role !== 'admin') {
          sendJson(res, 403, { error: 'FORBIDDEN' });
          return;
        }
        const report = await store.getLatestTeamReport(principal.projectSlug, { teamName });
        sendJson(res, 200, report);
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
