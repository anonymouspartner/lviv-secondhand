#!/usr/bin/env node
// Step 2 of .github/workflows/update-map.yml: the schema gate. Runs after a
// patch is applied and before it's committed — aborts the workflow (non-zero
// exit) rather than let a bad patch reach the live map. Also runnable by
// hand: `node scripts/validate-stores.mjs`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const storesPath = resolve(here, '..', 'stores.json');

const REQUIRED_FIELDS = ['id', 'name', 'lat', 'lng', 'cycle'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/;
// Field names that hold a date value, wherever they appear in the store
// object (top-level or nested, e.g. promo.until, flashDeal.expires_at).
const DATE_FIELD_RE = /(^|_)(until|date|starts_at|expires_at|starts|expires)$/i;

function collectDateFields(obj, path, out) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === 'string' && DATE_FIELD_RE.test(k)) out.push([p, v]);
    else if (v && typeof v === 'object') collectDateFields(v, p, out);
  }
}

function main() {
  let raw;
  try {
    raw = readFileSync(storesPath, 'utf8');
  } catch (err) {
    console.error(`Could not read ${storesPath}: ${err.message}`);
    process.exit(1);
  }

  let stores;
  try {
    stores = JSON.parse(raw);
  } catch (err) {
    console.error(`stores.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  const errors = [];
  if (!Array.isArray(stores)) errors.push('stores.json must be a top-level array.');

  const seenIds = new Set();
  const dupIds = new Set();

  if (Array.isArray(stores)) {
    stores.forEach((s, i) => {
      const where = `stores[${i}]${s && s.id ? ` (id: ${s.id})` : ''}`;
      if (!s || typeof s !== 'object') { errors.push(`${where}: not an object.`); return; }

      for (const field of REQUIRED_FIELDS) {
        if (s[field] === undefined || s[field] === null || s[field] === '') {
          errors.push(`${where}: missing required field "${field}".`);
        }
      }

      if (typeof s.id === 'string') {
        if (seenIds.has(s.id)) dupIds.add(s.id);
        seenIds.add(s.id);
      }

      if (typeof s.lat === 'number') {
        if (!Number.isFinite(s.lat) || s.lat < -90 || s.lat > 90) errors.push(`${where}: lat "${s.lat}" out of range [-90, 90].`);
      } else if (s.lat !== undefined) {
        errors.push(`${where}: lat must be a number.`);
      }
      if (typeof s.lng === 'number') {
        if (!Number.isFinite(s.lng) || s.lng < -180 || s.lng > 180) errors.push(`${where}: lng "${s.lng}" out of range [-180, 180].`);
      } else if (s.lng !== undefined) {
        errors.push(`${where}: lng must be a number.`);
      }

      if (typeof s.cycle === 'number' && (!Number.isFinite(s.cycle) || s.cycle <= 0)) {
        errors.push(`${where}: cycle "${s.cycle}" must be a positive number.`);
      }

      const dateFields = [];
      collectDateFields(s, '', dateFields);
      for (const [field, value] of dateFields) {
        if (!ISO_DATE_RE.test(value)) {
          errors.push(`${where}: field "${field}" = "${value}" is not ISO YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ.`);
        }
      }
    });
  }

  for (const id of dupIds) errors.push(`Duplicate store id: "${id}".`);

  if (errors.length) {
    console.error(`stores.json failed validation (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`stores.json OK — ${stores.length} stores, no duplicate ids, all dates ISO-formatted.`);
}

main();
