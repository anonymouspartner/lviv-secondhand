#!/usr/bin/env node
// Proves the automated map-patch path, which until now had never run in
// production: the first real dispatch would have reformatted all 130 records,
// because the applier wrote stores.json with indent 1 while everything else
// writes 2. That is the kind of bug an untested pipeline keeps.
//
// Drives scripts/apply-map-patch.mjs as a subprocess with a real
// GITHUB_EVENT_PATH and a fixture dataset, exactly as the workflow does.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const applier = resolve(here, 'apply-map-patch.mjs');
const dir = mkdtempSync(join(tmpdir(), 'mappatch-'));

const FIXTURE = [
  { id: 'a1', name: 'Filled In', phone: '+38 (000) 000-00-00', pricing: 'kg', cycle: 7,
    restock_date: '2026-08-10',
    hours: { mon: '10:00–19:00', tue: '?', wed: '?', thu: '?', fri: '?', sat: '?', sun: 'closed' } },
  { id: 'a2', name: 'Mostly Empty', phone: '', address: '', cycle: 7,
    hours: { mon: '?', tue: '?', wed: '?', thu: '?', fri: '?', sat: '?', sun: '?' } },
];

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  ok  ' + label);
  else { console.log('  FAIL ' + label + (detail ? '  ' + detail : '')); failures++; }
}

