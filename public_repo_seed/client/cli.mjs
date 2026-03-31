#!/usr/bin/env node

import {
  getClientConfigStatus,
  initializeTokenUsageClient,
  syncTokenUsageReport,
} from './token_usage_client.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const command = process.argv[2];
const configPath = getArg('--config-path') || undefined;

if (!command || ['help', '--help', '-h'].includes(command)) {
  console.log(`Usage:
  node cli.mjs init --server-base-url <url> --api-key <member-key> [--config-path <path>]
  node cli.mjs status [--config-path <path>]
  node cli.mjs sync [--report-path <path>] [--config-path <path>]`);
  process.exit(0);
}

switch (command) {
  case 'init': {
    const serverBaseUrl = getArg('--server-base-url');
    const apiKey = getArg('--api-key');
    if (!serverBaseUrl || !apiKey) {
      console.error('Usage: node cli.mjs init --server-base-url <url> --api-key <member-key> [--config-path <path>]');
      process.exit(1);
    }
    const config = initializeTokenUsageClient({ serverBaseUrl, apiKey }, configPath);
    console.log(JSON.stringify({
      ok: true,
      serverBaseUrl: config.serverBaseUrl,
      apiKeyPrefix: config.apiKey.slice(0, 12),
    }, null, 2));
    break;
  }
  case 'status': {
    console.log(JSON.stringify(getClientConfigStatus(configPath), null, 2));
    break;
  }
  case 'sync': {
    const reportPath = getArg('--report-path');
    const result = await syncTokenUsageReport({ reportPath }, configPath);
    console.log(JSON.stringify(result, null, 2));
    break;
  }
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
