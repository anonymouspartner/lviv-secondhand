#!/usr/bin/env node
// Verifies geocoded pins in cities/<slug>/stores.json by reverse-geocoding
// each pin (Nominatim, 1 req/s) and comparing what stands there with the
// store's address. The first geocoding pass placed pins by street name, and
// Nominatim will happily return a street centroid or the wrong building when
// the house number is unknown to it — a pin on the right street 800 m from
// the shop is worse than an honest "approximate" marker.
//
//   node scripts/audit-geocode.mjs kyiv            # one city
//   node scripts/audit-geocode.mjs --all           # every non-Lviv city
//   node scripts/audit-geocode.mjs --all --dry     # report only, write nothing
//
// Outcomes per store (written to geocode_status; coordinates kept unless noted):
//   ok       street and house number both match
//   renamed  house number matches but the street now has a different name
//            (decommunisation): the pin is right, the address was stale →
//            address is updated to the current name, the old one kept in
//            addressOld, and a line added to note
//   street   right street, wrong or missing house number → pin stays (it is
//            on the street) but is flagged; the app may show it as approximate
//   approx   different street AND different number, or a different town →
//            coordinates reset to the city centre
// Lviv's stores.json is never touched. Nothing is deleted.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const all = args.includes('--all');
const slugs = args.filter(a => !a.startsWith('--'));
const cities = JSON.parse(readFileSync(resolve(root, 'cities.json'), 'utf8'));
const targets = cities.filter(c => c.slug !== 'lviv' && (all || slugs.includes(c.slug)));
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain && !targets.length) { console.error('usage: audit-geocode.mjs <slug>|--all [--dry]'); process.exit(1); }

