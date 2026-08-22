#!/usr/bin/env node
// Renders the "needs a decision" issue body for update-map.yml from the
// applier's report. Lives here rather than inline in the workflow because that
// meant a JS program nested inside YAML inside shell — three levels of quoting,
// and an escaped newline in the middle of it silently broke the whole file.
//
// Reads PATCH_REPORT_FILE, writes ISSUE_BODY_FILE, and prints the number of
// items needing review so the workflow can skip the issue when there are none.
import { readFileSync, writeFileSync } from 'node:fs';

const reportPath = process.env.PATCH_REPORT_FILE;
const outPath = process.env.ISSUE_BODY_FILE;
if (!reportPath || !outPath) throw new Error('PATCH_REPORT_FILE and ISSUE_BODY_FILE must both be set.');

const r = JSON.parse(readFileSync(reportPath, 'utf8'));
const needsReview = r.needsReview || [];
const rejectedAdds = r.rejectedAdds || [];

const L = [];
L.push('An automated map patch applied what it safely could and raised the rest.');
L.push('');
L.push('These are **not** errors. They are places where a contribution disagrees with');
L.push('something already on the map, or proposes a store that looks like one already');
L.push('there — both of which are judgment calls rather than data entry.');
L.push('');

for (const s of needsReview) {
  if (s.missing) {
    L.push('### `' + s.store_id + '` — not on the map');
    L.push('');
    L.push('A patch referenced this id but no such store exists. Either it needs adding');
    L.push('by hand, or the contribution is pointing at the wrong store.');
    L.push('');
    continue;
  }
  L.push('### `' + s.store_id + '`');
  L.push('');
  L.push('| field | on the map | proposed | why declined |');
  L.push('|---|---|---|---|');
  for (const k of s.skipped || []) {
    L.push('| `' + k.field + '` | ' + JSON.stringify(k.have) + ' | ' + JSON.stringify(k.proposed) + ' | ' + k.why + ' |');
  }
  L.push('');
}

if (rejectedAdds.length) {
  L.push('### Additions not made');
  L.push('');
  L.push('| store | why |');
  L.push('|---|---|');
  for (const a of rejectedAdds) L.push('| ' + a.name + ' | ' + a.why + ' |');
  L.push('');
}

const applied = (r.stores || []).filter((x) => Object.keys(x.applied || {}).length);
const added = r.added || [];
const removed = r.removed || [];
if (applied.length || added.length || removed.length) {
  L.push('---');
  L.push('');
  L.push('Applied in the same run, without review:');
  L.push('');
  for (const x of applied) L.push('- `' + x.store_id + '` — ' + Object.keys(x.applied).join(', '));
  for (const x of added) L.push('- **added** `' + x.id + '` — ' + x.name);
  for (const x of removed) L.push('- **removed** `' + x.id + '` — ' + x.name);
  L.push('');
}

writeFileSync(outPath, L.join('\n') + '\n');
console.log(String(needsReview.length + rejectedAdds.length));
