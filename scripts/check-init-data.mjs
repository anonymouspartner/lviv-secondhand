#!/usr/bin/env node
// verifyInitData() in telegram-bot/worker.js authenticates every /route-map
// request, but can't be exercised against a real Telegram client from here.
// This is a self-consistency check instead: build a synthetic initData
// string + bot token, compute the expected hash independently (mirroring
// Telegram's documented algorithm in plain Node crypto, not by calling the
// function under test), and assert verifyInitData agrees. Catches the most
// likely implementation bugs -- a decode/encode mismatch, wrong HMAC key
// order -- before a live deploy, where a wrong byte would otherwise just
// silently 401 every submission.
// Runnable by hand: `node scripts/check-init-data.mjs`.
import { createHmac } from 'node:crypto';
import { verifyInitData } from '../telegram-bot/worker.js';

const BOT_TOKEN = 'test:1234567890abcdefTESTTOKEN';
const USER = { id: 987654321, first_name: 'Test', username: 'test_agent' };
const authDate = Math.floor(Date.now() / 1000);

function buildInitData(fields, botToken) {
  const dataCheckString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

const fields = { auth_date: String(authDate), query_id: 'AAHtest123', user: JSON.stringify(USER) };

// Happy path: a correctly signed initData verifies and returns the user id.
const good = buildInitData(fields, BOT_TOKEN);
assertEqual(await verifyInitData(BOT_TOKEN, good), USER.id, 'valid initData');

// Tampering with the signed payload (after the hash was computed over the
// original) must invalidate it.
const tampered = good.replace(String(USER.id), String(USER.id + 1));
assertEqual(await verifyInitData(BOT_TOKEN, tampered), null, 'tampered initData');

// A stale auth_date must be rejected even with an otherwise-correct hash.
const stale = buildInitData({ ...fields, auth_date: String(authDate - 3 * 60 * 60) }, BOT_TOKEN);
assertEqual(await verifyInitData(BOT_TOKEN, stale), null, 'stale (3h old) initData');

// A mismatched bot token must invalidate the hash too.
assertEqual(await verifyInitData('wrong-token', good), null, 'wrong bot token');

console.log('verifyInitData: self-consistency OK (valid, tampered, stale, wrong-token cases)');
