#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { issuePrivateAccessTokenBundle } from './lib/private_access_token.mjs';

const ROOT = resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp');
const PRIVATE_ROOT = resolve(`${ROOT}/private_ops_seed`);

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function required(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`Missing required value: ${label}`);
  }
  return normalized;
}

function parseDotEnv(filePath) {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return {};
  const values = {};
  for (const rawLine of readFileSync(resolvedPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    values[key.trim()] = rest.join('=').trim();
  }
  return values;
}

function renderPrompt({
  serverUrl,
  viewUrl,
  clientScriptUrl,
  clientLibUrl,
  memberId,
  memberName,
  team,
  role,
  accessToken,
  configPath,
  dailySyncCommand,
}) {
  return `# Private Usage Setup Prompt

You are configuring private AI usage upload for one teammate. Complete the setup directly and do not ask the user to open web login pages or edit templates by hand.

Use these exact values:
- server url: \`${serverUrl}\`
- view url: \`${viewUrl}\`
- client script url: \`${clientScriptUrl}\`
- client lib url: \`${clientLibUrl}\`
- member id: \`${memberId}\`
- member name: \`${memberName}\`
- team: \`${team}\`
- role: \`${role}\`
- access token: \`${accessToken}\`
- config path: \`${configPath}\`

Goals:
1. Download the minimal uploader files into a local private directory.
2. Configure the uploader once.
3. Run a status check.
4. Upload one usage report successfully now.
5. Configure one daily automatic sync job.
6. Return only the short operational summary.

Rules:
- Never print the full token in the final summary. Only show the first 12 characters.
- Do not ask the user to visit Supabase, SQL Editor, OTP, or login pages.
- Use the same access token for upload and future view bootstrap.
- If no local usage report exists yet, use the existing workflow to generate one and then upload it.
- Prefer \`launchd\` on macOS; use \`cron\` on Linux only if launchd is unavailable.

Required commands:
\`\`\`bash
mkdir -p ~/.ai-usage-private/bin/lib
curl -fsSL "${clientScriptUrl}" -o ~/.ai-usage-private/bin/internal_usage_client.mjs
curl -fsSL "${clientLibUrl}" -o ~/.ai-usage-private/bin/lib/internal_usage_client.mjs
node ~/.ai-usage-private/bin/internal_usage_client.mjs init --server-url "${serverUrl}" --api-key "${accessToken}" --config-path "${configPath}"
node ~/.ai-usage-private/bin/internal_usage_client.mjs status --config-path "${configPath}"
node ~/.ai-usage-private/bin/internal_usage_client.mjs sync --config-path "${configPath}"
\`\`\`

Daily sync requirement:
- Create a once-per-day automatic sync that runs this exact command:
\`\`\`bash
${dailySyncCommand}
\`\`\`
- Verify the scheduler file or cron entry was created.
- Report the next scheduled run time if you can determine it.

Final response format:
- setup: success or fail
- upload: success or fail
- daily_sync: success or fail
- token_prefix: first 12 chars only
- view_url: exact URL
- next_daily_sync: exact command
`;
}

async function seedPrincipalToSupabase({ supabaseUrl, serviceRoleKey, bundle }) {
  const row = {
    principal_id: bundle.principalId,
    project_slug: bundle.projectSlug,
    member_id: bundle.memberId,
    member_name: bundle.memberName,
    team: bundle.team,
    email: bundle.email,
    role: bundle.role,
    token_hash: bundle.tokenHash,
    token_hint: bundle.tokenHint,
  };
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/principals?on_conflict=project_slug,member_id`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'ai_usage',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase seed failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : [];
}

async function main() {
  const env = parseDotEnv(resolve(`${PRIVATE_ROOT}/.env.local`));
  const projectSlug = getArg('--project-slug') || env.AI_USAGE_PROJECT_SLUG || 'ba_agent_team';
  const memberId = required(getArg('--member-id'), 'member id');
  const memberName = required(getArg('--member-name'), 'member name');
  const team = getArg('--team') || '';
  const role = getArg('--role') || 'member';
  const email = getArg('--email') || '';
  const serverUrl = required(getArg('--server-url'), 'server url');
  const viewUrl = getArg('--view-url') || `${serverUrl.replace(/\/$/, '')}/ai-usage/login`;
  const clientBaseUrl = getArg('--client-base-url') || `${serverUrl.replace(/\/private-ai-usage\/?$/, '')}/private-ai-usage-client`;
  const outputDir = resolve(getArg('--output-dir') || `${PRIVATE_ROOT}/bootstrap_output/members/${memberId}`);
  const configPath = getArg('--config-path') || `~/.ai-usage-private/${projectSlug}_${memberId}.json`;
  const seedSupabase = getArg('--seed-supabase') === 'true';

  const bundle = issuePrivateAccessTokenBundle({
    projectSlug,
    memberId,
    memberName,
    team,
    role,
    email,
  });

  const dailySyncCommand = `cd <repo-root> && node internal_usage_client.mjs sync --config-path "${configPath}"`;
  const promptText = renderPrompt({
    serverUrl,
    viewUrl,
    clientScriptUrl: `${clientBaseUrl.replace(/\/$/, '')}/internal_usage_client.mjs`,
    clientLibUrl: `${clientBaseUrl.replace(/\/$/, '')}/lib/internal_usage_client.mjs`,
    memberId: bundle.memberId,
    memberName: bundle.memberName,
    team: bundle.team,
    role: bundle.role,
    accessToken: bundle.accessToken,
    configPath,
    dailySyncCommand,
  });

  mkdirSync(outputDir, { recursive: true });
  const bundlePath = resolve(`${outputDir}/${memberId}_bundle.json`);
  const promptPath = resolve(`${outputDir}/${memberId}_setup_prompt.md`);
  writeFileSync(bundlePath, JSON.stringify({
    projectSlug: bundle.projectSlug,
    principalId: bundle.principalId,
    memberId: bundle.memberId,
    memberName: bundle.memberName,
    team: bundle.team,
    role: bundle.role,
    email: bundle.email,
    issuedAt: bundle.issuedAt,
    accessToken: bundle.accessToken,
    tokenHint: bundle.tokenHint,
    tokenHash: bundle.tokenHash,
    configPath,
    serverUrl,
    viewUrl,
    clientBaseUrl,
  }, null, 2) + '\n', 'utf8');
  writeFileSync(promptPath, promptText, 'utf8');

  let seeded = false;
  if (seedSupabase) {
    const supabaseUrl = required(env.SUPABASE_URL, 'SUPABASE_URL');
    const serviceRoleKey = required(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
    await seedPrincipalToSupabase({ supabaseUrl, serviceRoleKey, bundle });
    seeded = true;
  }

  console.log(JSON.stringify({
    ok: true,
    bundlePath,
    promptPath,
    tokenHint: bundle.tokenHint,
    seeded,
  }, null, 2));
}

await main();
