import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function writeJsonl(filePath, rows) {
  writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

test('codex parser scans archived sessions and suppresses fork replay totals', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'codex-parser-'));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;

  try {
    const sessionsDir = join(tempHome, '.codex', 'sessions', '2026', '05', '23');
    const archivedDir = join(tempHome, '.codex', 'archived_sessions', '2026', '05', '24');
    mkdirSync(sessionsDir, { recursive: true });
    mkdirSync(archivedDir, { recursive: true });

    const sessionId = 'session-replayed';
    writeJsonl(join(sessionsDir, 'rollout-a.jsonl'), [
      {
        timestamp: '2026-05-23T10:00:00.000Z',
        type: 'session_meta',
        payload: { id: sessionId, cwd: 'C:\\Workspace\\ProjectA' },
      },
      {
        timestamp: '2026-05-23T10:01:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 40,
              output_tokens: 10,
              reasoning_output_tokens: 3,
              total_tokens: 110,
            },
          },
        },
      },
    ]);

    writeJsonl(join(archivedDir, 'rollout-b.jsonl'), [
      {
        timestamp: '2026-05-24T10:00:00.000Z',
        type: 'session_meta',
        payload: { id: 'session-fork', forked_from_id: sessionId, cwd: '/tmp/ProjectA' },
      },
      {
        timestamp: '2026-05-24T10:01:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 20,
              cached_input_tokens: 10,
              output_tokens: 5,
              reasoning_output_tokens: 1,
              total_tokens: 25,
            },
          },
        },
      },
      {
        timestamp: '2026-05-24T10:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 120,
              cached_input_tokens: 40,
              output_tokens: 20,
              reasoning_output_tokens: 3,
              total_tokens: 140,
            },
          },
        },
      },
    ]);

    const { parse } = await import(`../__sys/vendor/vibe-usage/src/parsers/codex.js?test=${Date.now()}`);
    const result = await parse();
    const total = result.buckets.reduce(
      (sum, bucket) =>
        sum +
        bucket.inputTokens +
        bucket.cachedInputTokens +
        bucket.outputTokens +
        bucket.reasoningOutputTokens,
      0
    );

    assert.equal(total, 140);
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].project, 'ProjectA');
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    rmSync(tempHome, { recursive: true, force: true });
  }
});
