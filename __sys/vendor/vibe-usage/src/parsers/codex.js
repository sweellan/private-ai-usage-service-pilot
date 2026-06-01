import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { aggregateToBuckets, extractSessions } from './index.js';

const SESSION_DIRS = [
  join(homedir(), '.codex', 'sessions'),
  join(homedir(), '.codex', 'archived_sessions'),
];

/**
 * Recursively find all .jsonl files under a directory.
 * Codex CLI stores sessions as: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 * and can also move older logs under ~/.codex/archived_sessions.
 */
function findJsonlFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findJsonlFiles(fullPath));
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore unreadable directories
  }
  return results;
}

function normalizeProjectFromCwd(cwd) {
  if (!cwd) return 'unknown';
  const parts = String(cwd).split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || 'unknown';
}

function getUsageTotal(usage) {
  if (!usage) return 0;
  if (Number.isFinite(usage.total_tokens)) return usage.total_tokens;
  return (usage.input_tokens || 0) + (usage.output_tokens || 0);
}

function subtractUsage(curr, prev) {
  return {
    input_tokens: (curr.input_tokens || 0) - (prev.input_tokens || 0),
    output_tokens: (curr.output_tokens || 0) - (prev.output_tokens || 0),
    cached_input_tokens:
      (curr.cached_input_tokens || curr.cache_read_input_tokens || 0) -
      (prev.cached_input_tokens || prev.cache_read_input_tokens || 0),
    reasoning_output_tokens:
      (curr.reasoning_output_tokens || 0) - (prev.reasoning_output_tokens || 0),
    total_tokens: getUsageTotal(curr) - getUsageTotal(prev),
  };
}

export async function parse() {
  const entries = [];
  const sessionEvents = [];
  const tokenEvents = [];
  const files = SESSION_DIRS.flatMap(findJsonlFiles).sort();
  if (files.length === 0) return { buckets: [], sessions: [] };
  for (const filePath of files) {

    let content;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Extract project name and model from session_meta line
    let sessionProject = 'unknown';
    let sessionModel = 'unknown';
    let logicalSessionId = filePath;
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'session_meta' && obj.payload) {
          const meta = obj.payload;
          logicalSessionId = meta.forked_from_id || meta.id || meta.session_id || logicalSessionId;
          if (meta.cwd) {
            sessionProject = normalizeProjectFromCwd(meta.cwd);
          }
          if (meta.git?.repository_url) {
            // e.g. https://github.com/org/repo.git → org/repo
            const match = meta.git.repository_url.match(/([^/]+\/[^/]+?)(?:\.git)?$/);
            if (match) sessionProject = match[1];
          }
          break;
        }
      } catch { break; }
    }

    let turnContextModel = 'unknown';
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);

        if (obj.timestamp) {
          const evTs = new Date(obj.timestamp);
          if (!isNaN(evTs.getTime())) {
            const isUserTurn = obj.type === 'turn_context' || obj.type === 'session_meta';
            sessionEvents.push({
              sessionId: logicalSessionId,
              source: 'codex',
              project: sessionProject,
              timestamp: evTs,
              role: isUserTurn ? 'user' : 'assistant',
            });
          }
        }

        if (obj.type === 'turn_context' && obj.payload?.model) {
          turnContextModel = obj.payload.model;
          continue;
        }

        if (obj.type !== 'event_msg') continue;

        const payload = obj.payload;
        if (!payload) continue;

        if (payload.type !== 'token_count') continue;

        const info = payload.info;
        if (!info) continue;

        const timestamp = obj.timestamp ? new Date(obj.timestamp) : null;
        if (!timestamp || isNaN(timestamp.getTime())) continue;

        const model = info.model || payload.model || turnContextModel || sessionModel;
        tokenEvents.push({
          filePath,
          logicalSessionId,
          model,
          project: sessionProject,
          timestamp,
          totalUsage: info.total_token_usage || null,
          lastUsage: info.last_token_usage || null,
        });
      } catch {
        continue;
      }
    }
  }

  tokenEvents.sort((a, b) => {
    const timeDelta = a.timestamp - b.timestamp;
    if (timeDelta !== 0) return timeDelta;
    return a.filePath.localeCompare(b.filePath);
  });

  const highWaterTotals = new Map();
  const fallbackSeen = new Set();
  for (const event of tokenEvents) {
    try {
      let usage = null;
      if (event.totalUsage) {
        const totalKey = event.logicalSessionId;
        const prev = highWaterTotals.get(totalKey);
        if (!prev) {
          usage = event.totalUsage;
          highWaterTotals.set(totalKey, { ...event.totalUsage });
        } else {
          const delta = subtractUsage(event.totalUsage, prev);
          if (getUsageTotal(delta) > 0) {
            usage = delta;
            highWaterTotals.set(totalKey, { ...event.totalUsage });
          }
        }
      } else if (event.lastUsage) {
        const fallbackKey = JSON.stringify({
          logicalSessionId: event.logicalSessionId,
          model: event.model,
          timestamp: event.timestamp.toISOString(),
          usage: event.lastUsage,
        });
        if (!fallbackSeen.has(fallbackKey)) {
          usage = event.lastUsage;
          fallbackSeen.add(fallbackKey);
        }
      }

      if (!usage) continue;

      // OpenAI API: input_tokens INCLUDES cached, output_tokens INCLUDES reasoning.
      // Normalize to non-overlapping categories.
      const cachedInput = usage.cached_input_tokens || usage.cache_read_input_tokens || 0;
      const reasoningOutput = usage.reasoning_output_tokens || 0;
      entries.push({
        source: 'codex',
        model: event.model,
        project: event.project,
        timestamp: event.timestamp,
        inputTokens: (usage.input_tokens || 0) - cachedInput,
        outputTokens: (usage.output_tokens || 0) - reasoningOutput,
        cachedInputTokens: cachedInput,
        reasoningOutputTokens: reasoningOutput,
      });
    } catch {
      continue;
    }
  }

  return { buckets: aggregateToBuckets(entries), sessions: extractSessions(sessionEvents) };
}
