#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = dirname(__filename);
const VENDOR_DIR = join(PROJECT_ROOT, '__sys', 'vendor', 'vibe-usage');
const REPORT_TIMEZONE = 'Asia/Shanghai';
const CACHED_VISUAL_CAP_SHARE = 0.72;
const MIN_CATEGORY_SEGMENT_PX = 6;

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function sortDesc(list, key) {
  return [...list].sort((a, b) => (b[key] || 0) - (a[key] || 0));
}

function sortAsc(list, key) {
  return [...list].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function formatCompact(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatHours(seconds) {
  return ((seconds || 0) / 3600).toFixed(1);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function shanghaiDate(value) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function shortDate(dateStr) {
  return dateStr.slice(5);
}

function getVisualStack(row, cachedCapShare = CACHED_VISUAL_CAP_SHARE) {
  const total = row.accountedTotalTokens || 0;
  const raw = {
    inputTokens: row.inputTokens || 0,
    cachedInputTokens: row.cachedInputTokens || 0,
    outputTokens: row.outputTokens || 0,
    reasoningOutputTokens: row.reasoningOutputTokens || 0,
  };

  if (total <= 0) return { ...raw };

  const cachedShare = raw.cachedInputTokens / total;
  if (cachedShare <= cachedCapShare) return { ...raw };

  const nonCachedTotal = raw.inputTokens + raw.outputTokens + raw.reasoningOutputTokens;
  if (nonCachedTotal <= 0) return { ...raw };

  const remainingShare = 1 - cachedCapShare;
  return {
    inputTokens: total * remainingShare * (raw.inputTokens / nonCachedTotal),
    cachedInputTokens: total * cachedCapShare,
    outputTokens: total * remainingShare * (raw.outputTokens / nonCachedTotal),
    reasoningOutputTokens: total * remainingShare * (raw.reasoningOutputTokens / nonCachedTotal),
  };
}

function getVisualSegmentHeights(
  row,
  plotHeight,
  yMax,
  cachedCapShare = CACHED_VISUAL_CAP_SHARE,
  minSegmentPx = MIN_CATEGORY_SEGMENT_PX
) {
  const keys = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens'];
  const total = row.accountedTotalTokens || 0;
  const visual = getVisualStack(row, cachedCapShare);
  const totalHeightPx = total > 0 ? total / yMax * plotHeight : 0;
  const heights = Object.fromEntries(
    keys.map((key) => [key, total > 0 ? Math.max(0, visual[key] / yMax * plotHeight) : 0])
  );

  const nonZeroKeys = keys.filter((key) => (row[key] || 0) > 0);
  const targetedKeys = ['outputTokens', 'reasoningOutputTokens'].filter(
    (key) => (row[key] || 0) > 0 && heights[key] > 0
  );
  if (targetedKeys.length === 0 || totalHeightPx <= 0) {
    return { heights, totalHeightPx };
  }

  const effectiveMinPx = Math.min(
    minSegmentPx,
    Math.max(1.5, totalHeightPx / Math.max(nonZeroKeys.length, 1))
  );

  let neededPx = 0;
  for (const key of targetedKeys) {
    if (heights[key] < effectiveMinPx) {
      neededPx += effectiveMinPx - heights[key];
      heights[key] = effectiveMinPx;
    }
  }

  for (const donorKey of ['cachedInputTokens', 'inputTokens']) {
    if (neededPx <= 0) break;
    const floorPx = donorKey === 'cachedInputTokens' ? 0 : effectiveMinPx;
    const availablePx = Math.max(0, heights[donorKey] - floorPx);
    const takenPx = Math.min(availablePx, neededPx);
    heights[donorKey] -= takenPx;
    neededPx -= takenPx;
  }

  return { heights, totalHeightPx };
}

function chooseLabelIndices(points, targetCount = 10) {
  if (!Array.isArray(points) || points.length === 0) return new Set();
  const values = points.map((item) => item.accountedTotalTokens || 0);
  const chosen = new Set([0, points.length - 1]);

  let maxIndex = 0;
  let minIndex = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[maxIndex]) maxIndex = index;
    if (values[index] < values[minIndex]) minIndex = index;
  }
  chosen.add(maxIndex);
  chosen.add(minIndex);

  const candidates = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    const prev = values[index - 1];
    const curr = values[index];
    const next = values[index + 1];
    const isPeak = curr > prev && curr >= next;
    const isValley = curr < prev && curr <= next;
    const leftDelta = Math.abs(curr - prev);
    const rightDelta = Math.abs(curr - next);
    const prominence = leftDelta + rightDelta;
    if (isPeak || isValley) {
      candidates.push({ index, prominence, score: prominence + curr * 0.02 });
    } else {
      const jump = Math.max(leftDelta, rightDelta);
      if (jump > 0) candidates.push({ index, prominence: jump, score: jump * 0.8 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    if (chosen.size >= Math.max(targetCount, 4)) break;
    const tooClose = Array.from(chosen).some((existing) => Math.abs(existing - candidate.index) <= 1);
    if (!tooClose) chosen.add(candidate.index);
  }

  if (chosen.size < targetCount) {
    const step = Math.max(1, Math.floor(points.length / targetCount));
    for (let index = 0; index < points.length; index += step) {
      chosen.add(index);
      if (chosen.size >= targetCount) break;
    }
  }

  return chosen;
}

function emptyTokenBreakdown() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    legacyTotalTokens: 0,
    accountedTotalTokens: 0,
  };
}

function normalizeBucket(bucket) {
  const normalized = {
    ...bucket,
    inputTokens: Math.max(0, bucket.inputTokens || 0),
    cachedInputTokens: Math.max(0, bucket.cachedInputTokens || 0),
    outputTokens: Math.max(0, bucket.outputTokens || 0),
    reasoningOutputTokens: Math.max(0, bucket.reasoningOutputTokens || 0),
  };
  normalized.totalTokens =
    normalized.inputTokens +
    normalized.outputTokens +
    normalized.reasoningOutputTokens;
  return normalized;
}

function addBucketToBreakdown(target, bucket) {
  target.inputTokens += bucket.inputTokens || 0;
  target.cachedInputTokens += bucket.cachedInputTokens || 0;
  target.outputTokens += bucket.outputTokens || 0;
  target.reasoningOutputTokens += bucket.reasoningOutputTokens || 0;
  target.legacyTotalTokens += bucket.totalTokens || 0;
  target.accountedTotalTokens +=
    (bucket.inputTokens || 0) +
    (bucket.cachedInputTokens || 0) +
    (bucket.outputTokens || 0) +
    (bucket.reasoningOutputTokens || 0);
}

function sumSessionField(sessions, field) {
  return sessions.reduce((sum, session) => sum + (session[field] || 0), 0);
}

function getVendorCommit() {
  try {
    return execFileSync('git', ['-C', VENDOR_DIR, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function buildDailyTrendSvg(rows) {
  const points = rows.slice(-14);
  const width = 1180;
  const height = 380;
  const left = 72;
  const right = 28;
  const top = 34;
  const bottom = 82;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = points.map((item) => item.accountedTotalTokens);
  const maxValue = Math.max(...values, 1);
  const yMax = maxValue * 1.12;
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const yFor = (value) => top + plotHeight - value / yMax * plotHeight;
  const xFor = (index) => left + stepX * index;
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(yMax * ratio));

  const grid = gridValues.map((value) => {
    const y = yFor(value);
    return `
      <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#d7e3ef" stroke-width="1" />
      <text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#476072">${escapeXml(formatCompact(value))}</text>
    `;
  }).join('');

  const polyline = points.map((item, index) => `${xFor(index)},${yFor(item.accountedTotalTokens)}`).join(' ');

  const dateLabelIndices = chooseLabelIndices(points, Math.min(10, points.length));
  const dots = points.map((item, index) => {
    const x = xFor(index);
    const y = yFor(item.accountedTotalTokens);
    const showDateLabel = dateLabelIndices.has(index);
    return `
      <circle cx="${x}" cy="${y}" r="4.5" fill="#1565c0" />
      <text x="${x}" y="${y - 10}" text-anchor="middle" font-size="11" fill="#0d3557">${escapeXml(formatCompact(item.accountedTotalTokens))}</text>
      ${showDateLabel ? `<text x="${x}" y="${height - bottom + 22}" text-anchor="middle" font-size="11" fill="#476072">${escapeXml(shortDate(item.date))}</text>` : ''}
    `;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f8fbfd" rx="18" />
  <text x="${left}" y="24" font-size="18" font-weight="700" fill="#12344d">近14天按日总 tokens 趋势</text>
  <text x="${left}" y="46" font-size="12" fill="#5b7385">口径：input + cached_input_read + output + reasoning_output</text>
  ${grid}
  <polyline fill="none" stroke="#1565c0" stroke-width="3" points="${polyline}" />
  ${dots}
</svg>
`;
}

function buildDailyStackedSvg(rows) {
  const points = rows.slice(-14);
  const width = 1180;
  const height = 450;
  const left = 72;
  const right = 28;
  const top = 40;
  const bottom = 92;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const totals = points.map((item) => item.accountedTotalTokens);
  const maxValue = Math.max(...totals, 1);
  const yMax = maxValue * 1.12;
  const stepX = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(42, stepX * 0.58);
  const yFor = (value) => top + plotHeight - value / yMax * plotHeight;
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(yMax * ratio));
  const palette = {
    inputTokens: '#2e7d32',
    cachedInputTokens: '#00838f',
    outputTokens: '#ef6c00',
    reasoningOutputTokens: '#6a1b9a',
  };
  const labels = {
    inputTokens: 'Input',
    cachedInputTokens: 'Cached',
    outputTokens: 'Output',
    reasoningOutputTokens: 'Reasoning',
  };

  const grid = gridValues.map((value) => {
    const y = yFor(value);
    return `
      <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#d7e3ef" stroke-width="1" />
      <text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#476072">${escapeXml(formatCompact(value))}</text>
    `;
  }).join('');

  const dateLabelIndices = chooseLabelIndices(points, Math.min(10, points.length));
  const bars = points.map((item, index) => {
    const barX = left + index * stepX + (stepX - barWidth) / 2;
    let runningPx = 0;
    const { heights, totalHeightPx } = getVisualSegmentHeights(item, plotHeight, yMax);
    const segments = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens'].map((key) => {
      const segmentHeight = heights[key] || 0;
      const y = top + plotHeight - runningPx - segmentHeight;
      runningPx += segmentHeight;
      if (segmentHeight <= 0) return '';
      return `<rect x="${barX}" y="${y}" width="${barWidth}" height="${segmentHeight}" fill="${palette[key]}" rx="5" />`;
    }).join('');

    const showDateLabel = dateLabelIndices.has(index);
    return `
      ${segments}
      <text x="${barX + barWidth / 2}" y="${top + plotHeight - totalHeightPx - 10}" text-anchor="middle" font-size="11" fill="#0d3557">${escapeXml(formatCompact(item.accountedTotalTokens))}</text>
      ${showDateLabel ? `<text x="${barX + barWidth / 2}" y="${height - bottom + 22}" text-anchor="middle" font-size="11" fill="#476072">${escapeXml(shortDate(item.date))}</text>` : ''}
    `;
  }).join('');

  const legend = Object.entries(labels).map(([key, label], index) => {
    const x = left + index * 170;
    const y = height - 28;
    return `
      <rect x="${x}" y="${y - 10}" width="16" height="12" fill="${palette[key]}" rx="3" />
      <text x="${x + 24}" y="${y}" font-size="12" fill="#476072">${escapeXml(label)}</text>
    `;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f8fbfd" rx="18" />
  <text x="${left}" y="26" font-size="18" font-weight="700" fill="#12344d">近14天 MECE token 分类堆叠图</text>
  <text x="${left}" y="48" font-size="12" fill="#5b7385">柱高仍是真实总量；当 cached 超过 ${Math.round(CACHED_VISUAL_CAP_SHARE * 100)}% 时，图内仅把 cached 的视觉占比压到 ${Math.round(CACHED_VISUAL_CAP_SHARE * 100)}%。</text>
  <text x="${left}" y="66" font-size="12" fill="#5b7385">剩余空间按 input / output / reasoning 的真实比例分配。对于非零的 output / reasoning，图内额外保证至少 ${MIN_CATEGORY_SEGMENT_PX}px 的可见高度。</text>
  <text x="${left}" y="84" font-size="12" fill="#5b7385">这些调整只影响显示，不影响标签和表格数值。</text>
  ${grid}
  ${bars}
  ${legend}
</svg>
`;
}

const outputDirArg = getArg('--output-dir');
if (!outputDirArg) {
  console.error('Usage: node run_local_usage_report.mjs --output-dir <dir>');
  process.exit(1);
}

const outputDir = resolve(outputDirArg);
mkdirSync(outputDir, { recursive: true });

const { parsers } = await import(pathToFileURL(join(VENDOR_DIR, 'src', 'parsers', 'index.js')).href);

const parserReports = [];
const allBuckets = [];
const allSessions = [];
const errors = [];

for (const [source, parse] of Object.entries(parsers)) {
  try {
    const result = await parse();
    const buckets = Array.isArray(result) ? result : (result?.buckets || []);
    const sessions = Array.isArray(result) ? [] : (result?.sessions || []);
    allBuckets.push(...buckets);
    allSessions.push(...sessions);

    const tokenBreakdown = emptyTokenBreakdown();
    for (const bucket of buckets.map(normalizeBucket)) addBucketToBreakdown(tokenBreakdown, bucket);

    parserReports.push({
      source,
      buckets: buckets.length,
      sessions: sessions.length,
      inputTokens: tokenBreakdown.inputTokens,
      cachedInputTokens: tokenBreakdown.cachedInputTokens,
      outputTokens: tokenBreakdown.outputTokens,
      reasoningOutputTokens: tokenBreakdown.reasoningOutputTokens,
      totalTokens: tokenBreakdown.accountedTotalTokens,
      legacyTotalTokens: tokenBreakdown.legacyTotalTokens,
      activeSeconds: sumSessionField(sessions, 'activeSeconds'),
      durationSeconds: sumSessionField(sessions, 'durationSeconds'),
      messageCount: sumSessionField(sessions, 'messageCount'),
    });
  } catch (error) {
    errors.push({ source, error: error.message });
  }
}

const normalizedBuckets = allBuckets.map(normalizeBucket);

const overallBreakdown = emptyTokenBreakdown();
for (const bucket of normalizedBuckets) addBucketToBreakdown(overallBreakdown, bucket);

const projectMap = new Map();
for (const bucket of normalizedBuckets) {
  const key = `${bucket.source}::${bucket.project || 'unknown'}`;
  if (!projectMap.has(key)) {
    projectMap.set(key, {
      source: bucket.source,
      project: bucket.project || 'unknown',
      buckets: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      legacyTotalTokens: 0,
    });
  }
  const item = projectMap.get(key);
  item.buckets += 1;
  item.inputTokens += bucket.inputTokens || 0;
  item.cachedInputTokens += bucket.cachedInputTokens || 0;
  item.outputTokens += bucket.outputTokens || 0;
  item.reasoningOutputTokens += bucket.reasoningOutputTokens || 0;
  item.totalTokens +=
    (bucket.inputTokens || 0) +
    (bucket.cachedInputTokens || 0) +
    (bucket.outputTokens || 0) +
    (bucket.reasoningOutputTokens || 0);
  item.legacyTotalTokens += bucket.totalTokens || 0;
}

const sessionSources = new Map();
for (const session of allSessions) {
  if (!sessionSources.has(session.source)) {
    sessionSources.set(session.source, {
      source: session.source,
      sessions: 0,
      activeSeconds: 0,
      durationSeconds: 0,
      messageCount: 0,
    });
  }
  const item = sessionSources.get(session.source);
  item.sessions += 1;
  item.activeSeconds += session.activeSeconds || 0;
  item.durationSeconds += session.durationSeconds || 0;
  item.messageCount += session.messageCount || 0;
}

const dailyMap = new Map();
for (const bucket of normalizedBuckets) {
  const date = shanghaiDate(bucket.bucketStart);
  if (!dailyMap.has(date)) {
    dailyMap.set(date, {
      date,
      buckets: 0,
      sessionsStarted: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      legacyTotalTokens: 0,
      accountedTotalTokens: 0,
    });
  }
  const item = dailyMap.get(date);
  item.buckets += 1;
  item.inputTokens += bucket.inputTokens || 0;
  item.cachedInputTokens += bucket.cachedInputTokens || 0;
  item.outputTokens += bucket.outputTokens || 0;
  item.reasoningOutputTokens += bucket.reasoningOutputTokens || 0;
  item.legacyTotalTokens += bucket.totalTokens || 0;
  item.accountedTotalTokens +=
    (bucket.inputTokens || 0) +
    (bucket.cachedInputTokens || 0) +
    (bucket.outputTokens || 0) +
    (bucket.reasoningOutputTokens || 0);
}

for (const session of allSessions) {
  const date = shanghaiDate(session.firstMessageAt);
  if (!dailyMap.has(date)) {
    dailyMap.set(date, {
      date,
      buckets: 0,
      sessionsStarted: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      legacyTotalTokens: 0,
      accountedTotalTokens: 0,
    });
  }
  dailyMap.get(date).sessionsStarted += 1;
}

const dailyUsage = sortAsc(Array.from(dailyMap.values()), 'date');
const dailyCsvLines = [
  [
    'date',
    'buckets',
    'sessions_started',
    'input_tokens',
    'cached_input_read_tokens',
    'output_tokens',
    'reasoning_output_tokens',
    'accounted_total_tokens',
    'legacy_total_tokens_excluding_cached_input',
  ].join(','),
  ...dailyUsage.map((row) => [
    row.date,
    row.buckets,
    row.sessionsStarted,
    row.inputTokens,
    row.cachedInputTokens,
    row.outputTokens,
    row.reasoningOutputTokens,
    row.accountedTotalTokens,
    row.legacyTotalTokens,
  ].join(',')),
];

const report = {
  generatedAt: new Date().toISOString(),
  timezone: REPORT_TIMEZONE,
  hostname: hostname(),
  mode: 'local-only-parser-report',
  networkRequestsMade: false,
  vendor: {
    repo: 'https://github.com/vibe-cafe/vibe-usage.git',
    commit: getVendorCommit(),
  },
  tokenTaxonomy: {
    principle: 'MECE over the normalized local schema',
    categories: [
      {
        key: 'inputTokens',
        label: 'input_non_cached_tokens',
        description: 'Prompt-side input tokens after subtracting known cache reads.',
      },
      {
        key: 'cachedInputTokens',
        label: 'cached_input_read_tokens',
        description: 'Prompt-side cache-hit tokens read from cache.',
      },
      {
        key: 'outputTokens',
        label: 'output_non_reasoning_tokens',
        description: 'Visible output tokens after subtracting known reasoning tokens.',
      },
      {
        key: 'reasoningOutputTokens',
        label: 'reasoning_output_tokens',
        description: 'Hidden reasoning or thoughts tokens when the source exposes them.',
      },
    ],
    accountedTotalFormula: 'inputTokens + cachedInputTokens + outputTokens + reasoningOutputTokens',
    legacyTotalFormula: 'inputTokens + outputTokens + reasoningOutputTokens',
    caveat: 'Copilot cache write tokens do not have a dedicated field in the shared schema, so they stay inside inputTokens.',
    reportingNormalization: 'Negative category values after parser normalization are clamped to 0 in the local report layer.',
  },
  summary: {
    totalBuckets: allBuckets.length,
    totalSessions: allSessions.length,
    totalTokens: overallBreakdown.accountedTotalTokens,
    inputTokens: overallBreakdown.inputTokens,
    cachedInputTokens: overallBreakdown.cachedInputTokens,
    outputTokens: overallBreakdown.outputTokens,
    reasoningOutputTokens: overallBreakdown.reasoningOutputTokens,
    legacyTotalTokensExcludingCachedInput: overallBreakdown.legacyTotalTokens,
    totalActiveSeconds: sumSessionField(allSessions, 'activeSeconds'),
    totalDurationSeconds: sumSessionField(allSessions, 'durationSeconds'),
    parserSuccessCount: parserReports.length,
    parserErrorCount: errors.length,
    dailyRowCount: dailyUsage.length,
  },
  parserReports: sortDesc(parserReports, 'totalTokens'),
  sessionSources: sortDesc(Array.from(sessionSources.values()), 'sessions'),
  topProjects: sortDesc(Array.from(projectMap.values()), 'totalTokens').slice(0, 20),
  dailyUsage,
  errors,
};

const dailyTrendSvg = buildDailyTrendSvg(dailyUsage);
const dailyStackedSvg = buildDailyStackedSvg(dailyUsage);

const summaryLines = [
  '# 每日本地 Usage 统计',
  '',
  `- 生成时间: ${report.generatedAt}`,
  `- 时区: ${report.timezone}`,
  `- 主机名: ${report.hostname}`,
  `- 是否发起网络请求: ${report.networkRequestsMade ? 'true' : 'false'}`,
  `- 上游源码提交: ${report.vendor.commit}`,
  '',
  '## 总览',
  `- 总 buckets: ${formatNumber(report.summary.totalBuckets)}`,
  `- 总 sessions: ${formatNumber(report.summary.totalSessions)}`,
  `- 总 tokens（MECE 总和）: ${formatNumber(report.summary.totalTokens)}`,
  `- 其中 input_non_cached_tokens: ${formatNumber(report.summary.inputTokens)}`,
  `- 其中 cached_input_read_tokens: ${formatNumber(report.summary.cachedInputTokens)}`,
  `- 其中 output_non_reasoning_tokens: ${formatNumber(report.summary.outputTokens)}`,
  `- 其中 reasoning_output_tokens: ${formatNumber(report.summary.reasoningOutputTokens)}`,
  `- 旧口径 totalTokens（不含 cached_input_read）: ${formatNumber(report.summary.legacyTotalTokensExcludingCachedInput)}`,
  `- 总活跃时长（小时）: ${formatHours(report.summary.totalActiveSeconds)}`,
  `- 总会话跨度（小时）: ${formatHours(report.summary.totalDurationSeconds)}`,
  `- parser 成功数: ${formatNumber(report.summary.parserSuccessCount)}`,
  `- parser 失败数: ${formatNumber(report.summary.parserErrorCount)}`,
  `- 按天记录行数: ${formatNumber(report.summary.dailyRowCount)}`,
  '',
  '## MECE 口径',
  '- 拆分方法：input_non_cached_tokens + cached_input_read_tokens + output_non_reasoning_tokens + reasoning_output_tokens。',
  '- 这个拆分在已归一化 parser 层面互斥且合并后可回到总量。',
  '- 例外说明：Copilot 的 cache write token 没有单独字段，目前并入 input_non_cached_tokens，不额外拆第五类。',
  '- 报表归一化：如果上游日志异常导致某一类被算成负数，本地报表会先钳制到 0 再入图和入表。',
  '',
  '## 来源汇总',
  ...report.parserReports.slice(0, 10).map((item) =>
    `- ${item.source}: 总 ${formatNumber(item.totalTokens)} tokens，其中 input ${formatNumber(item.inputTokens)} / cached ${formatNumber(item.cachedInputTokens)} / output ${formatNumber(item.outputTokens)} / reasoning ${formatNumber(item.reasoningOutputTokens)}`
  ),
  '',
  '## 项目 Top 10',
  ...report.topProjects.slice(0, 10).map((item) =>
    `- ${item.source} / ${item.project}: ${formatNumber(item.totalTokens)} tokens，覆盖 ${formatNumber(item.buckets)} buckets`
  ),
  '',
  '## 近14天按天数据',
  ...dailyUsage.slice(-14).map((row) =>
    `- ${row.date}: 总 ${formatNumber(row.accountedTotalTokens)} = input ${formatNumber(row.inputTokens)} + cached ${formatNumber(row.cachedInputTokens)} + output ${formatNumber(row.outputTokens)} + reasoning ${formatNumber(row.reasoningOutputTokens)}，sessions_started ${formatNumber(row.sessionsStarted)}`
  ),
  '',
  '## 图表产物',
  '- `daily_tokens_trend_14d.svg`：近14天按日总 tokens 趋势图，带点位标签。',
  '- `daily_tokens_mece_14d.svg`：近14天按日 MECE 分类堆叠图，带总量标签。',
  '- `daily_usage.csv`：完整按天明细，适合继续透视或导入别的工具。',
  '',
  '## 错误',
  ...(report.errors.length > 0
    ? report.errors.map((item) => `- ${item.source}: ${item.error}`)
    : ['- 无']),
  '',
];

const dashboardData = {
  generatedAt: report.generatedAt,
  timezone: report.timezone,
  hostname: report.hostname,
  networkRequestsMade: report.networkRequestsMade,
  tokenTaxonomy: report.tokenTaxonomy,
  dailyUsage: report.dailyUsage,
  bucketRows: normalizedBuckets.map((bucket) => ({
    date: shanghaiDate(bucket.bucketStart),
    source: bucket.source,
    project: bucket.project || 'unknown',
    model: bucket.model || 'unknown',
    inputTokens: bucket.inputTokens || 0,
    cachedInputTokens: bucket.cachedInputTokens || 0,
    outputTokens: bucket.outputTokens || 0,
    reasoningOutputTokens: bucket.reasoningOutputTokens || 0,
    totalTokens:
      (bucket.inputTokens || 0) +
      (bucket.cachedInputTokens || 0) +
      (bucket.outputTokens || 0) +
      (bucket.reasoningOutputTokens || 0),
  })),
};

const dashboardHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>每日本地 Usage 统计</title>
  <style>
    :root {
      --bg: #f4f7f9;
      --card: #ffffff;
      --ink: #12344d;
      --muted: #5b7385;
      --line: #d7e3ef;
      --accent: #1565c0;
      --accent2: #00838f;
      --green: #2e7d32;
      --orange: #ef6c00;
      --purple: #6a1b9a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      background: linear-gradient(180deg, #eef5f8 0%, #f8fbfd 100%);
      color: var(--ink);
      padding: 24px;
    }
    .wrap {
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px 20px;
      box-shadow: 0 10px 26px rgba(18, 52, 77, 0.06);
    }
    h1, h2 {
      margin: 0 0 12px;
    }
    h1 { font-size: 28px; }
    h2 { font-size: 18px; }
    .meta, .grid, .list {
      display: grid;
      gap: 10px;
    }
    .meta {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .grid {
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    }
    .tile {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px 14px;
      background: #fbfdff;
    }
    .label {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 4px;
    }
    .value {
      font-size: 24px;
      font-weight: 700;
    }
    .small {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .controls {
      display: grid;
      gap: 12px;
    }
    .control-row {
      display: grid;
      grid-template-columns: 120px 1fr 120px;
      gap: 12px;
      align-items: center;
    }
    input[type="range"] {
      width: 100%;
      accent-color: var(--accent);
    }
    .range-note {
      font-size: 13px;
      color: var(--muted);
    }
    .two-col {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 18px;
    }
    .chart-shell {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px;
      background: #fbfdff;
      overflow-x: auto;
      position: relative;
    }
    svg {
      width: auto;
      min-width: 100%;
      height: auto;
      display: block;
    }
    .stacked-detail-grid {
      margin-top: 14px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .tile.accent-green { border-color: rgba(46, 125, 50, 0.28); }
    .tile.accent-teal { border-color: rgba(0, 131, 143, 0.28); }
    .tile.accent-orange { border-color: rgba(239, 108, 0, 0.28); }
    .tile.accent-pink { border-color: rgba(216, 27, 96, 0.28); }
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
    .chart-tip.show {
      opacity: 1;
      transform: translateY(0);
    }
    .chart-tip strong {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .chart-tip-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    li {
      margin: 6px 0;
      line-height: 1.45;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 8px 10px;
      text-align: right;
    }
    th:first-child, td:first-child {
      text-align: left;
    }
    @media (max-width: 900px) {
      .two-col {
        grid-template-columns: 1fr;
      }
      .control-row {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>每日本地 Usage 统计</h1>
      <div class="meta">
        <div class="tile"><div class="label">生成时间</div><div id="metaGeneratedAt">${escapeXml(report.generatedAt)}</div></div>
        <div class="tile"><div class="label">时区</div><div id="metaTimezone">${escapeXml(report.timezone)}</div></div>
        <div class="tile"><div class="label">主机名</div><div id="metaHostname">${escapeXml(report.hostname)}</div></div>
        <div class="tile"><div class="label">网络请求</div><div id="metaNetwork">${escapeXml(String(report.networkRequestsMade))}</div></div>
      </div>
    </section>

    <section class="card">
      <h2>范围选择</h2>
      <div class="controls">
        <div class="control-row">
          <div class="label">开始日期</div>
          <input id="startRange" type="range" min="0" max="0" value="0" />
          <div id="startLabel">-</div>
        </div>
        <div class="control-row">
          <div class="label">结束日期</div>
          <input id="endRange" type="range" min="0" max="0" value="0" />
          <div id="endLabel">-</div>
        </div>
        <div class="range-note" id="rangeNote"></div>
      </div>
    </section>

    <section class="card">
      <h2>选定范围总览</h2>
      <div class="grid">
        <div class="tile"><div class="label">总 tokens（MECE）</div><div class="value" id="totalTokens">-</div></div>
        <div class="tile"><div class="label">累计 buckets</div><div class="value" id="totalBuckets">-</div></div>
        <div class="tile"><div class="label">sessions_started</div><div class="value" id="totalSessionsStarted">-</div></div>
        <div class="tile"><div class="label">覆盖天数</div><div class="value" id="totalDays">-</div></div>
      </div>
      <div class="grid" style="margin-top: 14px;">
        <div class="tile"><div class="label">input_non_cached</div><div class="value" id="inputTokens">-</div></div>
        <div class="tile"><div class="label">cached_input_read</div><div class="value" id="cachedTokens">-</div></div>
        <div class="tile"><div class="label">output_non_reasoning</div><div class="value" id="outputTokens">-</div></div>
        <div class="tile"><div class="label">reasoning_output</div><div class="value" id="reasoningTokens">-</div></div>
      </div>
      <p class="small">MECE 拆分口径：input_non_cached_tokens + cached_input_read_tokens + output_non_reasoning_tokens + reasoning_output_tokens。Copilot 的 cache write 没有独立字段，当前并入 input_non_cached；若上游日志归一化后出现负数，本地报表会先钳制到 0。</p>
    </section>

    <section class="card">
      <h2>按天总量趋势</h2>
      <div class="chart-shell"><svg id="trendChart" viewBox="0 0 1180 380"></svg></div>
    </section>

    <section class="card">
      <h2>按天 MECE 分类堆叠图</h2>
      <div class="small">悬浮或点击任意日期柱子，可查看该日四类 token 的精确值；默认展示当前范围内总量最高的一天。</div>
      <div class="chart-shell">
        <svg id="stackedChart" viewBox="0 0 1180 430"></svg>
        <div id="stackedTooltip" class="chart-tip"></div>
      </div>
      <div class="grid stacked-detail-grid">
        <div class="tile"><div class="label">当前选中日期</div><div class="value" id="detailDate">-</div></div>
        <div class="tile"><div class="label">当日总 tokens</div><div class="value" id="detailTotal">-</div></div>
        <div class="tile accent-green"><div class="label">Input</div><div class="value" id="detailInput">-</div><div class="small" id="detailInputPct">-</div></div>
        <div class="tile accent-teal"><div class="label">Cached</div><div class="value" id="detailCached">-</div><div class="small" id="detailCachedPct">-</div></div>
        <div class="tile accent-orange"><div class="label">Output</div><div class="value" id="detailOutput">-</div><div class="small" id="detailOutputPct">-</div></div>
        <div class="tile accent-pink"><div class="label">Reasoning</div><div class="value" id="detailReasoning">-</div><div class="small" id="detailReasoningPct">-</div></div>
      </div>
    </section>

    <section class="card">
      <div class="two-col">
        <div>
          <h2>选定范围内来源 Top 8</h2>
          <ul id="sourceList"></ul>
        </div>
        <div>
          <h2>选定范围内项目 Top 8</h2>
          <ul id="projectList"></ul>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>选定范围内按天数据</h2>
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>总 tokens</th>
            <th>input</th>
            <th>cached</th>
            <th>output</th>
            <th>reasoning</th>
            <th>sessions_started</th>
          </tr>
        </thead>
        <tbody id="dailyTableBody"></tbody>
      </table>
    </section>
  </div>
  <script>
    const dashboardData = ${JSON.stringify(dashboardData)};
    const fmt = new Intl.NumberFormat('en-US');
    const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    const dailyUsage = dashboardData.dailyUsage;
    const bucketRows = dashboardData.bucketRows;
    const startRange = document.getElementById('startRange');
    const endRange = document.getElementById('endRange');
    const startLabel = document.getElementById('startLabel');
    const endLabel = document.getElementById('endLabel');
    const rangeNote = document.getElementById('rangeNote');
    const dailyTableBody = document.getElementById('dailyTableBody');
    const sourceList = document.getElementById('sourceList');
    const projectList = document.getElementById('projectList');
    const stackedTooltip = document.getElementById('stackedTooltip');
    const DEFAULT_VISIBLE_DAYS = 21;

    startRange.max = String(dailyUsage.length - 1);
    endRange.max = String(dailyUsage.length - 1);
    startRange.value = String(Math.max(0, dailyUsage.length - DEFAULT_VISIBLE_DAYS));
    endRange.value = String(dailyUsage.length - 1);

    function esc(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function chooseLabelIndices(points, targetCount) {
      if (!Array.isArray(points) || points.length === 0) return new Set();
      const values = points.map((item) => item.accountedTotalTokens || 0);
      const chosen = new Set([0, points.length - 1]);
      let maxIndex = 0;
      let minIndex = 0;
      for (let index = 1; index < values.length; index += 1) {
        if (values[index] > values[maxIndex]) maxIndex = index;
        if (values[index] < values[minIndex]) minIndex = index;
      }
      chosen.add(maxIndex);
      chosen.add(minIndex);

      const candidates = [];
      for (let index = 1; index < values.length - 1; index += 1) {
        const prev = values[index - 1];
        const curr = values[index];
        const next = values[index + 1];
        const isPeak = curr > prev && curr >= next;
        const isValley = curr < prev && curr <= next;
        const leftDelta = Math.abs(curr - prev);
        const rightDelta = Math.abs(curr - next);
        const prominence = leftDelta + rightDelta;
        if (isPeak || isValley) {
          candidates.push({ index, score: prominence + curr * 0.02 });
        } else {
          const jump = Math.max(leftDelta, rightDelta);
          if (jump > 0) candidates.push({ index, score: jump * 0.8 });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      for (const candidate of candidates) {
        if (chosen.size >= Math.max(targetCount, 4)) break;
        const tooClose = Array.from(chosen).some((existing) => Math.abs(existing - candidate.index) <= 1);
        if (!tooClose) chosen.add(candidate.index);
      }
      if (chosen.size < targetCount) {
        const step = Math.max(1, Math.floor(points.length / targetCount));
        for (let index = 0; index < points.length; index += step) {
          chosen.add(index);
          if (chosen.size >= targetCount) break;
        }
      }
      return chosen;
    }

    function renderTrend(points) {
      const svg = document.getElementById('trendChart');
      const width = Math.max(1180, points.length * 56);
      const height = 400, left = 72, right = 28, top = 34, bottom = 82;
      const plotWidth = width - left - right;
      const plotHeight = height - top - bottom;
      const values = points.map((item) => item.accountedTotalTokens);
      const maxValue = Math.max(...values, 1);
      const yMax = maxValue * 1.12;
      const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
      const yFor = (value) => top + plotHeight - value / yMax * plotHeight;
      const xFor = (index) => left + stepX * index;
      const dateLabelIndices = chooseLabelIndices(points, Math.min(10, points.length));
      const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(yMax * ratio));
      const grid = gridValues.map((value) => {
        const y = yFor(value);
        return '<line x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '" stroke="#d7e3ef" stroke-width="1" />' +
          '<text x="' + (left - 10) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="#476072">' + esc(compact.format(value)) + '</text>';
      }).join('');
      const polyline = points.map((item, index) => xFor(index) + ',' + yFor(item.accountedTotalTokens)).join(' ');
      const dots = points.map((item, index) => {
        const x = xFor(index);
        const y = yFor(item.accountedTotalTokens);
        const dateLabel = item.date.slice(5);
        const showDateLabel = dateLabelIndices.has(index);
        return '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="#1565c0" />' +
          '<text x="' + x + '" y="' + (y - 10) + '" text-anchor="middle" font-size="11" fill="#0d3557">' + esc(compact.format(item.accountedTotalTokens)) + '</text>' +
          (showDateLabel ? '<text x="' + x + '" y="' + (height - bottom + 22) + '" text-anchor="middle" font-size="11" fill="#476072">' + esc(dateLabel) + '</text>' : '');
      }).join('');
      svg.innerHTML = '<rect width="' + width + '" height="' + height + '" fill="#f8fbfd" rx="18"></rect>' +
        '<text x="' + left + '" y="24" font-size="18" font-weight="700" fill="#12344d">按天总 tokens 趋势</text>' +
        '<text x="' + left + '" y="46" font-size="12" fill="#5b7385">拖动滑块后，此图会按选定范围重绘</text>' +
        grid +
        '<polyline fill="none" stroke="#1565c0" stroke-width="3" points="' + polyline + '"></polyline>' +
        dots;
    }

    function renderStacked(points) {
      const svg = document.getElementById('stackedChart');
      const width = Math.max(1180, points.length * 56), height = 470, left = 72, right = 28, top = 40, bottom = 92;
      const plotWidth = width - left - right;
      const plotHeight = height - top - bottom;
      const totals = points.map((item) => item.accountedTotalTokens);
      const maxValue = Math.max(...totals, 1);
      const yMax = maxValue * 1.12;
      const stepX = plotWidth / Math.max(points.length, 1);
      const barWidth = Math.max(16, Math.min(42, stepX * 0.62));
      const yFor = (value) => top + plotHeight - value / yMax * plotHeight;
      const dateLabelIndices = chooseLabelIndices(points, Math.min(10, points.length));
      const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(yMax * ratio));
      const palette = { inputTokens: '#2e7d32', cachedInputTokens: '#00838f', outputTokens: '#ef6c00', reasoningOutputTokens: '#d81b60' };
      const labels = { inputTokens: 'Input', cachedInputTokens: 'Cached', outputTokens: 'Output', reasoningOutputTokens: 'Reasoning' };
      const getVisualHeights = (item) => {
        const total = item.accountedTotalTokens || 0;
        const raw = {
          inputTokens: item.inputTokens || 0,
          cachedInputTokens: item.cachedInputTokens || 0,
          outputTokens: item.outputTokens || 0,
          reasoningOutputTokens: item.reasoningOutputTokens || 0,
        };
        const cachedShare = total > 0 ? raw.cachedInputTokens / total : 0;
        const nonCachedTotal = raw.inputTokens + raw.outputTokens + raw.reasoningOutputTokens;
        const visual = (cachedShare > ${CACHED_VISUAL_CAP_SHARE} && nonCachedTotal > 0)
          ? {
              inputTokens: total * ${1 - CACHED_VISUAL_CAP_SHARE} * (raw.inputTokens / nonCachedTotal),
              cachedInputTokens: total * ${CACHED_VISUAL_CAP_SHARE},
              outputTokens: total * ${1 - CACHED_VISUAL_CAP_SHARE} * (raw.outputTokens / nonCachedTotal),
              reasoningOutputTokens: total * ${1 - CACHED_VISUAL_CAP_SHARE} * (raw.reasoningOutputTokens / nonCachedTotal),
            }
          : raw;
        const totalHeightPx = total > 0 ? (total / yMax) * plotHeight : 0;
        const heights = {
          inputTokens: total > 0 ? Math.max(0, visual.inputTokens / yMax * plotHeight) : 0,
          cachedInputTokens: total > 0 ? Math.max(0, visual.cachedInputTokens / yMax * plotHeight) : 0,
          outputTokens: total > 0 ? Math.max(0, visual.outputTokens / yMax * plotHeight) : 0,
          reasoningOutputTokens: total > 0 ? Math.max(0, visual.reasoningOutputTokens / yMax * plotHeight) : 0,
        };
        const nonZeroKeys = Object.keys(raw).filter((key) => raw[key] > 0);
        const targetedKeys = ['outputTokens', 'reasoningOutputTokens'].filter((key) => raw[key] > 0 && heights[key] > 0);
        if (targetedKeys.length > 0 && totalHeightPx > 0) {
          const effectiveMinPx = Math.min(${MIN_CATEGORY_SEGMENT_PX}, Math.max(1.5, totalHeightPx / Math.max(nonZeroKeys.length, 1)));
          let neededPx = 0;
          for (const key of targetedKeys) {
            if (heights[key] < effectiveMinPx) {
              neededPx += effectiveMinPx - heights[key];
              heights[key] = effectiveMinPx;
            }
          }
          for (const donorKey of ['cachedInputTokens', 'inputTokens']) {
            if (neededPx <= 0) break;
            const floorPx = donorKey === 'cachedInputTokens' ? 0 : effectiveMinPx;
            const availablePx = Math.max(0, heights[donorKey] - floorPx);
            const takenPx = Math.min(availablePx, neededPx);
            heights[donorKey] -= takenPx;
            neededPx -= takenPx;
          }
        }
        return { heights, totalHeightPx };
      };
      const grid = gridValues.map((value) => {
        const y = yFor(value);
        return '<line x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '" stroke="#d7e3ef" stroke-width="1" />' +
          '<text x="' + (left - 10) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="#476072">' + esc(compact.format(value)) + '</text>';
      }).join('');
      const bars = points.map((item, index) => {
        const barX = left + index * stepX + (stepX - barWidth) / 2;
        let runningPx = 0;
        const { heights, totalHeightPx } = getVisualHeights(item);
        const keys = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens'];
        const segments = keys.map((key) => {
          const segmentHeight = heights[key] || 0;
          const y = top + plotHeight - runningPx - segmentHeight;
          runningPx += segmentHeight;
          if (segmentHeight <= 0) return '';
          return '<rect data-bar-index="' + index + '" data-token-key="' + key + '" x="' + barX + '" y="' + y + '" width="' + barWidth + '" height="' + segmentHeight + '" fill="' + palette[key] + '" stroke="#ffffff" stroke-width="1" rx="5"></rect>';
        }).join('');
        const showDateLabel = dateLabelIndices.has(index);
        return segments +
          '<text x="' + (barX + barWidth / 2) + '" y="' + (top + plotHeight - totalHeightPx - 10) + '" text-anchor="middle" font-size="11" fill="#0d3557">' + esc(compact.format(item.accountedTotalTokens)) + '</text>' +
          (showDateLabel ? '<text x="' + (barX + barWidth / 2) + '" y="' + (height - bottom + 22) + '" text-anchor="middle" font-size="11" fill="#476072">' + esc(item.date.slice(5)) + '</text>' : '');
      }).join('');
      const legend = Object.entries(labels).map(([key, label], index) => {
        const x = left + index * 170;
        const y = height - 28;
        return '<rect x="' + x + '" y="' + (y - 10) + '" width="16" height="12" fill="' + palette[key] + '" rx="3"></rect>' +
          '<text x="' + (x + 24) + '" y="' + y + '" font-size="12" fill="#476072">' + esc(label) + '</text>';
      }).join('');
      svg.innerHTML = '<rect width="' + width + '" height="' + height + '" fill="#f8fbfd" rx="18"></rect>' +
        '<text x="' + left + '" y="26" font-size="18" font-weight="700" fill="#12344d">按天 MECE 分类堆叠图</text>' +
        '<text x="' + left + '" y="48" font-size="12" fill="#5b7385">柱高仍是真实总量；当 cached 超过 ' + ${Math.round(CACHED_VISUAL_CAP_SHARE * 100)} + '% 时，图内仅把 cached 的视觉占比压到 ' + ${Math.round(CACHED_VISUAL_CAP_SHARE * 100)} + '%。</text>' +
        '<text x="' + left + '" y="66" font-size="12" fill="#5b7385">剩余空间按 input / output / reasoning 的真实比例分配。对非零的 output / reasoning，图内额外保证至少 ' + ${MIN_CATEGORY_SEGMENT_PX} + 'px 的可见高度。</text>' +
        '<text x="' + left + '" y="84" font-size="12" fill="#5b7385">这些调整只影响显示，不影响标签和表格数值。</text>' +
        grid + bars + legend;

      svg.querySelectorAll('[data-bar-index]').forEach((node) => {
        node.style.cursor = 'pointer';
        node.addEventListener('mouseenter', (event) => {
          const index = Number(event.target.getAttribute('data-bar-index'));
          const row = points[index];
          updateStackedDetail(row);
          const total = row.accountedTotalTokens || 1;
          stackedTooltip.innerHTML =
            '<strong>' + esc(row.date) + '</strong>' +
            '<div class="chart-tip-row"><span>总量</span><span>' + esc(fmt.format(row.accountedTotalTokens)) + '</span></div>' +
            '<div class="chart-tip-row"><span>Input</span><span>' + esc(fmt.format(row.inputTokens)) + ' (' + esc(((row.inputTokens / total) * 100).toFixed(1)) + '%)</span></div>' +
            '<div class="chart-tip-row"><span>Cached</span><span>' + esc(fmt.format(row.cachedInputTokens)) + ' (' + esc(((row.cachedInputTokens / total) * 100).toFixed(1)) + '%)</span></div>' +
            '<div class="chart-tip-row"><span>Output</span><span>' + esc(fmt.format(row.outputTokens)) + ' (' + esc(((row.outputTokens / total) * 100).toFixed(1)) + '%)</span></div>' +
            '<div class="chart-tip-row"><span>Reasoning</span><span>' + esc(fmt.format(row.reasoningOutputTokens)) + ' (' + esc(((row.reasoningOutputTokens / total) * 100).toFixed(2)) + '%)</span></div>';
          stackedTooltip.classList.add('show');
        });
        node.addEventListener('mousemove', (event) => {
          const shell = event.currentTarget.ownerSVGElement.closest('.chart-shell');
          const rect = shell.getBoundingClientRect();
          stackedTooltip.style.left = Math.min(event.clientX - rect.left + 14, rect.width - 260) + 'px';
          stackedTooltip.style.top = Math.max(event.clientY - rect.top - 8, 12) + 'px';
        });
        node.addEventListener('mouseleave', () => {
          stackedTooltip.classList.remove('show');
        });
        node.addEventListener('click', (event) => {
          const index = Number(event.target.getAttribute('data-bar-index'));
          updateStackedDetail(points[index]);
        });
      });
    }

    function updateStackedDetail(row) {
      if (!row) return;
      const total = row.accountedTotalTokens || 1;
      document.getElementById('detailDate').textContent = row.date;
      document.getElementById('detailTotal').textContent = fmt.format(row.accountedTotalTokens);
      document.getElementById('detailInput').textContent = fmt.format(row.inputTokens);
      document.getElementById('detailCached').textContent = fmt.format(row.cachedInputTokens);
      document.getElementById('detailOutput').textContent = fmt.format(row.outputTokens);
      document.getElementById('detailReasoning').textContent = fmt.format(row.reasoningOutputTokens);
      document.getElementById('detailInputPct').textContent = ((row.inputTokens / total) * 100).toFixed(1) + '% of total';
      document.getElementById('detailCachedPct').textContent = ((row.cachedInputTokens / total) * 100).toFixed(1) + '% of total';
      document.getElementById('detailOutputPct').textContent = ((row.outputTokens / total) * 100).toFixed(2) + '% of total';
      document.getElementById('detailReasoningPct').textContent = ((row.reasoningOutputTokens / total) * 100).toFixed(2) + '% of total';
    }

    function renderLists(filteredBuckets) {
      const sourceMap = new Map();
      const projectMap = new Map();
      filteredBuckets.forEach((b) => {
        const src = sourceMap.get(b.source) || { key: b.source, total: 0, input: 0, cached: 0, output: 0, reasoning: 0 };
        src.total += b.totalTokens; src.input += b.inputTokens; src.cached += b.cachedInputTokens; src.output += b.outputTokens; src.reasoning += b.reasoningOutputTokens; sourceMap.set(b.source, src);
        const pKey = b.source + ' / ' + b.project;
        const proj = projectMap.get(pKey) || { key: pKey, total: 0, input: 0, cached: 0, output: 0, reasoning: 0 };
        proj.total += b.totalTokens; proj.input += b.inputTokens; proj.cached += b.cachedInputTokens; proj.output += b.outputTokens; proj.reasoning += b.reasoningOutputTokens; projectMap.set(pKey, proj);
      });
      const sourceItems = Array.from(sourceMap.values()).sort((a,b)=>b.total-a.total).slice(0,8);
      const projectItems = Array.from(projectMap.values()).sort((a,b)=>b.total-a.total).slice(0,8);
      sourceList.innerHTML = sourceItems.map((item) => '<li>' + esc(item.key) + '：总 ' + esc(fmt.format(item.total)) + '，cached ' + esc(fmt.format(item.cached)) + '</li>').join('');
      projectList.innerHTML = projectItems.map((item) => '<li>' + esc(item.key) + '：总 ' + esc(fmt.format(item.total)) + '，cached ' + esc(fmt.format(item.cached)) + '</li>').join('');
    }

    function renderTable(rows) {
      dailyTableBody.innerHTML = rows.map((row) =>
        '<tr>' +
          '<td>' + esc(row.date) + '</td>' +
          '<td>' + esc(fmt.format(row.accountedTotalTokens)) + '</td>' +
          '<td>' + esc(fmt.format(row.inputTokens)) + '</td>' +
          '<td>' + esc(fmt.format(row.cachedInputTokens)) + '</td>' +
          '<td>' + esc(fmt.format(row.outputTokens)) + '</td>' +
          '<td>' + esc(fmt.format(row.reasoningOutputTokens)) + '</td>' +
          '<td>' + esc(fmt.format(row.sessionsStarted)) + '</td>' +
        '</tr>'
      ).join('');
    }

    function render() {
      let start = Number(startRange.value);
      let end = Number(endRange.value);
      if (start > end) {
        if (document.activeElement === startRange) end = start;
        else start = end;
      }
      startRange.value = String(start);
      endRange.value = String(end);
      const rows = dailyUsage.slice(start, end + 1);
      const startDate = rows[0].date;
      const endDate = rows[rows.length - 1].date;
      startLabel.textContent = startDate;
      endLabel.textContent = endDate;
      rangeNote.textContent = '当前范围：' + startDate + ' 到 ' + endDate + '，共 ' + rows.length + ' 天';
      const filteredBuckets = bucketRows.filter((row) => row.date >= startDate && row.date <= endDate);
      const totals = rows.reduce((acc, row) => {
        acc.totalTokens += row.accountedTotalTokens;
        acc.totalBuckets += row.buckets;
        acc.sessionsStarted += row.sessionsStarted;
        acc.input += row.inputTokens;
        acc.cached += row.cachedInputTokens;
        acc.output += row.outputTokens;
        acc.reasoning += row.reasoningOutputTokens;
        return acc;
      }, { totalTokens: 0, totalBuckets: 0, sessionsStarted: 0, input: 0, cached: 0, output: 0, reasoning: 0 });
      document.getElementById('totalTokens').textContent = fmt.format(totals.totalTokens);
      document.getElementById('totalBuckets').textContent = fmt.format(totals.totalBuckets);
      document.getElementById('totalSessionsStarted').textContent = fmt.format(totals.sessionsStarted);
      document.getElementById('totalDays').textContent = fmt.format(rows.length);
      document.getElementById('inputTokens').textContent = fmt.format(totals.input);
      document.getElementById('cachedTokens').textContent = fmt.format(totals.cached);
      document.getElementById('outputTokens').textContent = fmt.format(totals.output);
      document.getElementById('reasoningTokens').textContent = fmt.format(totals.reasoning);
      renderTrend(rows);
      renderStacked(rows);
      updateStackedDetail(rows.reduce((best, row) => !best || row.accountedTotalTokens > best.accountedTotalTokens ? row : best, null));
      renderLists(filteredBuckets);
      renderTable(rows);
    }

    startRange.addEventListener('input', render);
    endRange.addEventListener('input', render);
    render();
  </script>
</body>
</html>
`;

writeFileSync(join(outputDir, 'local_usage_report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
writeFileSync(join(outputDir, 'daily_usage.csv'), dailyCsvLines.join('\n') + '\n', 'utf8');
writeFileSync(join(outputDir, 'daily_tokens_trend_14d.svg'), dailyTrendSvg, 'utf8');
writeFileSync(join(outputDir, 'daily_tokens_mece_14d.svg'), dailyStackedSvg, 'utf8');
writeFileSync(join(PROJECT_ROOT, 'dashboard.html'), dashboardHtml, 'utf8');
writeFileSync(join(outputDir, 'summary.md'), summaryLines.join('\n'), 'utf8');
writeFileSync(
  join(outputDir, 'README.md'),
  [
    '# 每日本地 Usage 统计 Run',
    '',
    '- 本次 run 只读取本地 usage 日志。',
    '- 本次 run 不会调用 vibe-cafe 的 ingest API。',
    '- 主要产物：',
    '  - `local_usage_report.json`',
    '  - `daily_usage.csv`',
    '  - `daily_tokens_trend_14d.svg`',
    '  - `daily_tokens_mece_14d.svg`',
    '  - `summary.md`',
    '',
    '- 固定网页入口：',
    '  - `../../dashboard.html`',
    '',
  ].join('\n'),
  'utf8'
);

console.log(`已写入 run: ${outputDir}`);
