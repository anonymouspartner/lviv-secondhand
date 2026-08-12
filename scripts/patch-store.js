#!/usr/bin/env node
// Sends a targeted store patch to the automated map-update pipeline
// (.github/workflows/update-map.yml) via a GitHub repository_dispatch event.
// The dispatch carries { store_id, updates } — a partial object merged into
// the matching entry in stores.json — never the whole file, so concurrent
// patches from different sources (field-scout submissions, flash-deal
// payments, moderation approvals) can't clobber each other's unrelated
// fields.
//
// Zero npm dependencies: only native fetch (Node 18+).
//
// Usage:
//   node scripts/patch-store.js <store_id> '<json-updates>' [owner/repo]
//   node scripts/patch-store.js c21 '{"promo":{"tier":"featured","until":"2026-09-30"}}'
//
// Or import dispatchMapPatch() directly from another Node script:
//   import { dispatchMapPatch } from './scripts/patch-store.js';
//   await dispatchMapPatch({ storeId: 'c21', updates: {...} });
//
// Requires a GITHUB_PAT environment variable — a classic PAT with the `repo`
// scope (repository_dispatch cannot be triggered with the default
// GITHUB_TOKEN a workflow run gets automatically; it needs a real PAT).
// NEVER commit a token — set it as an env var or a repo/CLI secret.

const DEFAULT_REPO = 'anonymouspartner/lviv-secondhand';

export async function dispatchMapPatch({ storeId, updates, repo = DEFAULT_REPO, token = process.env.GITHUB_PAT }) {
  if (!token) throw new Error('GITHUB_PAT is not set — cannot authenticate to the GitHub API.');
  if (!/^[a-z0-9]{1,20}$/i.test(String(storeId || ''))) throw new Error('storeId must be a short alphanumeric id.');
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw new Error('updates must be a plain object.');

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      event_type: 'update_map_data',
      client_payload: { store_id: storeId, updates },
    }),
  });

  if (res.status !== 204) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub dispatch failed (${res.status}): ${body}`);
  }
  return true;
}

// CLI entry point — only runs when this file is executed directly, not when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [storeId, updatesJson, repo] = process.argv.slice(2);
  if (!storeId || !updatesJson) {
    console.error('Usage: node scripts/patch-store.js <store_id> \'<json-updates>\' [owner/repo]');
    process.exit(1);
  }
  let updates;
  try {
    updates = JSON.parse(updatesJson);
  } catch (err) {
    console.error('updates must be valid JSON:', err.message);
    process.exit(1);
  }
  try {
    await dispatchMapPatch({ storeId, updates, repo: repo || DEFAULT_REPO });
    console.log(`Dispatched patch for store "${storeId}" — check the "Update map data" workflow run.`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
