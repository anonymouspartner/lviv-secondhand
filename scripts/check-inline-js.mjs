#!/usr/bin/env node
// index.html's app logic lives in one inline <script> block with no build step,
// so nothing else syntax-checks it. Same story for the /route Mini App page
// (telegram-bot/route-map-page.mjs) — a template-string HTML page with its own
// inline script, imported into worker.js rather than served from a file. This
// extracts each source's one bare <script> block and runs it through
// `node --check`, catching a stray typo before it reaches production.
// Runnable by hand: `node scripts/check-inline-js.mjs`.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ROUTE_MAP_PAGE } from '../telegram-bot/route-map-page.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function checkInlineScript(label, html) {
  // Matches only the bare <script> tag (no src=), i.e. the page's own code —
  // not vendored <script src="..."> includes.
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one inline <script> block in ${label}, found ${matches.length}`);
  }
  const code = matches[0][1];

  const tmpFile = resolve(tmpdir(), `inline-js-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  writeFileSync(tmpFile, code);
  try {
    execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'inherit' });
    console.log(`${label} inline script OK — ${code.length} chars.`);
  } finally {
    unlinkSync(tmpFile);
  }
}

checkInlineScript('index.html', readFileSync(resolve(here, '..', 'index.html'), 'utf8'));
checkInlineScript('telegram-bot/route-map-page.mjs', ROUTE_MAP_PAGE);
