#!/usr/bin/env node

import { initializeClient, getClientStatus, runClientSync } from './lib/internal_usage_client.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const command = process.argv[2];
const configPath = getArg('--config-path') || undefined;

if (!command || ['help', '--help', '-h'].includes(command)) {
  console.log(`Usage:
  node internal_usage_client.mjs init --server-url <url> --api-key <vbu_xxx> [--config-path <path>]
  node internal_usage_client.mjs status [--config-path <path>]
  node internal_usage_client.mjs sync [--local-report-path <path>] [--config-path <path>]`);
  process.exit(0);
}

switch (command) {
  case 'init': {
    const serverUrl = getArg('--server-url');
    const apiKey = getArg('--api-key');
    if (!serverUrl || !apiKey) {
      console.error('Usage: node internal_usage_client.mjs init --server-url <url> --api-key <vbu_xxx> [--config-path <path>]');
      process.exit(1);
    }
    const config = initializeClient({ serverUrl, apiKey }, configPath);
    console.log(JSON.stringify({
      ok: true,
      serverUrl: config.serverUrl,
      apiKeyPrefix: config.apiKey.slice(0, 12),
    }, null, 2));
    break;
  }
  case 'status': {
    console.log(JSON.stringify(getClientStatus(configPath), null, 2));
    break;
  }
  case 'sync': {
    const localReportPath = getArg('--local-report-path');
    const result = await runClientSync({ localReportPath }, configPath);
    console.log(JSON.stringify(result, null, 2));
    break;
  }
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
