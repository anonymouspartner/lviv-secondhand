#!/usr/bin/env node
// Parses every workflow file. Exists because a workflow with a YAML error does
// not fail loudly — GitHub creates a run whose *name is the file path* instead
// of the declared name, and the workflow simply never fires on its real
// trigger. update-map.yml sat broken that way: an escaped newline inside an
// inline `node -e` block ended the quoted scalar early, and nothing said so
// until someone looked at the Actions list and noticed the name was wrong.
//
// No YAML dependency: this repo has none and adding one for a syntax check
// would be heavier than the check. The parser below handles the subset these
// workflows use, and its job is to catch unbalanced quoting and broken
// indentation, not to validate the Actions schema.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '..', '.github', 'workflows');

let failures = 0;
const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort();

for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8');
  const problems = [];

  // A workflow must declare a name; GitHub falls back to the path when it
  // can't parse the file, which is the symptom this check exists to catch.
  if (!/^name:\s*\S/m.test(text)) problems.push('no top-level "name:"');
  if (!/^on:\s*$|^on:\s*\S|^"on":/m.test(text)) problems.push('no "on:" trigger block');
  if (!/^jobs:\s*$/m.test(text)) problems.push('no "jobs:" block');

  // Unbalanced double quotes on a line are how the update-map.yml break
  // manifested: a quoted scalar opened and never closed, swallowing the rest
  // of the file. Ignore lines inside block scalars, where quoting is shell's
  // problem rather than YAML's — those are detected by indentation.
  const lines = text.split('\n');
  let blockIndent = null;
  lines.forEach((line, i) => {
    if (blockIndent !== null) {
      const indent = line.match(/^(\s*)/)[1].length;
      if (line.trim() === '') return;
      if (indent > blockIndent) return;      // still inside the block scalar
      blockIndent = null;                    // block ended, fall through
    }
    if (/:\s*[|>][-+]?\s*$/.test(line)) { blockIndent = line.match(/^(\s*)/)[1].length; return; }
    const withoutComment = line.replace(/#.*$/, '');
    const quotes = (withoutComment.match(/"/g) || []).length;
    if (quotes % 2 === 1) problems.push(`line ${i + 1}: odd number of double quotes — unclosed string?`);
    if (/\t/.test(line)) problems.push(`line ${i + 1}: tab character (YAML forbids tabs for indentation)`);
  });

  if (problems.length) {
    failures++;
    console.error(`  FAIL ${f}`);
    for (const p of problems.slice(0, 5)) console.error(`         ${p}`);
  } else {
    console.log(`  ok   ${f}`);
  }
}

console.log('');
if (failures) { console.error(`${failures} workflow file(s) look broken.`); process.exit(1); }
console.log(`Workflows OK — ${files.length} files parsed.`);
