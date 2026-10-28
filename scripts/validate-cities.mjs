#!/usr/bin/env node
// CI gate for the multi-city setup. Checks cities.json itself, runs
// validate-stores.mjs on every city file, and enforces the one rule that keeps
// the shared Worker tables safe: store ids are unique across ALL cities and
// carry their city's prefix (the Worker maps id prefix → city host).
//   node scripts/validate-cities.mjs
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const errors = [];

let cities;
try { cities = JSON.parse(readFileSync(resolve(root, 'cities.json'), 'utf8')); }
catch (e) { console.error(`cities.json: ${e.message}`); process.exit(1); }
if (!Array.isArray(cities) || !cities.length) { console.error('cities.json must be a non-empty array'); process.exit(1); }

const ID_RE = /^[a-z0-9]{1,12}$/; // same rule as worker.js and index.html
const uniq = (field) => {
  const seen = new Set();
  for (const c of cities) {
    if (seen.has(c[field])) errors.push(`cities.json: duplicate ${field} "${c[field]}"`);
    seen.add(c[field]);
  }
};
uniq('slug'); uniq('host'); uniq('stores');
const prefixes = cities.map(c => c.prefix).filter(Boolean);
if (new Set(prefixes).size !== prefixes.length) errors.push('cities.json: duplicate prefix');
for (const c of cities) {
  for (const f of ['slug', 'host', 'nameUa', 'nameEn', 'nameUaGen', 'nameUaLoc', 'stores']) {
    if (typeof c[f] !== 'string' || !c[f]) errors.push(`cities.json[${c.slug}]: missing "${f}"`);
  }
  if (!/^[a-z-]+$/.test(c.slug)) errors.push(`cities.json[${c.slug}]: slug must be lower-case letters/hyphens`);
  if (!/^[a-z0-9]{0,4}$/.test(c.prefix || '')) errors.push(`cities.json[${c.slug}]: prefix must be 0-4 [a-z0-9]`);
  if (!Array.isArray(c.center) || c.center.length !== 2 || !c.center.every(Number.isFinite)) errors.push(`cities.json[${c.slug}]: center must be [lat,lng]`);
  if (!Number.isInteger(c.zoom) || c.zoom < 8 || c.zoom > 18) errors.push(`cities.json[${c.slug}]: zoom out of range`);
  if (typeof c.promo !== 'boolean') errors.push(`cities.json[${c.slug}]: promo must be boolean`);
  if (!Array.isArray(c.chains)) errors.push(`cities.json[${c.slug}]: chains must be an array`);
  if (!existsSync(resolve(root, c.stores))) errors.push(`cities.json[${c.slug}]: stores file ${c.stores} does not exist`);
}
const lviv = cities.find(c => c.slug === 'lviv');
if (!lviv || lviv.stores !== 'stores.json' || lviv.prefix !== '') errors.push('cities.json: lviv must keep stores:"stores.json" and prefix:""');
if (errors.length) { errors.forEach(e => console.error('✗ ' + e)); process.exit(1); }

// Per-file schema checks, reusing validate-stores.mjs unchanged.
for (const c of cities) {
  const r = spawnSync(process.execPath, [resolve(here, 'validate-stores.mjs')], {
    cwd: root, env: { ...process.env, STORES_PATH: c.stores }, encoding: 'utf8',
  });
  if (r.status !== 0) { errors.push(`${c.stores}: validate-stores failed\n${r.stderr || r.stdout}`); }
}

// Cross-city id uniqueness and prefix ownership.
const owner = new Map(); // id → slug
const prefixed = cities.filter(c => c.prefix).sort((a, b) => b.prefix.length - a.prefix.length);
for (const c of cities) {
  let stores;
  try { stores = JSON.parse(readFileSync(resolve(root, c.stores), 'utf8')); } catch { continue; }
  for (const s of stores) {
    if (!s || typeof s.id !== 'string') continue;
    if (!ID_RE.test(s.id)) errors.push(`${c.stores}: id "${s.id}" must match ${ID_RE} (Worker/app rule)`);
    if (owner.has(s.id)) errors.push(`id "${s.id}" appears in both ${owner.get(s.id)} and ${c.slug}`);
    owner.set(s.id, c.slug);
    const claimed = prefixed.find(p => s.id.startsWith(p.prefix) && /^\d+$/.test(s.id.slice(p.prefix.length)));
    if (c.prefix) {
      if (!claimed || claimed.slug !== c.slug) errors.push(`${c.stores}: id "${s.id}" must be ${c.prefix}<number>`);
    } else if (claimed) {
      errors.push(`${c.stores}: id "${s.id}" looks like a ${claimed.slug} id (prefix "${claimed.prefix}")`);
    }
  }
}

if (errors.length) { errors.forEach(e => console.error('✗ ' + e)); process.exit(1); }
console.log(`✓ cities.json: ${cities.length} cities, ${owner.size} unique store ids`);