function run(payload, storesJson) {
  const storesPath = join(dir, 'stores.json');
  const eventPath = join(dir, 'event.json');
  const reportPath = join(dir, 'report.json');
  writeFileSync(storesPath, storesJson);
  writeFileSync(eventPath, JSON.stringify({ client_payload: payload }));
  let stdout = '', error = null;
  try {
    stdout = execFileSync(process.execPath, [applier], {
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath, STORES_PATH: storesPath, PATCH_REPORT_FILE: reportPath },
      encoding: 'utf8',
      // The guard cases abort on purpose; capture their stderr instead of
      // letting a stack trace land in the middle of passing output.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) { error = e; }
  let report = null;
  try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch {}
  return { raw: readFileSync(storesPath, 'utf8'), stdout, error, report };
}

const pretty = JSON.stringify(FIXTURE, null, 2) + '\n';

// ── 1. Formatting is preserved ──────────────────────────────────────────────
{
  const r = run({ store_id: 'a1', updates: { phone: '+38 (111) 111-11-11' } }, pretty);
  const back = JSON.parse(r.raw);
  check('a one-field patch does not reformat the file',
    r.raw === JSON.stringify(back, null, 2) + '\n', 'indent drifted');
  check('the patched value is written', back[0].phone === '+38 (111) 111-11-11');
  const changedLines = pretty.split('\n').filter((l, i) => l !== r.raw.split('\n')[i]).length;
  check('exactly one line differs', changedLines === 1, changedLines + ' lines changed');
}

// ── 2. Default mode still overwrites, and deep-merges hours ────────────────
{
  const r = run({ store_id: 'a1', updates: { hours: { tue: '09:00–18:00' } } }, pretty);
  const s = JSON.parse(r.raw)[0];
  check('overwrite mode fills a day', s.hours.tue === '09:00–18:00');
  check('overwrite mode leaves sibling days intact', s.hours.mon === '10:00–19:00' && s.hours.sun === 'closed');
}
{
  const r = run({ store_id: 'a1', updates: { phone: 'REPLACED' } }, pretty);
  check('overwrite mode replaces a recorded value', JSON.parse(r.raw)[0].phone === 'REPLACED');
}

// ── 3. fill-gaps never contradicts what is already recorded ────────────────
{
  const r = run({ store_id: 'a1', mode: 'fill-gaps', updates: { phone: 'SHOULD NOT LAND' } }, pretty);
  const s = JSON.parse(r.raw)[0];
  check('fill-gaps refuses to overwrite a recorded phone', s.phone === '+38 (000) 000-00-00');
  check('and reports the decline with both values',
    r.report.stores[0].skipped.length === 1 && r.report.stores[0].skipped[0].field === 'phone'
    && r.report.stores[0].skipped[0].have === '+38 (000) 000-00-00' && r.report.stores[0].skipped[0].proposed === 'SHOULD NOT LAND',
    JSON.stringify(r.report.stores[0].skipped));
}
{
  const r = run({ store_id: 'a2', mode: 'fill-gaps', updates: { phone: '+38 (222) 222-22-22', address: 'вул. Тестова, 1' } }, pretty);
  const s = JSON.parse(r.raw)[1];
  check('fill-gaps fills empty-string fields', s.phone === '+38 (222) 222-22-22' && s.address === 'вул. Тестова, 1');
  check('and reports nothing declined', r.report.stores[0].skipped.length === 0);
}
{
  const r = run({ store_id: 'a1', mode: 'fill-gaps',
                  updates: { hours: { mon: '08:00–20:00', tue: '09:00–18:00', sun: '11:00–15:00' } } }, pretty);
  const s = JSON.parse(r.raw)[0];
  check("fill-gaps treats '?' as a gap and fills it", s.hours.tue === '09:00–18:00');
  check('fill-gaps leaves a recorded day alone', s.hours.mon === '10:00–19:00');
  check("fill-gaps treats 'closed' as a recorded value, not a gap", s.hours.sun === 'closed');
  const fields = r.report.stores[0].skipped.map((x) => x.field).sort();
  check('both contested days are reported', JSON.stringify(fields) === '["hours.mon","hours.sun"]', JSON.stringify(fields));
}

// ── 4. restock_date is the one field where newer wins ──────────────────────
{
  const r = run({ store_id: 'a1', mode: 'fill-gaps', updates: { restock_date: '2026-08-24' } }, pretty);
  check('a newer restock_date is applied', JSON.parse(r.raw)[0].restock_date === '2026-08-24');
}
{
  const r = run({ store_id: 'a1', mode: 'fill-gaps', updates: { restock_date: '2026-07-01' } }, pretty);
  check('an older restock_date is declined', JSON.parse(r.raw)[0].restock_date === '2026-08-10');
  check('and says why', r.report.stores[0].skipped[0] && /older/.test(r.report.stores[0].skipped[0].why), JSON.stringify(r.report.stores[0].skipped));
}

// ── 5. Guards ──────────────────────────────────────────────────────────────
{
  const r = run({ store_id: 'a1', updates: { id: 'hijack' } }, pretty);
  check('a patch may not reassign id', !!r.error && /must not include "id"/.test(String(r.error.stderr || r.error)));
  check('and the file is untouched when it aborts', r.raw === pretty);
}
{
  const r = run({ store_id: 'nope', updates: { phone: 'x' } }, pretty);
  check('an unknown store id aborts', !!r.error && /No store with id/.test(String(r.error.stderr || r.error)));
  check('and the file is untouched', r.raw === pretty);
}


// ── 6. Batch shape: one dispatch, many stores, one report ──────────────────
{
  const r = run({ mode: 'fill-gaps', patches: [
    { store_id: 'a2', updates: { phone: '+38 (333) 333-33-33' } },
    { store_id: 'a1', updates: { phone: 'CONTESTED' } },
    { store_id: 'ghost', updates: { phone: 'x' } },
  ] }, pretty);
  const out = JSON.parse(r.raw);
  check('batch applies the gap-filling patch', out[1].phone === '+38 (333) 333-33-33');
  check('batch leaves the contested value alone', out[0].phone === '+38 (000) 000-00-00');
  check('batch does not abort on a store the map lacks', !r.error, String(r.error && r.error.message).slice(0, 80));
  check('the unknown store is reported as missing',
    r.report.stores.some((x) => x.store_id === 'ghost' && x.missing === true), JSON.stringify(r.report.stores));
  check('needsReview lists exactly the contested and the missing',
    r.report.needsReview.length === 2, JSON.stringify(r.report.needsReview.map((x) => x.store_id)));
  check('batch still writes indent 2', r.raw === JSON.stringify(out, null, 2) + '\n');
}
{
  // A single-store payload still aborts on an unknown id: those callers pass an
  // id they just read out of stores.json, so it means something is wrong.
  const r = run({ store_id: 'ghost', updates: { phone: 'x' } }, pretty);
  check('a single-store patch still aborts on an unknown store',
    !!r.error && /No store with id/.test(String(r.error.stderr || r.error)));
  const r2 = run({ patches: [{ store_id: 'ghost', updates: { phone: 'x' } }] }, pretty);
  check('but a batch reports it and carries on', !r2.error && r2.report.stores[0].missing === true);
}

// ── 7. A flag proposed as false where the store has none is a no-op ────────
{
  const r = run({ store_id: 'a2', mode: 'fill-gaps', updates: { dailyDrop: false } }, pretty);
  check('proposing dailyDrop:false on a store without it stores nothing',
    !('dailyDrop' in JSON.parse(r.raw)[1]), JSON.stringify(JSON.parse(r.raw)[1].dailyDrop));
  check('and it is not reported as needing review', r.report.needsReview.length === 0);
}
{
  const withFlag = JSON.stringify([{ id: 'b1', name: 'Flagged', cycle: 7, dailyDrop: true }], null, 2) + '\n';
  const r = run({ store_id: 'b1', mode: 'fill-gaps', updates: { dailyDrop: false } }, withFlag);
  check('but turning an existing flag off is a real change, and is declined',
    JSON.parse(r.raw)[0].dailyDrop === true && r.report.stores[0].skipped.length === 1,
    JSON.stringify(r.report.stores[0].skipped));
}

// ── 8. Additions ───────────────────────────────────────────────────────────
{
  const r = run({ mode: 'fill-gaps', adds: [
    { name: 'Brand New Shop', lat: 49.8000, lng: 24.0000, pricing: 'kg' },
  ] }, pretty);
  const out = JSON.parse(r.raw);
  check('a clear addition lands with an allocated id', out.length === 3 && out[2].id === 'c1', out[2] && out[2].id);
  check('and gets the dataset defaults', out[2] && out[2].brand === 'Independent' && out[2].type === 'other' && out[2].cycle === 7);
  check('the report names it', r.report.added.length === 1 && r.report.added[0].name === 'Brand New Shop');
}
{
  // 'a1' has no coordinates in the fixture, so give the duplicate test its own.
  const near = JSON.stringify([{ id: 'c9', name: 'Existing', lat: 49.8397, lng: 24.0297, cycle: 7 }], null, 2) + '\n';
  const r = run({ mode: 'fill-gaps', adds: [{ name: 'Too Close', lat: 49.83975, lng: 24.02975 }] }, near);
  check('an addition on top of an existing store is refused', JSON.parse(r.raw).length === 1);
  check('and says which store and how far', /c9/.test(r.report.rejectedAdds[0].why) && /duplicate/.test(r.report.rejectedAdds[0].why),
    JSON.stringify(r.report.rejectedAdds));
}
{
  const far = JSON.stringify([{ id: 'c9', name: 'Existing', lat: 49.8397, lng: 24.0297, cycle: 7 }], null, 2) + '\n';
  const r = run({ mode: 'fill-gaps', adds: [{ name: 'Regional Branch', lat: 49.3500, lng: 23.5000 }] }, far);
  check('a genuine regional branch 60+ km out is still accepted', JSON.parse(r.raw).length === 2,
    'EconomClass really does trade in Drohobych and Stryi');
  check('the allocated id follows the highest existing c-number', JSON.parse(r.raw)[1].id === 'c10', JSON.parse(r.raw)[1].id);
}
{
  const one = JSON.stringify([{ id: 'c9', name: 'Existing', lat: 49.8397, lng: 24.0297, cycle: 7 }], null, 2) + '\n';
  const r = run({ mode: 'fill-gaps', adds: [{ name: 'Nowhere', lat: 0, lng: 0 }] }, one);
  check('null-island coordinates are refused', JSON.parse(r.raw).length === 1 && /not a real location/.test(r.report.rejectedAdds[0].why));
  const r2 = run({ mode: 'fill-gaps', adds: [{ name: '', lat: 49.9, lng: 24.1 }] }, one);
  check('an unnamed addition is refused', JSON.parse(r2.raw).length === 1 && /no name/.test(r2.report.rejectedAdds[0].why));
}

// ── 9. Removals ────────────────────────────────────────────────────────────
{
  const r = run({ mode: 'fill-gaps', removes: ['a1'] }, pretty);
  const out = JSON.parse(r.raw);
  check('an approved removal takes the store off the map', out.length === 1 && out[0].id === 'a2');
  check('and the report names what went', r.report.removed[0].id === 'a1' && r.report.removed[0].name === 'Filled In');
  check('removal still writes indent 2', r.raw === JSON.stringify(out, null, 2) + '\n');
}
{
  const r = run({ mode: 'fill-gaps', removes: ['ghost'] }, pretty);
  check('removing a store that is not there is a no-op, not a crash',
    !r.error && JSON.parse(r.raw).length === 2);
}
{
  const r = run({ store_id: 'a1', removes: ['a2'], updates: { phone: 'x' } }, pretty);
  check('removals work in default mode too, not only fill-gaps', JSON.parse(r.raw).length === 1);
}

// ── 10. Default mode is what contributions use: every field is updatable ───
{
  const r = run({ patches: [{ store_id: 'a1', updates: {
    name: 'Renamed', address: 'вул. Нова, 5', hours: { mon: '08:00–20:00' },
  } }] }, pretty);
  const s0 = JSON.parse(r.raw)[0];
  check('an approved rename lands', s0.name === 'Renamed', s0.name);
  check('an approved address change lands over an existing one', s0.address === 'вул. Нова, 5', s0.address);
  check('an approved hours change lands over a recorded day', s0.hours.mon === '08:00–20:00', s0.hours.mon);
  check('untouched days survive the merge', s0.hours.sun === 'closed');
  check('nothing is held back for review', r.report.needsReview.length === 0, JSON.stringify(r.report.needsReview));
}
{
  // The one thing still withheld: a new pin on top of an existing store.
  const one = JSON.stringify([{ id: 'c9', name: 'Existing', lat: 49.8397, lng: 24.0297, cycle: 7 }], null, 2) + '\n';
  const r = run({ adds: [{ name: 'Dup', lat: 49.83972, lng: 24.02972 }] }, one);
  check('a duplicate addition is still refused in default mode', JSON.parse(r.raw).length === 1);
  check('and reported', r.report.rejectedAdds.length === 1);
}
{
  // Noise suppression, not a value judgment: the resulting state is identical.
  const r = run({ patches: [{ store_id: 'a2', updates: { dailyDrop: false, phone: '+38 (1) 1' } }] }, pretty);
  const s1 = JSON.parse(r.raw)[1];
  check('a false flag on a store that lacks it is not written', !('dailyDrop' in s1));
  check('while the real field in the same patch still lands', s1.phone === '+38 (1) 1');
}

console.log('');
if (failures) { console.error(`map-patch: ${failures} check(s) failed.`); process.exit(1); }
console.log('Map-patch pipeline OK — formatting preserved, fill-gaps never overwrites.');
