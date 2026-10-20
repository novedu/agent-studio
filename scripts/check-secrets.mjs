#!/usr/bin/env node
/**
 * Fails when a secret-shaped value reaches a tracked file.
 *
 * Rules:
 * - Only git-tracked files are scanned, so node_modules and local .env files
 *   are ignored by construction.
 * - `.env.example` may keep empty placeholders (`KEY=`), which is what makes it
 *   useful.
 * - Placeholder values such as `sk-xxx`, `sk-...`, `<your-key>` do not match.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  { name: 'OpenAI-style key', regex: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'DeepSeek key', regex: /\bsk-[a-f0-9]{32}\b/ },
  { name: 'filled API key env', regex: /^\s*(?:OPENAI|DEEPSEEK)_API_KEY\s*=\s*["']?[A-Za-z0-9_-]{12,}/m },
  { name: 'bearer token literal', regex: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
];

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => !file.endsWith('.env.example'));

const findings = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue; // binary or unreadable
  }
  if (content.length > 2_000_000) continue;

  for (const { name, regex } of PATTERNS) {
    const match = content.match(regex);
    if (!match) continue;
    const line = content.slice(0, match.index).split('\n').length;
    findings.push(`${file}:${line}  ${name}`);
  }
}

if (findings.length > 0) {
  console.error('Secret scan failed. Remove or rotate these values before committing:');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} tracked files).`);
