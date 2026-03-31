#!/usr/bin/env node

import { hostname } from 'node:os';
import { parsers } from './repo/src/parsers/index.js';

function sortDesc(list, key) {
  return [...list].sort((a, b) => (b[key] || 0) - (a[key] || 0));
}

function sumTokens(buckets) {
  return buckets.reduce((sum, bucket) => sum + (bucket.totalTokens || 0), 0);
}

function sumSeconds(sessions, field) {
  return sessions.reduce((sum, session) => sum + (session[field] || 0), 0);
}

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
    parserReports.push({
      source,
      buckets: buckets.length,
      sessions: sessions.length,
      totalTokens: sumTokens(buckets),
      activeSeconds: sumSeconds(sessions, 'activeSeconds'),
      durationSeconds: sumSeconds(sessions, 'durationSeconds'),
    });
  } catch (error) {
    errors.push({ source, error: error.message });
  }
}

const projectMap = new Map();
for (const bucket of allBuckets) {
  const key = `${bucket.source}::${bucket.project || 'unknown'}`;
  if (!projectMap.has(key)) {
    projectMap.set(key, {
      source: bucket.source,
      project: bucket.project || 'unknown',
      buckets: 0,
      totalTokens: 0,
    });
  }
  const item = projectMap.get(key);
  item.buckets += 1;
  item.totalTokens += bucket.totalTokens || 0;
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

const report = {
  generatedAt: new Date().toISOString(),
  hostname: hostname(),
  mode: 'local-only-parser-report',
  networkRequestsMade: false,
  summary: {
    totalBuckets: allBuckets.length,
    totalSessions: allSessions.length,
    totalTokens: sumTokens(allBuckets),
    totalActiveSeconds: sumSeconds(allSessions, 'activeSeconds'),
    totalDurationSeconds: sumSeconds(allSessions, 'durationSeconds'),
    parserSuccessCount: parserReports.length,
    parserErrorCount: errors.length,
  },
  parserReports: sortDesc(parserReports, 'totalTokens'),
  sessionSources: sortDesc(Array.from(sessionSources.values()), 'sessions'),
  topProjects: sortDesc(Array.from(projectMap.values()), 'totalTokens').slice(0, 20),
  errors,
};

console.log(JSON.stringify(report, null, 2));
