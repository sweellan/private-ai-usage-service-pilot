import { createServer as createHttpServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { aggregateLatestTokenReports } from '../shared/report_aggregation.mjs';

function normalizePath(path) {
  return resolve(path);
}

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

function createEmptyState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    principals: [],
    sessions: [],
    latestReports: {},
    uploads: [],
  };
}

export function loadTokenUsageState(statePath) {
  const resolvedPath = normalizePath(statePath);
  if (!existsSync(resolvedPath)) return createEmptyState();
  const parsed = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  return {
    version: parsed.version || 1,
    createdAt: parsed.createdAt || new Date().toISOString(),
    principals: Array.isArray(parsed.principals) ? parsed.principals : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    latestReports: parsed.latestReports && typeof parsed.latestReports === 'object' ? parsed.latestReports : {},
    uploads: Array.isArray(parsed.uploads) ? parsed.uploads : [],
  };
}

export function saveTokenUsageState(statePath, state) {
  const resolvedPath = normalizePath(statePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function generateApiKey(prefix) {
  return `${prefix}_${randomBytes(18).toString('hex')}`;
}

function createSessionToken() {
  return `sess_${randomBytes(18).toString('hex')}`;
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

function principalView(principal) {
  return {
    principalId: principal.principalId,
    role: principal.role,
    memberId: principal.memberId || null,
    memberName: principal.memberName || null,
    team: principal.team || null,
    label: principal.label || null,
    createdAt: principal.createdAt,
    revokedAt: principal.revokedAt,
  };
}

function findPrincipalByApiKey(state, apiKey) {
  return state.principals.find((item) => item.apiKey === apiKey && !item.revokedAt) || null;
}

function findSessionByToken(state, sessionToken) {
  return state.sessions.find((item) => item.sessionToken === sessionToken && !item.revokedAt) || null;
}

function getPrincipalFromRequest(state, req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return findPrincipalByApiKey(state, authHeader.slice('Bearer '.length).trim());
  }

  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
    return findPrincipalByApiKey(state, apiKeyHeader.trim());
  }

  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)aiu_session=([^;]+)/);
  if (!match) return null;
  const session = findSessionByToken(state, match[1]);
  if (!session) return null;
  return state.principals.find((item) => item.principalId === session.principalId && !item.revokedAt) || null;
}

export function bootstrapAdminKey(statePath, { label = 'admin' } = {}) {
  const state = loadTokenUsageState(statePath);
  const existing = state.principals.find((item) => item.role === 'admin' && item.label === label && !item.revokedAt);
  if (existing) return existing;
  const principal = {
    principalId: `admin:${label}`,
    role: 'admin',
    label,
    apiKey: generateApiKey('vbu_admin'),
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };
  state.principals.push(principal);
  saveTokenUsageState(statePath, state);
  return principal;
}

export function issueMemberKeyAsAdmin(
  statePath,
  { adminApiKey, memberId, memberName, team }
) {
  const state = loadTokenUsageState(statePath);
  const admin = findPrincipalByApiKey(state, adminApiKey);
  if (!admin || admin.role !== 'admin') {
    throw new Error('ADMIN_AUTH_REQUIRED');
  }

  state.principals = state.principals.filter(
    (item) => !(item.role === 'member' && item.memberId === memberId && !item.revokedAt)
  );

  const principal = {
    principalId: `member:${memberId}`,
    role: 'member',
    memberId,
    memberName,
    team,
    apiKey: generateApiKey('vbu_member'),
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };

  state.principals.push(principal);
  saveTokenUsageState(statePath, state);
  return principal;
}

async function getRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2) + '\n';
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Connection': 'close',
    ...extraHeaders,
  });
  res.end(body);
}

function sendHtml(res, statusCode, html, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Connection': 'close',
    ...extraHeaders,
  });
  res.end(html);
}

function unauthorizedJson(res) {
  sendJson(res, 401, { error: 'UNAUTHORIZED' });
}

function forbiddenJson(res) {
  sendJson(res, 403, { error: 'FORBIDDEN' });
}

function buildUploadRecord(principal, report) {
  const rawHash = createHash('sha256').update(JSON.stringify(report)).digest('hex');
  return {
    uploadId: `upload_${randomBytes(12).toString('hex')}`,
    memberId: principal.memberId,
    memberName: principal.memberName,
    team: principal.team,
    uploadedAt: new Date().toISOString(),
    hostname: report.hostname || 'unknown',
    reportGeneratedAt: report.generatedAt || null,
    totalTokens: safeNumber(report.summary?.totalTokens),
    rawHash,
  };
}

function buildSetupHtml(basePath) {
  const loginHref = withBasePath(basePath, '/login');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Token Usage Upload Setup</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 24px; color: #111827; }
      .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin: 16px 0; }
      code, pre { white-space: pre-wrap; word-break: break-word; }
    </style>
  </head>
  <body>
    <h1>Token Usage Upload Setup</h1>
    <div class="card">
      <p>Ask your admin for a member key and the private member prompt.</p>
      <p>This public repository does not ship real domains, ports, prompts, or secrets.</p>
      <p><a href="${esc(loginHref)}">Open login</a></p>
    </div>
    <div class="card">
      <h2>Public-repo-ready flow</h2>
      <pre><code>1. Clone the public repo