const UA = 'lviv-secondhand-geocoder/1.0 (hello@lvivsecondhand.com)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── address comparison ─────────────────────────────────────────────────────
// (JS \b is ASCII-only, so the Cyrillic words are bounded by spaces/edges.)
const TYPE_WORDS = /(^|\s)(вул\.|вулиця|просп\.|проспект|пров\.|провул\.|провулок|пл\.|площа|бульв\.|бульвар|майдан|шосе|дорога|проїзд|узвіз|набережна)(?=\s|$)/gi;
const lower = s => String(s || '').toLowerCase().replace(/[’'ʼ`]/g, "'").replace(/\s+/g, ' ').trim();
// "вул. Князя Острозького, 14, 2 поверх" → "князя острозького"
export function streetKey(a) {
  let s = lower(a).split(',')[0];
  s = s.replace(/\s*\(.*?\)\s*/g, ' ').replace(TYPE_WORDS, ' ').replace(/\s+/g, ' ').trim();
  // Drop a trailing house number glued to the street ("Героїв 13Л")
  s = s.replace(/\s+\d+[а-яa-z]?(\/\d+[а-яa-z]?)?$/i, '');
  return s;
}
// significant word = the longest word, which survives honorific additions
// ("Липківського" ⊂ "Митрополита Василя Липківського")
const sigWord = k => k.split(' ').filter(w => w.length > 3).sort((a, b) => b.length - a.length)[0] || k;
export function streetMatch(want, got) {
  const w = streetKey(want), g = streetKey(got);
  if (!w || !g) return false;
  if (w === g) return true;
  const ws = sigWord(w), gs = sigWord(g);
  return g.includes(ws) || w.includes(gs);
}
// "16а" / "16-А" / "16 А" → "16а"; "1/5" keeps the slash
export function houseKey(h) {
  return lower(h).replace(/\s|-/g, '');
}
export function houseOf(address) {
  const m = /,\s*([0-9]+(?:\s*[-\s]?\s*[а-яa-z])?(?:\s*\/\s*[0-9]+[а-яa-z]?)?)/i.exec(lower(address))
    || /\s([0-9]+[а-яa-z]?(?:\/[0-9]+[а-яa-z]?)?)\s*$/i.exec(lower(address).replace(/,\s*\d\s*поверх.*$/, ''));
  return m ? houseKey(m[1]) : '';
}
const leadingNum = h => (/^\d+/.exec(h || '') || [''])[0];
export function houseMatch(want, got) {
  if (!want || !got) return false;
  if (want === got) return true;
  const w0 = want.split('/')[0], g0 = got.split('/')[0];
  if (w0 === g0) return true;                       // 27 vs 27/4
  return leadingNum(w0) === leadingNum(g0) && leadingNum(w0) !== ''; // 13а vs 13-а, 2 vs 2а
}

export function classify(store, rev, city) {
  const a = rev.address || {};
  const road = a.road || a.pedestrian || a.footway || a.residential || '';
  const town = a.city || a.town || a.village || a.municipality || '';
  const wantH = houseOf(store.address);
  const gotH = houseKey(a.house_number || '');
  const sOk = streetMatch(store.address, road);
  const hOk = houseMatch(wantH, gotH);
  const sameTown = !town || lower(town) === lower(city.nameUa) || lower(a.county || '').includes(lower(city.nameUa));
  if (!sameTown) return { status: 'approx', reason: `landed in ${town}` }; // another town's street of the same name
  if (sOk && hOk) return { status: 'ok' };
  if (!sOk && hOk && road) return { status: 'renamed', road, reason: `${road} (was ${store.address.split(',')[0]})` };
  if (sOk && !hOk) return { status: 'street', reason: gotH ? `house ${gotH} ≠ ${wantH}` : 'no house number at pin' };
  return { status: 'approx', reason: road ? `${road} ${gotH}` : 'nothing at pin' };
}

async function reverse(lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2'); url.searchParams.set('zoom', '18');
  url.searchParams.set('accept-language', 'uk');
  url.searchParams.set('lat', lat); url.searchParams.set('lon', lng);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Rebuild "вул. X, 14, 2 поверх" with the new street but the original number/suffix.
export function rename(address, road) {
  const [, rest = ''] = /^[^,]*(,.*)$/.exec(address) || [];
  // Nominatim gives "вулиця Левка Лук'яненка" / "Берестейський проспект" — fold to the app's "вул. …" style
  let r = road.replace(/^вулиця\s+/i, 'вул. ').replace(/\s+вулиця$/i, '').replace(/^проспект\s+/i, 'просп. ').replace(/\s+проспект$/i, '')
    .replace(/^провулок\s+/i, 'провул. ').replace(/\s+провулок$/i, '').replace(/^бульвар\s+/i, 'бульвар ').replace(/\s+бульвар$/i, '');
  if (!/^(вул\.|просп\.|провул\.|бульвар|площа|майдан|шосе|дорога|проїзд)/i.test(r)) {
    if (/проспект/i.test(road)) r = 'просп. ' + r; else if (/бульвар/i.test(road)) r = 'бульвар ' + r; else if (/провулок/i.test(road)) r = 'провул. ' + r; else if (!/шосе|дорога|проїзд|площа|майдан/i.test(road)) r = 'вул. ' + r;
  }
  return r + rest;
}

if (isMain) {
  for (const city of targets) {
    const path = resolve(root, city.stores);
    const stores = JSON.parse(readFileSync(path, 'utf8'));
    const tally = { ok: 0, renamed: 0, street: 0, approx: 0, skipped: 0 };
    const lines = [];
    for (const s of stores) {
      if (s.geocode_status !== 'ok' && s.geocode_status !== 'street' && s.geocode_status !== 'renamed') { tally.skipped++; continue; }
      let rev;
      try { rev = await reverse(s.lat, s.lng); } catch (e) { lines.push(`${s.id}: lookup failed (${e.message})`); continue; }
      const r = classify(s, rev, city);
      tally[r.status]++;
      if (r.status !== 'ok') lines.push(`${s.id}  ${r.status.padEnd(7)} ${s.address}  →  ${r.reason}`);
      if (!dry) {
        if (r.status === 'renamed') {
          const newAddr = rename(s.address, r.road);
          if (newAddr !== s.address) {
            s.addressOld = s.address;
            s.note = [s.note, `Стара назва вулиці: ${s.address.split(',')[0]}`].filter(Boolean).join(' · ');
            s.address = newAddr;
            if (s.name === s.addressOld) s.name = newAddr;
          }
          s.geocode_status = 'ok';
        } else if (r.status === 'approx') {
          s.lat = city.center[0]; s.lng = city.center[1]; s.geocode_status = 'approx';
        } else {
          s.geocode_status = r.status;
        }
      }
      await sleep(1100);
    }
    if (!dry) writeFileSync(path, JSON.stringify(stores, null, 2) + '\n');
    console.log(`${city.slug}: ok ${tally.ok}, renamed ${tally.renamed}, street ${tally.street}, approx ${tally.approx}` + (tally.skipped ? `, skipped ${tally.skipped}` : ''));
    for (const l of lines) console.log('   ' + l);
  }
}
