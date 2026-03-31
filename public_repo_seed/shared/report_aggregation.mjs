function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sortDesc(list, key) {
  return [...list].sort((a, b) => safeNumber(b[key]) - safeNumber(a[key]));
}

function sortAsc(list, key) {
  return [...list].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
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

export function aggregateLatestTokenReports(latestReports, options = {}) {
  const teamName = options.teamName || 'AI Usage Upload Service';
  const generatedAt = options.generatedAt || new Date().toISOString();

  const summary = {
    teamName,
    totalMembers: 0,
    totalReports: 0,
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

  const byMember = [];
  const sourceUsageMap = new Map();
  const dailyUsageMap = new Map();
  const flattenedErrors = [];

  for (const latest of Object.values(latestReports)) {
    const report = latest.report;
    const reportSummary = report.summary || {};

    summary.totalMembers += 1;
    summary.totalReports += 1;
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
    summary.networkRequestsMade = summary.networkRequestsMade || Boolean(report.networkRequestsMade);

    byMember.push({
      memberId: latest.memberId,
      memberName: latest.memberName,
      team: latest.team,
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
      uploadedAt: latest.uploadedAt,
    });

    const sourceSeen = new Set();
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
      if (!sourceSeen.has(source)) {
        row.memberCount += 1;
        sourceSeen.add(source);
      }
    }

    for (const sessionSource of report.sessionSources || []) {
      const source = sessionSource.source || 'unknown';
      if (!sourceUsageMap.has(source)) sourceUsageMap.set(source, createSourceUsageRow(source));
      const row = sourceUsageMap.get(source);
      row.totalActiveSeconds += safeNumber(sessionSource.activeSeconds);
      row.totalDurationSeconds += safeNumber(sessionSource.durationSeconds);
      row.totalMessageCount += safeNumber(sessionSource.messageCount);
      if (!sourceSeen.has(source)) {
        row.memberCount += 1;
        sourceSeen.add(source);
      }
    }

    for (const dailyRow of report.dailyUsage || []) {
      const date = String(dailyRow.date || '');
      if (!date) continue;
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
        memberId: latest.memberId,
        memberName: latest.memberName,
        team: latest.team,
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
    summary,
    byMember: sortDesc(byMember, 'totalTokens'),
    sourceUsage,
    dailyUsage,
    errors: flattenedErrors,
  };
}
