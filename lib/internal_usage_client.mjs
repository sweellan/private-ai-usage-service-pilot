import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

function getDefaultConfigPath() {
  const envPath = process.env.INTERNAL_USAGE_CLIENT_CONFIG_PATH;
  if (envPath) return resolve(envPath);
  return join(homedir(), '.internal-usage-client', 'config.json');
}

export function loadClientConfig(configPath = getDefaultConfigPath()) {
  const resolvedPath = resolve(configPath);
  if (!existsSync(resolvedPath)) return null;
  return JSON.parse(readFileSync(resolvedPath, 'utf8'));
}

export function saveClientConfig(config, configPath = getDefaultConfigPath()) {
  const resolvedPath = resolve(configPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export function initializeClient({ serverUrl, apiKey }, configPath = getDefaultConfigPath()) {
  const config = {
    serverUrl,
    apiKey,
    updatedAt: new Date().toISOString(),
  };
  saveClientConfig(config, configPath);
  return config;
}

async function requestJson({ method, url, apiKey, body }) {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export function getClientStatus(configPath = getDefaultConfigPath()) {
  const config = loadClientConfig(configPath);
  if (!config) {
    return {
      configured: false,
      configPath: resolve(configPath),
    };
  }
  return {
    configured: true,
    configPath: resolve(configPath),
    serverUrl: config.serverUrl,
    apiKeyPrefix: String(config.apiKey || '').slice(0, 12),
  };
}

export async function runClientSync({ localReportPath, keepOutputDir = null }, configPath = getDefaultConfigPath()) {
  const config = loadClientConfig(configPath);
  if (!config?.serverUrl || !config?.apiKey) {
    throw new Error('Client not configured');
  }

  let reportPath = localReportPath ? resolve(localReportPath) : null;
  if (!reportPath) {
    const outputDir = keepOutputDir ? resolve(keepOutputDir) : mkdtempSync(join(tmpdir(), 'internal-usage-sync-'));
    execFileSync(
      'node',
      [
        resolve('/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/run_local_usage_report.mjs'),
        '--output-dir',
        outputDir,
      ],
      { stdio: 'pipe' }
    );
    reportPath = join(outputDir, 'local_usage_report.json');
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const uploadResult = await requestJson({
    method: 'POST',
    url: `${config.serverUrl.replace(/\/$/, '')}/api/internal-usage/upload`,
    apiKey: config.apiKey,
    body: { report },
  });

  return {
    reportPath,
    uploadResult,
  };
}
