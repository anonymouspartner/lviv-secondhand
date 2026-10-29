#!/usr/bin/env node
// Writes city-counts.json: { "<slug>": <number of stores>, ... } for every city
// in cities.json. The header city menu shows these counts; the app can't read
// them from the other cities' stores files without downloading all of them.
//
//   node scripts/city-counts.mjs          rewrite city-counts.json
//   node scripts/city-counts.mjs --check  exit 1 if it is out of date (CI)
//
// update-map.yml runs the write form after every patch, so map edits keep the
// file current; CI runs --check so a hand edit that forgets it is caught.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'city-counts.json');
const cities = JSON.parse(readFileSync(resolve(root, 'cities.json'), 'utf8'));

const counts = {};
for (const c of cities) {
  const data = JSON.parse(readFileSync(resolve(root, c.stores), 'utf8'));
  const stores = Array.isArray(data) ? data : (data.stores || []);
  counts[c.slug] = stores.filter(s => !s.closed && !s.hidden).length;
}
const text = JSON.stringify(counts, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== text) {
    console.error('✗ city-counts.json is out of date. Run: node scripts/city-counts.mjs');
    process.exit(1);
  }
  console.log('city-counts.json OK');
} else {
  writeFileSync(OUT, text);
  console.log('wrote city-counts.json', counts);
}
