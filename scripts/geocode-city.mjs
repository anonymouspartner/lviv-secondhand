#!/usr/bin/env node
// Fills lat/lng for stores whose geocode_status is "pending" (or "approx" with
// --retry) using OpenStreetMap Nominatim, one request per second as its usage
// policy requires. Run from a machine with internet access:
//
//   node scripts/geocode-city.mjs kyiv            # one city
//   node scripts/geocode-city.mjs --all           # every non-Lviv city
//   node scripts/geocode-city.mjs kyiv --retry    # also retry "approx" rows
//
// Hits become geocode_status:"ok"; misses keep the city-centre coordinates and
// become "approx" so the store still validates and shows (at the centre) until
// someone fixes it by hand. A summary of misses is printed at the end.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const retry = args.includes('--retry');
const all = args.includes('--all');
const slugs = args.filter(a => !a.startsWith('--'));
const cities = JSON.parse(readFileSync(resolve(root, 'cities.json'), 'utf8'));
const targets = cities.filter(c => c.slug !== 'lviv' && (all || slugs.includes(c.slug)));
if (!targets.length) { console.error('usage: geocode-city.mjs <slug>|--all [--retry]'); process.exit(1); }

const UA = 'lviv-secondhand-geocoder/1.0 (hello@lvivsecondhand.com)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// "вул. Соборна, 16 А" → "вулиця Соборна 16А"; Nominatim copes better with the
// expanded street type and no comma before the house number.
function normalise(address) {
  return address
    .replace(/^вул\.\s*/i, 'вулиця ')
    .replace(/^просп\.\s*/i, 'проспект ')
    .replace(/^пров\.|^провул\.\s*/i, 'провулок ')
    .replace(/^пл\.\s*/i, 'площа ')
    .replace(/^бульв?\.\s*/i, 'бульвар ')
    .replace(/\s*\(.*?\)\s*/g, ' ')          // "(2 поверх)", "(Винники)"
    // JS \b is ASCII-only, so Cyrillic words are bounded with lookaheads.
    .replace(/,?\s*\d\s*поверх(?=\s|,|$)/gi, '')      // ", 2 поверх" (floor note after the number)
    .replace(/^(проспект)\s+(.*?)\s+проспект(?=\s|,|$)/i, '$1 $2') // "просп. Адміральський проспект"
    .replace(/,\s*(\d)/, ' $1')              // ", 16" → " 16"
    .replace(/(\d)\s+([А-ЯA-Zа-я])\b/, '$1$2') // "16 А" → "16А"
    .replace(/,\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function lookup(q, city) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'ua');
  url.searchParams.set('accept-language', 'uk');
  url.searchParams.set('q', `${q}, ${city.nameUa}`);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const [hit] = await res.json();
  if (!hit) return null;
  const lat = Number(hit.lat), lng = Number(hit.lon);
  // Reject results more than ~40 km from the city centre: a street-name match
  // in another oblast is worse than no match.
  const dKm = Math.hypot((lat - city.center[0]) * 111, (lng - city.center[1]) * 111 * Math.cos(city.center[0] * Math.PI / 180));
  if (dKm > 40) return null;
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
}

for (const city of targets) {
  const path = resolve(root, city.stores);
  const stores = JSON.parse(readFileSync(path, 'utf8'));
  const misses = [];
  let hits = 0;
  for (const s of stores) {
    const st = s.geocode_status;
    if (!(st === 'pending' || (retry && st === 'approx'))) continue;
    let got = null;
    try {
      got = await lookup(normalise(s.address), city);
      if (!got) got = await lookup(s.address, city);
    } catch (e) {
      console.error(`${s.id}: ${e.message}`);
    }
    if (got) { Object.assign(s, got, { geocode_status: 'ok' }); hits++; }
    else { s.geocode_status = 'approx'; misses.push(`${s.id}  ${s.address}`); }
    writeFileSync(path, JSON.stringify(stores, null, 2) + '\n'); // save as we go
    await sleep(1100);
  }
  console.log(`${city.slug}: ${hits} geocoded, ${misses.length} approx`);
  if (misses.length) console.log('  misses:\n   ' + misses.join('\n   '));
}