2. Receive a member key out-of-band
3. Initialize the client locally
4. Upload your local token usage report
5. Use the member page to view only your own data</code></pre>
    </div>
  </body>
</html>`;
}

function buildLoginHtml(basePath) {
  const setupHref = withBasePath(basePath, '/setup');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Token Usage Login</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 24px; color: #111827; }
      form { display: grid; gap: 12px; max-width: 520px; }
      input { padding: 10px 12px; font-size: 14px; }
      button { padding: 10px 12px; font-size: 14px; }
    </style>
  </head>
  <body>
    <h1>Token Usage Login</h1>
    <p><a href="${esc(setupHref)}">Back to setup</a></p>
    <form method="post" action="${esc(withBasePath(basePath, '/api/login'))}">
      <label>
        API key
        <input name="apiKey" placeholder="Paste your member or admin key" />
      </label>
      <button type="submit">Login</button>
    </form>
  </body>
</html>`;
}

function buildMemberPage(basePath, principal, latest) {
  const summary = latest?.report?.summary || {};
  const dailyRows = (latest?.report?.dailyUsage || []).slice(-14).map((row) => `
    <tr>
      <td>${esc(row.date)}</td>
      <td>${esc(row.accountedTotalTokens)}</td>
      <td>${esc(row.sessionsStarted)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(principal.memberName)} · My Token Usage</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 24px; color: #111827; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
      .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
      .metric { font-size: 28px; font-weight: 700; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
    </style>
  </head>
  <body>
    <h1>${esc(principal.memberName)} · My Token Usage</h1>
    <p>Role: member | Team: ${esc(principal.team)}</p>
    <div class="grid">
      <div class="card"><div>Total tokens</div><div class="metric">${esc(formatNumber(summary.totalTokens || 0))}</div></div>
      <div class="card"><div>Total sessions</div><div class="metric">${esc(formatNumber(summary.totalSessions || 0))}</div></div>
      <div class="card"><div>Total buckets</div><div class="metric">${esc(formatNumber(summary.totalBuckets || 0))}</div></div>
      <div class="card"><div>Cached tokens</div><div class="metric">${esc(formatNumber(summary.cachedInputTokens || 0))}</div></div>
    </div>
    <div class="card">
      <h2>Recent daily usage</h2>
      <table>
        <thead><tr><th>Date</th><th>Tokens</th><th>Sessions Started</th></tr></thead>
        <tbody>${dailyRows || '<tr><td colspan="3">No data uploaded yet.</td></tr>'}</tbody>
      </table>
    </div>
  </body>
</html>`;
}

function buildAdminDashboardPage(basePath, aggregated) {
  const memberRows = aggregated.byMember.map((row) => `
    <tr>
      <td>${esc(row.memberName)}</td>
      <td>${esc(row.team)}</td>
      <td>${esc(row.hostname)}</td>
      <td>${esc(formatNumber(row.totalTokens))}</td>
      <td>${esc(formatNumber(row.totalSessions))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(aggregated.teamName)} · Admin Dashboard</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 24px; color: #111827; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
      .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
      .metric { font-size: 28px; font-weight: 700; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
    </style>
  </head>
  <body>
    <h1>${esc(aggregated.teamName)} · Admin Dashboard</h1>
    <p><a href="${esc(withBasePath(basePath, '/setup'))}">Open setup</a></p>
    <div class="grid">
      <div class="card"><div>Members</div><div class="metric">${esc(formatNumber(aggregated.summary.totalMembers))}</div></div>
      <div class="card"><div>Total tokens</div><div class="metric">${esc(formatNumber(aggregated.summary.totalTokens))}</div></div>
      <div class="card"><div>Total sessions</div><div class="metric">${esc(formatNumber(aggregated.summary.totalSessions))}</div></div>
      <div class="card"><div>Sources</div><div class="metric">${esc(formatNumber(aggregated.summary.sourceCount))}</div></div>
    </div>
    <div class="card">
      <h2>Members</h2>
      <table>
        <thead><tr><th>Name</th><th>Team</th><th>Hostname</th><th>Total tokens</th><th>Sessions</th></tr></thead>
        <tbody>${memberRows || '<tr><td colspan="5">No uploaded reports yet.</td></tr>'}</tbody>
      </table>
    </div>
  </body>
</html>`;
}

export function createTokenUsageServer({ statePath, teamName = 'AI Usage Upload Service', basePath = '/ai-usage' }) {
  const resolvedStatePath = normalizePath(statePath);
  const normalizedBasePath = normalizeBasePath(basePath);

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    const state = loadTokenUsageState(resolvedStatePath);
    const principal = getPrincipalFromRequest(state, req);

    try {
      if (req.method === 'GET' && pathname === '/healthz') {
        sendJson(res, 200, { ok: true, service: 'token-usage-service' });
        return;
      }

      if (req.method === 'GET' && pathname === withBasePath(normalizedBasePath, '/setup')) {
        sendHtml(res, 200, buildSetupHtml(normalizedBasePath));
        return;
      }

      if (req.method === 'GET' && pathname === withBasePath(normalizedBasePath, '/login')) {
        sendHtml(res, 200, buildLoginHtml(normalizedBasePath));
        return;
      }

      if (req.method === 'POST' && pathname === withBasePath(normalizedBasePath, '/api/login')) {
        let apiKey = null;
        const contentType = req.headers['content-type'] || '';
        if (String(contentType).includes('application/json')) {
          const body = await getRequestBody(req);
          apiKey = body.apiKey;
        } else {
          const raw = await getRequestBody(req);
          apiKey = raw.apiKey;
        }

        const loginPrincipal = apiKey ? findPrincipalByApiKey(state, String(apiKey).trim()) : null;
        if (!loginPrincipal) {
          unauthorizedJson(res);
          return;
        }

        const session = {
          sessionToken: createSessionToken(),
          principalId: loginPrincipal.principalId,
          createdAt: new Date().toISOString(),
          revokedAt: null,
        };
        state.sessions.push(session);
        saveTokenUsageState(resolvedStatePath, state);

        sendJson(
          res,
          200,
          { ok: true, role: loginPrincipal.role, principal: principalView(loginPrincipal) },
          { 'Set-Cookie': `aiu_session=${session.sessionToken}; Path=/; HttpOnly; SameSite=Lax` }
        );
        return;
      }

      if (req.method === 'GET' && pathname === withBasePath(normalizedBasePath, '/me')) {
        if (!principal) {
          unauthorizedJson(res);
          return;
        }
        if (principal.role !== 'member') {
          forbiddenJson(res);
          return;
        }
        sendHtml(res, 200, buildMemberPage(normalizedBasePath, principal, state.latestReports[principal.memberId]));
        return;
      }

      if (req.method === 'GET' && pathname === withBasePath(normalizedBasePath, '/api/me')) {
        if (!principal) {
          unauthorizedJson(res);
          return;
        }
        if (principal.role !== 'member') {
          forbiddenJson(res);
          return;
        }
        sendJson(res, 200, {
          member: principalView(principal),
          report: state.latestReports[principal.memberId]?.report || null,
          uploadedAt: state.latestReports[principal.memberId]?.uploadedAt || null,
        });
        return;
      }

      if (req.method === 'GET' && pathname === withBasePath(normalizedBasePath, '/admin/dashboard')) {
        if (!principal) {
          unauthorizedJson(res);
          return;
        }
        if (principal.role !== 'admin') {
          forbiddenJson(res);
          return;
        }
        const aggregated = aggregateLatestTokenReports(state.latestReports, { teamName });
        sendHtml(res, 200, buildAdminDashboardPage(normalizedBasePath, aggregated));
        return;
      }

      if (req.method === 'GET' && pathname === withBasePath(normalizedBasePath, '/api/admin/dashboard')) {
        if (!principal) {
          unauthorizedJson(res);
          return;
        }
        if (principal.role !== 'admin') {
          forbiddenJson(res);
          return;
        }
        const aggregated = aggregateLatestTokenReports(state.latestReports, { teamName });
        sendJson(res, 200, aggregated);
        return;
      }

      if (req.method === 'POST' && pathname === withBasePath(normalizedBasePath, '/api/admin/issue-member-key')) {
        if (!principal) {
          unauthorizedJson(res);
          return;
        }
        if (principal.role !== 'admin') {
          forbiddenJson(res);
          return;
        }
        const body = await getRequestBody(req);
        const member = issueMemberKeyAsAdmin(resolvedStatePath, {
          adminApiKey: principal.apiKey,
          memberId: body.memberId,
          memberName: body.memberName,
          team: body.team,
        });
        sendJson(res, 200, { ok: true, member: principalView(member) });
        return;
      }

      if (req.method === 'POST' && pathname === withBasePath(normalizedBasePath, '/api/upload')) {
        if (!principal) {
          unauthorizedJson(res);
          return;
        }
        if (principal.role !== 'member') {
          forbiddenJson(res);
          return;
        }
        const body = await getRequestBody(req);
        const report = body.report;
        if (!report || typeof report !== 'object' || !report.summary) {
          sendJson(res, 400, { error: 'INVALID_REPORT_PAYLOAD' });
          return;
        }

        const record = buildUploadRecord(principal, report);
        state.latestReports[principal.memberId] = {
          memberId: principal.memberId,
          memberName: principal.memberName,
          team: principal.team,
          uploadedAt: record.uploadedAt,
          report,
        };
        state.uploads.push(record);
        saveTokenUsageState(resolvedStatePath, state);

        const aggregated = aggregateLatestTokenReports(state.latestReports, { teamName });
        sendJson(res, 200, {
          ok: true,
          uploadedAt: record.uploadedAt,
          member: principalView(principal),
          reportSummary: report.summary,
          summary: aggregated.summary,
        });
        return;
      }

      sendJson(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      sendJson(res, 500, { error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
  });

  server.keepAliveTimeout = 1;
  server.headersTimeout = 2000;
  return server;
}
