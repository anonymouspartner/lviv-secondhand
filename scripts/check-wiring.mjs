// Wiring checks — each one encodes a bug that actually shipped.
//
// These are structural invariants that no existing check covered, and each was
// only found by hand during a bug hunt. Automating them is the difference
// between finding the bug once and never shipping it again.
//
//   1. Every D1 table the Worker writes to is created by ensureSchema.
//      The events table was created by a one-off manual command and never
//      added to ensureSchema, so recreating the database would have broken
//      metrics ingestion with nothing in the code to explain it.
//
//   2. Every command in the bot's Telegram menu resolves to a real handler.
//      The menu is published with setMyCommands; an entry with no handler is a
//      button that silently does nothing.
//
//   3. No Worker fetches another Worker by its public URL.
//      Cloudflare answers such a subrequest with HTTP 404 "error code: 1042".
//      Six bot features failed this way, invisibly, for months.
//
//   4. ensureSchema actually runs to completion.
//      A stray `.run()` chained onto `.catch()` made every call to it throw
//      TypeError, so the Worker answered HTTP 500 "error code: 1101" on every
//      D1-backed route at once. The statement was valid JavaScript, so
//      `node --check` passed it; only executing the chain finds it.
//
// Exit code 1 on any violation.

import fs from 'node:fs';

const worker = fs.readFileSync('worker/worker.js', 'utf8');
const bot = fs.readFileSync('telegram-bot/worker.js', 'utf8');
const errors = [];

// ── 1 · schema coverage ──────────────────────────────────────────────────────
{
  const created = new Set([...worker.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/g)].map((m) => m[1]));
  const used = new Set();
  for (const m of worker.matchAll(/(?:INSERT INTO|UPDATE|DELETE FROM|FROM)\s+([a-z_]+)/g)) used.add(m[1]);
  for (const t of used) {
    if (!created.has(t)) errors.push(`worker/worker.js writes to table "${t}" but ensureSchema never creates it.`);
  }
  console.log(`schema: ${created.size} tables created, ${used.size} referenced`);
}

// ── 2 · every menu command has a handler ─────────────────────────────────────
{
  const listed = new Set();
  for (const name of ['PUBLIC_CMDS', 'AGENT_CMDS', 'OWNER_CMDS']) {
    const i = bot.indexOf(`const ${name} = [`);
    if (i < 0) { errors.push(`telegram-bot/worker.js: ${name} not found — the menu lists were renamed or removed.`); continue; }
    const block = bot.slice(i, bot.indexOf('];', i));
    for (const m of block.matchAll(/command:\s*'([a-z0-9_]+)'/g)) listed.add(m[1]);
  }
  const handled = new Set();
  for (const m of bot.matchAll(/command === '([a-z0-9_]+)'/g)) handled.add(m[1]);
  for (const m of bot.matchAll(/case '([a-z0-9_]+)':/g)) handled.add(m[1]);
  for (const m of bot.matchAll(/\^\\\/([a-z0-9_]+)\\b/g)) handled.add(m[1]);
  for (const c of listed) {
    if (!handled.has(c)) errors.push(`Telegram menu lists /${c} but no handler in telegram-bot/worker.js answers it.`);
  }
  // Telegram rejects the whole call if any entry is malformed, and a rejected
  // call used to still mark the menu version as synced.
  for (const c of listed) {
    if (!/^[a-z0-9_]{1,32}$/.test(c)) errors.push(`Menu command "/${c}" is not a legal Telegram command name.`);
  }
  console.log(`bot menu: ${listed.size} commands listed, all resolved against ${handled.size} handlers`);
}

// ── 3 · no Worker-to-Worker call by public URL ───────────────────────────────
{
  // metricsFetch() keeps one documented public-URL fallback for deploys without
  // the service binding. That single call is exempt — every other one is the
  // 1042 bug returning.
  //
  // The exemption is applied by cutting metricsFetch's body out of the source
  // before scanning, rather than by testing whether the helper exists somewhere
  // in the file. The latter reads as equivalent and is not: it whitelists every
  // occurrence in the file at once, so a new offending call elsewhere passes
  // unnoticed. (Found by trying to smuggle exactly such a call past it.)
  const cutFn = (src, name) => {
    const i = src.indexOf(`function ${name}(`);
    if (i < 0) return src;
    let d = 0, k = src.indexOf('{', i);
    for (; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}' && --d === 0) break;
    }
    return src.slice(0, i) + src.slice(k + 1);
  };

  for (const [file, raw] of [['worker/worker.js', worker], ['telegram-bot/worker.js', bot]]) {
    const src = cutFn(raw, 'metricsFetch');
    for (const m of src.matchAll(/fetch\(\s*[`'"]([^`'"]*workers\.dev[^`'"]*)/g)) {
      errors.push(`${file} fetches a Worker by public URL (${m[1]}) — Cloudflare rejects this with error 1042. Use a service binding.`);
    }
    for (const m of src.matchAll(/fetch\(\s*`\$\{([A-Z_]*WORKER_URL)\}/g)) {
      errors.push(`${file} fetches \${${m[1]}} outside the metricsFetch fallback — use the service binding.`);
    }
  }
  console.log('worker-to-worker: no unbound public-URL calls');
}

// ── 4 · ensureSchema survives execution ───────────────────────────────
{
  // Checks 1–3 read the source as text. This one runs it, because the bug it
  // exists for was invisible to any amount of reading: `.run().catch(() => {}
  // ).run()` is syntactically perfect and throws on every invocation.
  //
  // The stub rejects ALTER, which is what D1 really does once the column is
  // there — so the idempotent-ALTER pattern is exercised in its failing case,
  // the only case that matters after the first deploy.
  const wanted = [...worker.matchAll(/(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE) [a-z_]+/g)].length;
  const ran = [];
  const DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() {
          ran.push(sql);
          if (/^\s*ALTER TABLE/.test(sql)) throw new Error('duplicate column name');
          return { success: true };
        },
        async first() { return null; },
        async all() { return { results: [] }; },
      };
    },
  };
  try {
    const worker_mod = await import('../worker/worker.js');
    const res = await worker_mod.default.fetch(
      new Request('https://x/api/sub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: 's10', chatId: '1' }),
      }),
      { DB },
      { waitUntil() {} },
    );
    if (res.status >= 500) {
      errors.push(`ensureSchema left the Worker answering HTTP ${res.status} on a D1 route.`);
    }
    // Compare schema statements only — the probe route runs its own INSERT on
    // top, which is not what this check is counting. A throw partway through
    // stops the rest, so a short count localises the failure even when nothing
    // propagates out as a 500.
    const schemaRan = ran.filter((q) => /^\s*(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE)\b/.test(q));
    if (schemaRan.length !== wanted) {
      errors.push(`ensureSchema ran ${schemaRan.length} of ${wanted} schema statements — it threw partway. Last: ${(schemaRan[schemaRan.length - 1] || '(none)').slice(0, 70)}`);
    }
    console.log(`ensureSchema: ${schemaRan.length}/${wanted} schema statements executed, ALTER rejection absorbed`);
  } catch (e) {
    errors.push(`ensureSchema threw: ${(e && e.message) || e}`);
  }
}

if (errors.length) {
  console.error('\nWiring check FAILED:');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\nWiring OK.');
