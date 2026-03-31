import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${fieldName}: expected non-empty string`);
  }
  return value.trim();
}

function safeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(safeNumber(value));
}

function formatHours(seconds) {
  return ((safeNumber(seconds)) / 3600).toFixed(1);
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function readCsvRecords(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = cells[headerIndex] || '';
    });
    record.__row = rowIndex + 2;
    return record;
  });
}

function normalizeManifestEntry(raw, baseDir) {
  const memberId = requiredString(raw.member_id || raw.memberId, 'member_id');
  const memberName = requiredString(raw.member_name || raw.memberName, 'member_name');
  const team = requiredString(raw.team || 'default', 'team');
  const reportPathValue = requiredString(raw.report_path || raw.reportPath, 'report_path');

  return {
    memberId,
    memberName,
    team,
    reportPath: resolve(baseDir, reportPathValue),
  };
}

export function loadMemberManifest(manifestPath) {
  const resolvedPath = resolve(manifestPath);
  const manifestDir = dirname(resolvedPath);
  const extension = extname(resolvedPath).toLowerCase();
  const rawText = readFileSync(resolvedPath, 'utf8');

  let entries;
  if (extension === '.json') {
    const parsed = JSON.parse(rawText);
    const rawEntries = Array.isArray(parsed) ? parsed : (parsed.members || []);
    entries = rawEntries.map((item) => normalizeManifestEntry(item, manifestDir));
  } else {
    entries = readCsvRecords(rawText).map((item) => normalizeManifestEntry(item, manifestDir));
  }

  if (entries.length === 0) {
    throw new Error(`Manifest has no members: ${resolvedPath}`);
  }

  const seenIds = new Set();
  for (const entry of entries) {
    if (seenIds.has(entry.memberId)) {
      throw new Error(`Duplicate member_id in manifest: ${entry.memberId}`);
    }
    seenIds.add(entry.memberId);
  }

  return {
    manifestPath: resolvedPath,
    members: entries,
  };
}

export function loadMemberReports(manifest) {
  return manifest.members.map((member) => {
    const report = JSON.parse(readFileSync(member.reportPath, 'utf8'));
    if (!report || typeof report !== 'object' || !report.summary) {
      throw new Error(`Invalid local usage report: ${member.reportPath}`);
    }
    return {
      ...member,
      report,
    };
  });
}

function createSourceUsageRow(source) {
  return {
    source,
    memberCount: 0,
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalBuckets: 0,
    totalSessions: 0,
    totalActiveSeconds: 0,
    totalDurationSeconds: 0,
    totalMessageCount: 0,
  };
}

function createDailyUsageRow(date) {
  return {
    date,
    memberCount: 0,
    buckets: 0,
    sessionsStarted: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    legacyTotalTokens: 0,
    accountedTotalTokens: 0,
  };
}

function sortDesc(list, key) {
  return [...list].sort((a, b) => safeNumber(b[key]) - safeNumber(a[key]));
}

function sortAsc(list, key) {
  return [...list].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function aggregateTeamReports(memberReports, options = {}) {
  const teamName = options.teamName || 'Internal Team Usage';
  const generatedAt = options.generatedAt || new Date().toISOString();
  const timezoneSet = new Set();
  const modeSet = new Set();
  const vendorRepos = new Set();
  const vendorCommits = new Set();
  const tokenTaxonomySet = new Set();

  const byMember = [];
  const sourceUsageMap = new Map();
  const dailyUsageMap = new Map();
  const flattenedErrors = [];

  const summary = {
    teamName,
    totalMembers: memberReports.length,
    totalReports: memberReports.length,
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    legacyTotalTokensExcludingCachedInput: 0,
    totalBuckets: 0,
    totalSessions: 0,
    totalActiveSeconds: 0,
    totalDurationSeconds: 0,
    parserSuccessCount: 0,
    parserErrorCount: 0,
    memberErrorCount: 0,
    networkRequestsMade: false,
    dailyRowCount: 0,
    sourceCount: 0,
  };

  for (const member of memberReports) {
    const report = member.report;
    const reportSummary = report.summary || {};
    timezoneSet.add(report.timezone || 'unknown');
    modeSet.add(report.mode || 'unknown');
    if (report.vendor?.repo) vendorRepos.add(report.vendor.repo);
    if (report.vendor?.commit) vendorCommits.add(report.vendor.commit);
    if (report.tokenTaxonomy) tokenTaxonomySet.add(JSON.stringify(report.tokenTaxonomy));
    summary.networkRequestsMade = summary.networkRequestsMade || Boolean(report.networkRequestsMade);

    summary.totalTokens += safeNumber(reportSummary.totalTokens);
    summary.inputTokens += safeNumber(reportSummary.inputTokens);
    summary.cachedInputTokens += safeNumber(reportSummary.cachedInputTokens);
    summary.outputTokens += safeNumber(reportSummary.outputTokens);
    summary.reasoningOutputTokens += safeNumber(reportSummary.reasoningOutputTokens);
    summary.legacyTotalTokensExcludingCachedInput += safeNumber(reportSummary.legacyTotalTokensExcludingCachedInput);
    summary.totalBuckets += safeNumber(reportSummary.totalBuckets);
    summary.totalSessions += safeNumber(reportSummary.totalSessions);
    summary.totalActiveSeconds += safeNumber(reportSummary.totalActiveSeconds);
    summary.totalDurationSeconds += safeNumber(reportSummary.totalDurationSeconds);
    summary.parserSuccessCount += safeNumber(reportSummary.parserSuccessCount);
    summary.parserErrorCount += safeNumber(reportSummary.parserErrorCount);
    summary.memberErrorCount += Array.isArray(report.errors) ? report.errors.length : 0;

    byMember.push({
      memberId: member.memberId,
      memberName: member.memberName,
      team: member.team,
      hostname: report.hostname || 'unknown',
      generatedAt: report.generatedAt || 'unknown',
      totalTokens: safeNumber(reportSummary.totalTokens),
      inputTokens: safeNumber(reportSummary.inputTokens),
      cachedInputTokens: safeNumber(reportSummary.cachedInputTokens),
      outputTokens: safeNumber(reportSummary.outputTokens),
      reasoningOutputTokens: safeNumber(reportSummary.reasoningOutputTokens),
      totalBuckets: safeNumber(reportSummary.totalBuckets),
      totalSessions: safeNumber(reportSummary.totalSessions),
      totalActiveSeconds: safeNumber(reportSummary.totalActiveSeconds),
      totalDurationSeconds: safeNumber(reportSummary.totalDurationSeconds),
      parserSuccessCount: safeNumber(reportSummary.parserSuccessCount),
      parserErrorCount: safeNumber(reportSummary.parserErrorCount),
      reportPath: member.reportPath,
    });

    const sourceSeenInMember = new Set();
    for (const parserReport of report.parserReports || []) {
      const source = parserReport.source || 'unknown';
      if (!sourceUsageMap.has(source)) sourceUsageMap.set(source, createSourceUsageRow(source));
      const row = sourceUsageMap.get(source);
      row.totalTokens += safeNumber(parserReport.totalTokens);
      row.inputTokens += safeNumber(parserReport.inputTokens);
      row.cachedInputTokens += safeNumber(parserReport.cachedInputTokens);
      row.outputTokens += safeNumber(parserReport.outputTokens);
      row.reasoningOutputTokens += safeNumber(parserReport.reasoningOutputTokens);
      row.totalBuckets += safeNumber(parserReport.buckets);
      row.totalSessions += safeNumber(parserReport.sessions);
      if (!sourceSeenInMember.has(source)) {
        row.memberCount += 1;
        sourceSeenInMember.add(source);
      }
    }

    for (const sessionSource of report.sessionSources || []) {
      const source = sessionSource.source || 'unknown';
      if (!sourceUsageMap.has(source)) sourceUsageMap.set(source, createSourceUsageRow(source));
      const row = sourceUsageMap.get(source);
      row.totalActiveSeconds += safeNumber(sessionSource.activeSeconds);
      row.totalDurationSeconds += safeNumber(sessionSource.durationSeconds);
      row.totalMessageCount += safeNumber(sessionSource.messageCount);
      if (!sourceSeenInMember.has(source)) {
        row.memberCount += 1;
        sourceSeenInMember.add(source);
      }
    }

    for (const dailyRow of report.dailyUsage || []) {
      const date = requiredString(dailyRow.date, 'dailyUsage.date');
      if (!dailyUsageMap.has(date)) dailyUsageMap.set(date, createDailyUsageRow(date));
      const row = dailyUsageMap.get(date);
      row.buckets += safeNumber(dailyRow.buckets);
      row.sessionsStarted += safeNumber(dailyRow.sessionsStarted);
      row.inputTokens += safeNumber(dailyRow.inputTokens);
      row.cachedInputTokens += safeNumber(dailyRow.cachedInputTokens);
      row.outputTokens += safeNumber(dailyRow.outputTokens);
      row.reasoningOutputTokens += safeNumber(dailyRow.reasoningOutputTokens);
      row.legacyTotalTokens += safeNumber(dailyRow.legacyTotalTokens);
      row.accountedTotalTokens += safeNumber(dailyRow.accountedTotalTokens);
      if (
        safeNumber(dailyRow.accountedTotalTokens) > 0 ||
        safeNumber(dailyRow.sessionsStarted) > 0 ||
        safeNumber(dailyRow.buckets) > 0
      ) {
        row.memberCount += 1;
      }
    }

    for (const errorItem of report.errors || []) {
      flattenedErrors.push({
        memberId: member.memberId,
        memberName: member.memberName,
        team: member.team,
        source: errorItem.source || 'unknown',
        error: errorItem.error || 'unknown',
      });
    }
  }

  const sourceUsage = sortDesc(Array.from(sourceUsageMap.values()), 'totalTokens');
  const dailyUsage = sortAsc(Array.from(dailyUsageMap.values()), 'date');
  summary.dailyRowCount = dailyUsage.length;
  summary.sourceCount = sourceUsage.length;

  return {
    generatedAt,
    teamName,
    mode: 'team-aggregated-local-usage-report',
    timezone: timezoneSet.size === 1 ? Array.from(timezoneSet)[0] : 'mixed',
    sourceReportMode: modeSet.size === 1 ? Array.from(modeSet)[0] : 'mixed',
    networkRequestsMade: summary.networkRequestsMade,
    vendor: {
      repos: Array.from(vendorRepos).sort(),
      commits: Array.from(vendorCommits).sort(),
    },
    tokenTaxonomy:
      tokenTaxonomySet.size === 1
        ? JSON.parse(Array.from(tokenTaxonomySet)[0])
        : {
            principle: 'mixed-source-taxonomy',
            note: 'Input reports did not expose a single identical token taxonomy block.',
          },
    summary,
    byMember: sortDesc(byMember, 'totalTokens'),
    sourceUsage,
    dailyUsage,
    errors: flattenedErrors,
    notes: {
      projectAggregationAvailable: false,
      reason:
        'Current local_usage_report.json only exposes truncated topProjects, so this team MVP does not aggregate project totals to avoid misleading partial sums.',
    },
  };
}

function buildMemberCsv(report) {
  const header = [
    'member_id',
    'member_name',
    'team',
    'hostname',
    'generated_at',
    'total_tokens',
    'input_tokens',
    'cached_input_tokens',
    'output_tokens',
    'reasoning_output_tokens',
    'total_buckets',
    'total_sessions',
    'total_active_seconds',
    'total_duration_seconds',
    'parser_success_count',
    'parser_error_count',
    'report_path',
  ];

  const lines = [
    header.join(','),
    ...report.byMember.map((row) => [
      row.memberId,
      row.memberName,
      row.team,
      row.hostname,
      row.generatedAt,
      row.totalTokens,
      row.inputTokens,
      row.cachedInputTokens,
      row.outputTokens,
      row.reasoningOutputTokens,
      row.totalBuckets,
      row.totalSessions,
      row.totalActiveSeconds,
      row.totalDurationSeconds,
      row.parserSuccessCount,
      row.parserErrorCount,
      row.reportPath,
    ].map(csvEscape).join(',')),
  ];

  return lines.join('\n') + '\n';
}

function buildSourceCsv(report) {
  const header = [
    'source',
    'member_count',
    'total_tokens',
    'input_tokens',
    'cached_input_tokens',
    'output_tokens',
    'reasoning_output_tokens',
    'total_buckets',
    'total_sessions',
    'total_active_seconds',
    'total_duration_seconds',
    'total_message_count',
  ];

  const lines = [
    header.join(','),
    ...report.sourceUsage.map((row) => [
      row.source,
      row.memberCount,
      row.totalTokens,
      row.inputTokens,
      row.cachedInputTokens,
      row.outputTokens,
      row.reasoningOutputTokens,
      row.totalBuckets,
      row.totalSessions,
      row.totalActiveSeconds,
      row.totalDurationSeconds,
      row.totalMessageCount,
    ].map(csvEscape).join(',')),
  ];

  return lines.join('\n') + '\n';
}

function buildDailyCsv(report) {
  const header = [
    'date',
    'member_count',
    'buckets',
    'sessions_started',
    'input_tokens',
    'cached_input_tokens',
    'output_tokens',
    'reasoning_output_tokens',
    'accounted_total_tokens',
    'legacy_total_tokens',
  ];

  const lines = [
    header.join(','),
    ...report.dailyUsage.map((row) => [
      row.date,
      row.memberCount,
      row.buckets,
      row.sessionsStarted,
      row.inputTokens,
      row.cachedInputTokens,
      row.outputTokens,
      row.reasoningOutputTokens,
      row.accountedTotalTokens,
      row.legacyTotalTokens,
    ].map(csvEscape).join(',')),
  ];

  return lines.join('\n') + '\n';
}

function buildSummaryMarkdown(report) {
  const lines = [
    '# 团队内部 Usage 统计',
    '',
    `- 团队名: ${report.teamName}`,
    `- 生成时间: ${report.generatedAt}`,
    `- 时区: ${report.timezone}`,
    `- 成员数: ${formatNumber(report.summary.totalMembers)}`,
    `- 报告数: ${formatNumber(report.summary.totalReports)}`,
    `- 是否发起网络请求: ${report.networkRequestsMade ? 'true' : 'false'}`,
    '',
    '## 总览',
    `- 总 tokens（MECE）: ${formatNumber(report.summary.totalTokens)}`,
    `- input_non_cached_tokens: ${formatNumber(report.summary.inputTokens)}`,
    `- cached_input_read_tokens: ${formatNumber(report.summary.cachedInputTokens)}`,
    `- output_non_reasoning_tokens: ${formatNumber(report.summary.outputTokens)}`,
    `- reasoning_output_tokens: ${formatNumber(report.summary.reasoningOutputTokens)}`,
    `- 总 buckets: ${formatNumber(report.summary.totalBuckets)}`,
    `- 总 sessions: ${formatNumber(report.summary.totalSessions)}`,
    `- 总活跃时长（小时）: ${formatHours(report.summary.totalActiveSeconds)}`,
    `- 总会话跨度（小时）: ${formatHours(report.summary.totalDurationSeconds)}`,
    `- 来源数: ${formatNumber(report.summary.sourceCount)}`,
    `- 按天记录行数: ${formatNumber(report.summary.dailyRowCount)}`,
    '',
    '## 成员 Top 10',
    ...report.byMember.slice(0, 10).map((row) =>
      `- ${row.memberName} (${row.team}): ${formatNumber(row.totalTokens)} tokens，hostname=${row.hostname}`
    ),
    '',
    '## 来源 Top 10',
    ...report.sourceUsage.slice(0, 10).map((row) =>
      `- ${row.source}: ${formatNumber(row.totalTokens)} tokens，成员覆盖 ${formatNumber(row.memberCount)}`
    ),
    '',
    '## 近14天团队趋势',
    ...report.dailyUsage.slice(-14).map((row) =>
      `- ${row.date}: 总 ${formatNumber(row.accountedTotalTokens)} tokens，活跃成员 ${formatNumber(row.memberCount)}，sessions_started ${formatNumber(row.sessionsStarted)}`
    ),
    '',
    '## 当前边界',
    `- 项目聚合: ${report.notes.projectAggregationAvailable ? 'available' : 'not available yet'}`,
    `- 说明: ${report.notes.reason}`,
    '',
    '## 错误',
    ...(report.errors.length > 0
      ? report.errors.map((row) => `- ${row.memberName} / ${row.source}: ${row.error}`)
      : ['- 无']),
    '',
  ];

  return lines.join('\n');
}

function buildDashboardHtml(report) {
  const esc = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const memberRows = report.byMember.slice(0, 20).map((row) => `
    <tr>
      <td>${esc(row.memberName)}</td>
      <td>${esc(row.team)}</td>
      <td>${esc(row.hostname)}</td>
      <td>${esc(formatNumber(row.totalTokens))}</td>
      <td>${esc(formatNumber(row.cachedInputTokens))}</td>
      <td>${esc(formatNumber(row.totalSessions))}</td>
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
  <title>${esc(report.teamName)} Usage Dashboard</title>
  <style>
    :root {
      --bg: #f4f7f9;
      --card: #ffffff;
      --ink: #12344d;
      --muted: #5b7385;
      --line: #d7e3ef;
      --accent: #1565c0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      color: var(--ink);
      background: linear-gradient(180deg, #eef5f8 0%, #f8fbfd 100%);
    }
    .wrap { max-width: 1280px; margin: 0 auto; display: grid; gap: 18px; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px 20px;
      box-shadow: 0 10px 26px rgba(18, 52, 77, 0.06);
    }
    h1, h2 { margin: 0 0 12px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 12px;
    }
    .tile {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px 14px;
      background: #fbfdff;
    }
    .label { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .value { font-size: 24px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid var(--line); padding: 8px 10px; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    th:nth-child(2), td:nth-child(2), th:nth-child(3), td:nth-child(3) { text-align: left; }
    .small { color: var(--muted); font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>团队内部 Usage 统计</h1>
      <div class="small">团队名：${esc(report.teamName)} | 生成时间：${esc(report.generatedAt)} | 时区：${esc(report.timezone)}</div>
    </section>
    <section class="card">
      <h2>总览</h2>
      <div class="grid">
        <div class="tile"><div class="label">总成员数</div><div class="value">${esc(formatNumber(report.summary.totalMembers))}</div></div>
        <div class="tile"><div class="label">总 tokens</div><div class="value">${esc(formatNumber(report.summary.totalTokens))}</div></div>
        <div class="tile"><div class="label">总 sessions</div><div class="value">${esc(formatNumber(report.summary.totalSessions))}</div></div>
        <div class="tile"><div class="label">来源数</div><div class="value">${esc(formatNumber(report.summary.sourceCount))}</div></div>
      </div>
      <div class="grid" style="margin-top: 12px;">
        <div class="tile"><div class="label">Input</div><div class="value">${esc(formatNumber(report.summary.inputTokens))}</div></div>
        <div class="tile"><div class="label">Cached</div><div class="value">${esc(formatNumber(report.summary.cachedInputTokens))}</div></div>
        <div class="tile"><div class="label">Output</div><div class="value">${esc(formatNumber(report.summary.outputTokens))}</div></div>
        <div class="tile"><div class="label">Reasoning</div><div class="value">${esc(formatNumber(report.summary.reasoningOutputTokens))}</div></div>
      </div>
    </section>
    <section class="card">
      <h2>成员榜单</h2>
      <table>
        <thead>
          <tr><th>成员</th><th>团队</th><th>主机名</th><th>总 tokens</th><th>Cached</th><th>Sessions</th></tr>
        </thead>
        <tbody>${memberRows}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>来源汇总</h2>
      <table>
        <thead>
          <tr><th>来源</th><th>覆盖成员</th><th>总 tokens</th><th>Cached</th><th>Sessions</th></tr>
        </thead>
        <tbody>${sourceRows}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>近 21 天团队趋势</h2>
      <table>
        <thead>
          <tr><th>日期</th><th>活跃成员</th><th>总 tokens</th><th>Cached</th><th>Sessions Started</th></tr>
        </thead>
        <tbody>${dailyRows}</tbody>
      </table>
      <p class="small">当前 MVP 不做项目聚合，因为现有个人版 local_usage_report.json 只暴露截断后的 topProjects，直接相加会产生误导性的部分和。</p>
    </section>
  </div>
</body>
</html>
`;
}

export function writeTeamReportOutputs(report, outputDir) {
  const resolvedOutputDir = resolve(outputDir);
  mkdirSync(resolvedOutputDir, { recursive: true });

  writeFileSync(join(resolvedOutputDir, 'team_usage_report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  writeFileSync(join(resolvedOutputDir, 'member_summary.csv'), buildMemberCsv(report), 'utf8');
  writeFileSync(join(resolvedOutputDir, 'source_usage.csv'), buildSourceCsv(report), 'utf8');
  writeFileSync(join(resolvedOutputDir, 'team_daily_usage.csv'), buildDailyCsv(report), 'utf8');
  writeFileSync(join(resolvedOutputDir, 'summary.md'), buildSummaryMarkdown(report), 'utf8');
  writeFileSync(join(resolvedOutputDir, 'dashboard.html'), buildDashboardHtml(report), 'utf8');
}
