#!/usr/bin/env node
// Builds cities/<slug>/stores.json from a CSV of raw shop leads
// (columns: city,city_ua,address_ua,restock_day,frequency,raw_schedule_ua,
// captured,source,status). One CSV may hold several cities; one file is
// written per city listed in cities.json that has at least one row.
//
//   node scripts/import-competitor-city.mjs leads.csv [--only kyiv,odesa]
//
// Rows get lat/lng of the city centre and geocode_status:"pending" until
// scripts/geocode-city.mjs fills them in. Existing ids in a city file are
// preserved: a row whose address already exists keeps its id and coordinates.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
if (!csvPath) { console.error('usage: import-competitor-city.mjs <leads.csv> [--only slug,slug]'); process.exit(1); }
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;

const cities = JSON.parse(readFileSync(resolve(root, 'cities.json'), 'utf8'));
const byEn = new Map(cities.map(c => [c.nameEn.toLowerCase(), c]));

const DAY_KEYS = { mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };
const UNKNOWN_HOURS = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, '?']));

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, ''), r[i] ?? ''])));
}

function cycleFor(freq) {
  if (freq === 'every 5 weeks') return 35;
  if (freq === 'every 2 weeks') return 14;
  return 7;
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const grouped = new Map();
for (const r of rows) {
  const city = byEn.get((r.city || '').toLowerCase());
  if (!city) { console.warn(`skip: unknown city "${r.city}"`); continue; }
  if (city.slug === 'lviv') { console.warn('skip: Lviv rows are not imported (stores.json is curated by hand)'); continue; }
  if (only && !only.has(city.slug)) continue;
  if (!grouped.has(city.slug)) grouped.set(city.slug, []);
  grouped.get(city.slug).push(r);
}

for (const [slug, list] of grouped) {
  const city = cities.find(c => c.slug === slug);
  const outPath = resolve(root, city.stores);
  const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : [];
  const byAddr = new Map(existing.map(s => [s.address, s]));
  let maxN = existing.reduce((m, s) => {
    const n = s.id.startsWith(city.prefix) ? parseInt(s.id.slice(city.prefix.length), 10) : NaN;
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  const out = [];
  const seen = new Set();
  for (const r of list) {
    const address = r.address_ua.trim();
    if (!address || seen.has(address)) continue;
    seen.add(address);
    const prev = byAddr.get(address);
    const cycle = cycleFor(r.frequency);
    const day = DAY_KEYS[r.restock_day.toLowerCase()];
    const store = {
      id: prev ? prev.id : `${city.prefix}${++maxN}`,
      name: address,
      brand: prev?.brand || 'Independent',
      address,
      addressEn: prev?.addressEn || '',
      phone: prev?.phone || '',
      type: 'other',
      pricing: prev?.pricing || 'item',
      hours: prev?.hours || UNKNOWN_HOURS,
      cycle,
      lat: prev?.lat ?? city.center[0],
      lng: prev?.lng ?? city.center[1],
      note: r.raw_schedule_ua ? `Оновлення: ${r.raw_schedule_ua}` : '',
      // Public repo: record when the lead was captured, not who it came from.
      source: `leads-${(r.captured || '').slice(0, 7) || 'unknown'}`,
      verified: false,
      geocode_status: prev?.geocode_status || 'pending',
    };
    if (cycle === 7 && day && r.frequency === 'weekly') store.restockDay = day;
    out.push(store);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`${slug}: ${out.length} stores → ${city.stores}`);
}
