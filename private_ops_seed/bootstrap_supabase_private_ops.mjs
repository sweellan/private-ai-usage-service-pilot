#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

function requiredEnv(env, key) {
  const value = String(env[key] || '').trim();
  if (!value || value === 'replace_me') {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function checkRest(url, secretKey) {
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    },
  });
  return {
    ok: response.ok,
    status: response.status,
    projectRef: response.headers.get('sb-project-ref'),
  };
}

async function main() {
  const envFile = resolve(getArg('--env-file') || `${ROOT}/.env.local`);
  const outputDir = resolve(getArg('--output-dir') || `${ROOT}/bootstrap_output`);
  const env = parseDotEnv(envFile);

  const supabaseUrl = requiredEnv(env, 'SUPABASE_URL');
  const secretKey = requiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const projectSlug = requiredEnv(env, 'AI_USAGE_PROJECT_SLUG');
  const projectName = requiredEnv(env, 'AI_USAGE_PROJECT_NAME');

  const rest = await checkRest(supabaseUrl, secretKey);
  const schemaSql = readFileSync(resolve(`${ROOT}/supabase/schema.sql`), 'utf8');
  const bootstrapSql = readFileSync(resolve(`${ROOT}/supabase/bootstrap_init.sql`), 'utf8');

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(`${outputDir}/schema.sql`), schemaSql, 'utf8');
  writeFileSync(resolve(`${outputDir}/bootstrap_init.sql`), bootstrapSql, 'utf8');
  writeFileSync(
    resolve(`${outputDir}/bootstrap_status.json`),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      envFile,
      supabaseUrl,
      projectSlug,
      projectName,
      rest,
      serviceRoleKeyHash: sha256(secretKey),
      files: {
        schemaSql: resolve(`${outputDir}/schema.sql`),
        bootstrapSql: resolve(`${outputDir}/bootstrap_init.sql`),
      },
    }, null, 2) + '\n',
    'utf8'
  );

  console.log(JSON.stringify({
    ok: true,
    envFile,
    outputDir,
    rest,
  }, null, 2));
}

await main();
