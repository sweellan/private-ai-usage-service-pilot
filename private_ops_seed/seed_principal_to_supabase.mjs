#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  issuePrivateAccessTokenBundle,
} from '../lib/private_access_token.mjs';

const ROOT = resolve(
  '/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/private_ops_seed'
);

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function parseDotEnv(filePath) {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Env file not found: ${resolvedPath}`);
  }
  const values = {};
  for (const rawLine of readFileSync(resolvedPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    values[key.trim()] = rest.join('=').trim();
  }
  return values;
}

function requiredValue(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'replace_me') {
    throw new Error(`Missing required value: ${label}`);
  }
  return normalized;
}

async function postPrincipal({ supabaseUrl, secretKey, principalRow }) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/principals?on_conflict=project_slug,member_id`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'ai_usage',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(principalRow),
  });

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text,
  };
}

async function main() {
  const envFile = resolve(getArg('--env-file') || `${ROOT}/.env.local`);
  const outputDir = resolve(getArg('--output-dir') || `${ROOT}/bootstrap_output`);
  const env = parseDotEnv(envFile);

  const supabaseUrl = requiredValue(env.SUPABASE_URL, 'SUPABASE_URL');
  const secretKey = requiredValue(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  const projectSlug = requiredValue(getArg('--project-slug') || env.AI_USAGE_PROJECT_SLUG, 'project slug');
  const memberId = requiredValue(getArg('--member-id'), 'member id');
  const memberName = requiredValue(getArg('--member-name'), 'member name');
  const team = getArg('--team') || '';
  const role = requiredValue(getArg('--role') || 'member', 'role');
  const email = getArg('--email') || '';

  const bundle = issuePrivateAccessTokenBundle({
    projectSlug,
    memberId,
    memberName,
    team,
    role,
    email,
  });

  const principalRow = {
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

  const result = await postPrincipal({ supabaseUrl, secretKey, principalRow });
  if (!result.ok) {
    throw new Error(`Supabase insert failed: ${result.status} ${result.text}`);
  }

  mkdirSync(outputDir, { recursive: true });
  const bundlePath = resolve(`${outputDir}/${bundle.memberId}_${bundle.role}_bundle.json`);
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
  }, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    ok: true,
    status: result.status,
    bundlePath,
    tokenHint: bundle.tokenHint,
    principalId: bundle.principalId,
  }, null, 2));
}

await main();
