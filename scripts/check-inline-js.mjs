#!/usr/bin/env node
// index.html's app logic lives in one inline <script> block with no build step,
// so nothing else syntax-checks it. This extracts that block and runs it
// through `node --check`, catching a stray typo before it reaches production.
// Runnable by hand: `node scripts/check-inline-js.mjs`.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(here, '..', 'index.html');
const html = readFileSync(htmlPath, 'utf8');

// Matches only the bare <script> tag (no src=), i.e. the app's own code —
// not the vendored <script src="..."> includes.
const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (matches.length !== 1) {
  throw new Error(`Expected exactly one inline <script> block in index.html, found ${matches.length}`);
}
const code = matches[0][1];

const tmpFile = resolve(tmpdir(), `index-inline-${process.pid}-${Date.now()}.js`);
writeFileSync(tmpFile, code);
try {
  execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'inherit' });
  console.log(`index.html inline script OK — ${code.length} chars.`);
} finally {
  unlinkSync(tmpFile);
}
