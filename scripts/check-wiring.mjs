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
//   5. The app's date helpers are right OUTSIDE UTC.
//      nextRestockFromAnchor() normalised to local midnight and serialised
//      with toISOString(), so it returned yesterday for every user in Kyiv
//      while being correct in CI. A check that only ever runs in UTC cannot
//      see that class of bug, so this one sets TZ deliberately.
//
//   6. A queued Instagram ad can actually be approved.
//      createAdRow wrote status 'rendering' while /ad/approve demanded
//      'pending' and nothing transitioned between them, so every approve tap
//      published nothing. Both halves were valid code; only executing the
//      route together with the row it creates reveals it.
//
//   7. The bot ranks by day-in-cycle, not by elapsed days.
//      cheapText() reported days since the restock anchor without reducing
//      modulo the cycle, inverting its own "longest since a restock" list.
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

// ── 5 · the app's date helpers, executed outside UTC ─────────────────────────
{
  // Pulled out of index.html's inline <script> the same way check-inline-js.mjs
  // extracts it, then RUN — not syntax-checked. The bug this exists for was a
  // correct-in-UTC, wrong-in-Kyiv date rollover, invisible to any check that
  // does not deliberately leave UTC.
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const html = fs.readFileSync('index.html', 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 1) {
    errors.push(`index.html: expected one inline <script>, found ${blocks.length}.`);
  } else {
    const code = blocks[0][1];
    const grab = (n) => {
      const i = code.indexOf(`function ${n}(`);
      if (i < 0) return null;
      const j = code.indexOf('\nfunction ', i + 1);
      return code.slice(i, j < 0 ? undefined : j);
    };
    const names = ['parseLocalDate', 'weekdayOf', 'nextRestockFromAnchor'];
    const parts = names.map(grab);
    if (parts.some((x) => x === null)) {
      errors.push(`index.html: date helpers renamed or removed (${names.join(', ')}) — this check needs updating.`);
    } else {
      const api = {};
      new Function('DAYS', 'api', `${parts.join('\n')}\napi.weekdayOf = weekdayOf; api.nextRestockFromAnchor = nextRestockFromAnchor;`)(DAYS, api);

      // Node re-reads process.env.TZ on the next Date operation, so this is
      // enough to leave UTC without spawning a second process.
      const prevTZ = process.env.TZ;
      process.env.TZ = 'Europe/Kyiv';
      try {
        // A weekday name must match what the calendar says, in any timezone.
        for (const [iso, want] of [['2026-08-21', 'fri'], ['2026-08-23', 'sun'], ['2026-08-17', 'mon']]) {
          const got = api.weekdayOf(iso);
          if (got !== want) errors.push(`weekdayOf("${iso}") = "${got}", expected "${want}".`);
        }
        // An anchor exactly one cycle back must land on today, not yesterday.
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const anchor = new Date(today); anchor.setDate(anchor.getDate() - 7);
        const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const got = api.nextRestockFromAnchor(isoLocal(anchor), 7);
        if (got !== isoLocal(today)) {
          errors.push(`nextRestockFromAnchor() returned ${got}, expected ${isoLocal(today)} (TZ=Europe/Kyiv) — a local/UTC mismatch.`);
        }
      } finally {
        if (prevTZ === undefined) delete process.env.TZ; else process.env.TZ = prevTZ;
      }
      console.log('date helpers: correct under TZ=Europe/Kyiv, not just UTC');
    }
  }
}

// ── 6 · a queued Instagram ad can be approved ────────────────────────────────
{
  // Drives the real route against the status createAdRow really writes. The two
  // were inconsistent for the whole life of the feature, and nothing that reads
  // either file in isolation can tell.
  const TOKEN = 'c'.repeat(40);
  let row, published;
  const envFor = (status) => {
    published = 0;
    row = { id: 'ad_x', image_path: 'marketing/instagram/ads/ad_x.jpg',
            caption_path: 'marketing/instagram/ads/ad_x.txt', token: TOKEN, status };
    return { ADMIN_KEY: 'k', GH_PAT: 'x', DB: { prepare(sql) { return {
      _a: [],
      bind(...a) { this._a = a; return this; },
      async run() {
        if (/^\s*ALTER TABLE/.test(sql)) throw new Error('duplicate column');
        if (/UPDATE instagram_ads/.test(sql)) { row.status = sql.match(/status = '(\w+)'/)[1]; row.token = ''; }
        return { success: true };
      },
      async first() { return /FROM instagram_ads WHERE id/.test(sql) ? (row.id === this._a[0] ? row : null) : null; },
      async all() { return { results: [] }; },
    }; } } };
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { published++; return new Response(null, { status: 204 }); };
  try {
    const mod = await import('../worker/worker.js');
    const tap = async (env) => mod.default.fetch(
      new Request(`https://x/ad/approve?id=ad_x&t=${TOKEN}`), env, { waitUntil() {} });

    // The status a real queued ad actually carries.
    const statusInCode = /captionPath, token, '(\w+)'/.exec(fs.readFileSync('worker/worker.js', 'utf8'));
    const created = statusInCode ? statusInCode[1] : '(not found)';
    const env = envFor(created);
    const res = await tap(env);
    if (published === 0) {
      errors.push(`/ad/approve does not publish an ad createAdRow created (status '${created}') — HTTP ${res.status} "${(await res.text()).slice(0, 40)}". The queue has no exit.`);
    }
    // A second tap of a spent link must not publish again.
    const before = published;
    await tap(env);
    if (published > before) errors.push('/ad/approve published twice for one ad — the spent link is not inert.');

    // An already-decided ad must be refused.
    const decided = envFor('published');
    await tap(decided);
    if (published > before) errors.push('/ad/approve acted on an already-published ad.');

    console.log(`ad approval: a '${created}' ad publishes once, re-taps and decided ads refused`);
  } catch (e) {
    errors.push(`ad approval check could not run: ${(e && e.message) || e}`);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── 7 · the bot ranks by day-in-cycle, not elapsed days ──────────────────────
{
  // Static, because cheapText() reaches for module-level STORES and Telegram
  // helpers a stub cannot supply cheaply. The invariant is narrow enough to
  // state as a shape: the restockDate branch must reduce modulo the cycle.
  // Sliced rather than matched with a regex — the branch spans comment lines,
  // and a pattern loose enough to survive editing them is loose enough to match
  // the wrong block.
  const i = bot.indexOf('if (s.restockDate) {');
  if (i < 0) {
    errors.push("telegram-bot/worker.js: cheapText's restockDate branch not found — this check needs updating.");
  } else {
    const branch = bot.slice(i, i + 900);
    const modulo = /%\s*cyc\b/.test(branch) || /%\s*cycle\b/.test(branch);
    if (!modulo) {
      errors.push('telegram-bot/worker.js: cheapText reports elapsed days since the restock anchor without reducing modulo the cycle, which inverts its own "longest since a restock" ranking.');
    } else {
      console.log('bot ranking: day-in-cycle, reduced modulo the cycle');
    }
  }
}

if (errors.length) {
  console.error('\nWiring check FAILED:');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\nWiring OK.');
