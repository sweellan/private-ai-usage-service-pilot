import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

function getDefaultConfigPath() {
  const envPath = process.env.AI_USAGE_CLIENT_CONFIG_PATH;
  if (envPath) return resolve(envPath);
  return join(homedir(), '.ai-usage-client', 'config.json');
}

export function loadTokenUsageClientConfig(configPath = getDefaultConfigPath()) {
  const resolvedPath = resolve(configPath);
  if (!existsSync(resolvedPath)) return null;
  return JSON.parse(readFileSync(resolvedPath, 'utf8'));
}

export function saveTokenUsageClientConfig(config, configPath = getDefaultConfigPath()) {
  const resolvedPath = resolve(configPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export function initializeTokenUsageClient({ serverBaseUrl, apiKey }, configPath = getDefaultConfigPath()) {
  const config = {
    serverBaseUrl: String(serverBaseUrl).replace(/\/$/, ''),
    apiKey,
    updatedAt: new Date().toISOString(),
  };
  saveTokenUsageClientConfig(config, configPath);
  return config;
}

export function getClientConfigStatus(configPath = getDefaultConfigPath()) {
  const config = loadTokenUsageClientConfig(configPath);
  if (!config) {
    return {
      configured: false,
      configPath: resolve(configPath),
    };
  }
  return {
    configured: true,
    configPath: resolve(configPath),
    serverBaseUrl: config.serverBaseUrl,
    apiKeyPrefix: String(config.apiKey || '').slice(0, 12),
  };
}

async function requestJson({ method, url, apiKey, body }) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export async function syncTokenUsageReport(
  { reportPath = null },
  configPath = getDefaultConfigPath()
) {
  const config = loadTokenUsageClientConfig(configPath);
  if (!config?.serverBaseUrl || !config?.apiKey) {
    throw new Error('Client not configured');
  }

  const resolvedReportPath = reportPath ? resolve(reportPath) : null;
  if (!resolvedReportPath) {
    throw new Error('reportPath is required in the public repo client; generate your local usage report first and pass it explicitly');
  }

  const report = JSON.parse(readFileSync(resolvedReportPath, 'utf8'));
  const uploadResult = await requestJson({
    method: 'POST',
    url: `${config.serverBaseUrl}/api/upload`,
    apiKey: config.apiKey,
    body: { report },
  });

  return {
    reportPath: resolvedReportPath,
    uploadResult,
  };
}
