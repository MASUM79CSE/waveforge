#!/usr/bin/env node
/**
 * PostToolUse hook: Prettier-format any source file Claude Code just wrote
 * or edited. Reads the tool event JSON from stdin; exits quietly when the
 * event is not a recognized source edit.
 */
import { extname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const FORMATTABLE = new Set(['.ts', '.tsx', '.css', '.md', '.json', '.js', '.mjs']);

function filePathFromEvent(event) {
  const input = event?.tool_input;
  return input?.file_path ?? input?.notebook_path ?? null;
}

async function main() {
  const raw = await new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });

  if (!raw.trim()) return;
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return; // malformed event — never block the tool
  }

  const path = filePathFromEvent(event);
  if (!path) return;
  if (!FORMATTABLE.has(extname(path))) return;

  const rel = relative(process.cwd(), path);
  if (rel.startsWith('..')) return; // outside the repo

  try {
    execFileSync('npx', ['prettier', '--write', rel], { stdio: 'ignore' });
  } catch {
    // formatting must never fail the tool call
  }
}

main();
