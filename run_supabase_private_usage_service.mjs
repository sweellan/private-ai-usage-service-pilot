#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createPrivateUsageServer,
  createSupabasePrivateUsageStore,
} from './lib/private_usage_service.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
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

function readConfig() {
  const envFile = getArg('--env-file') || './private_ops_seed/.env.local';
  const envValues = parseDotEnv(envFile);
  const getValue = (key, fallback = '') => process.env[key] || envValues[key] || fallback;
  return {
    supabaseUrl: getValue('SUPABASE_URL'),
    serviceRoleKey: getValue('SUPABASE_SERVICE_ROLE_KEY'),
    projectSlug: getValue('AI_USAGE_PROJECT_SLUG', 'ba_agent_team'),
    teamName: getValue('AI_USAGE_PROJECT_NAME', 'BA_Agent_team'),
    sessionSecret: getValue('AI_USAGE_SESSION_SECRET'),
    sessionTtlHours: Number(getValue('AI_USAGE_SESSION_TTL_HOURS', '24')),
    port: Number(getArg('--port') || getValue('AI_USAGE_SERVER_PORT', '8786')),
    host: getArg('--host') || getValue('AI_USAGE_SERVER_HOST', '127.0.0.1'),
    basePath: getArg('--base-path') || getValue('AI_USAGE_BASE_PATH', '/usage'),
  };
}

const config = readConfig();

if (!config.supabaseUrl || !config.serviceRoleKey || !config.projectSlug || !config.sessionSecret) {
  console.error('Usage: node run_supabase_private_usage_service.mjs [--env-file <path>] [--port <n>] [--host <host>] [--base-path <path>]');
  console.error('Required env values: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_USAGE_PROJECT_SLUG, AI_USAGE_SESSION_SECRET');
  process.exit(1);
}

const store = createSupabasePrivateUsageStore({
  supabaseUrl: config.supabaseUrl,
  serviceRoleKey: config.serviceRoleKey,
  projectSlug: config.projectSlug,
});

const server = createPrivateUsageServer({
  store,
  teamName: config.teamName,
  basePath: config.basePath,
  sessionSecret: config.sessionSecret,
  sessionTtlHours: config.sessionTtlHours,
});

server.listen(config.port, config.host, () => {
  console.log(`Supabase private usage service listening on http://${config.host}:${config.port}${config.basePath}`);
});
