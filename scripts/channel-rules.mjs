// Prints the барахолка rules exactly as docs/MARKET.md states them.
//
// The rules exist in one place. A pinned post that has drifted from the
// document is worse than no document: the pinned text is what sellers are held
// to, and the document is what the next change is made against. So the
// workflow that pins them (.github/workflows/channel-rules.yml) reads this,
// and this reads the doc.
//
// Fails loudly rather than printing something plausible — an empty pin, or the
// wrong section, is not a failure anyone would notice until it mattered.
import { readFileSync } from 'node:fs';

const HEADING = '## Rules — the pinned post';
const doc = readFileSync(new URL('../docs/MARKET.md', import.meta.url), 'utf8');

const at = doc.indexOf(HEADING);
if (at === -1) throw new Error(`docs/MARKET.md has no "${HEADING}" section`);

// The first fenced block after the heading, and only that one — the prose
// between them explains why the last line reads as it does.
const rest = doc.slice(at + HEADING.length);
const open = rest.indexOf('```');
if (open === -1) throw new Error('no fenced block under the rules heading');
const body = rest.slice(open + 3);
const close = body.indexOf('```');
if (close === -1) throw new Error('the rules block is not closed');

const rules = body.slice(0, close).replace(/^\n+/, '').replace(/\s+$/, '');
if (!rules) throw new Error('the rules block is empty');
// Telegram's text limit; the rules are ~600 chars, so this only fires if the
// extraction has grabbed the wrong thing entirely.
if (rules.length > 4096) throw new Error(`the rules block is ${rules.length} chars — Telegram's limit is 4096`);
if (!/Барахолка/.test(rules)) throw new Error('the extracted block does not look like the rules');

process.stdout.write(rules + '\n');
