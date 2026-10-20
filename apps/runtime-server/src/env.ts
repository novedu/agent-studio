import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type LLMProviderName = 'mock' | 'openai' | 'deepseek';

export interface ResolvedLLMConfig {
  provider: LLMProviderName;
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

/**
 * Minimal `.env` reader for local development.
 *
 * Values already present in `process.env` always win, so CI or a shell export
 * can override the file. The file is git-ignored; only `.env.example` ships.
 */
export function loadEnvFile(cwd = process.cwd()): string | undefined {
  const file = path.join(cwd, '.env');
  if (!existsSync(file)) return undefined;

  const content = readFileSync(file, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }

  return file;
}

/** DeepSeek first, then any OpenAI-compatible gateway, then offline mock. */
export function resolveLLMConfig(env: NodeJS.ProcessEnv = process.env): ResolvedLLMConfig {
  const deepseekKey = env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) {
    return {
      provider: 'deepseek',
      apiKey: deepseekKey,
      baseURL: env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
      model: env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
    };
  }

  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      baseURL: env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
      model: env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    };
  }

  return { provider: 'mock' };
}

/** The provider name is safe to expose (no keys); it drives the UI badge. */
export function getLLMProviderName(env: NodeJS.ProcessEnv = process.env): LLMProviderName {
  return resolveLLMConfig(env).provider;
}
