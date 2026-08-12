// Inline-keyboard flow for the field-scout "bounty" corrections: a shorter,
// structured alternative to the free-text /visit questionnaire, entered via
// a deep link from the map (?store=id&agent_mode=true → /api/bounty/stash →
// t.me/…?start=bounty_{token}).
//
// State machine: cycle → (weekday, only for a numeric cycle) → open time →
// close time → confirm. Each step is a callback_query on an inline keyboard;
// "✏️ Інший" on either time step drops to a plain-text prompt instead
// (handled by handleBountyText() in worker.js, not here).
//
// Session shape (stored in the VISITS KV under bounty-session:{uid}):
//   { storeId, storeName, step, cycle, restockDay, open, close, msgId, chatId }

export const CYCLE_OPTIONS = [
  { code: '7', label: '7 днів' },
  { code: '14', label: '14 днів' },
  { code: '35', label: '35 днів (Humana)' },
  { code: 'unk', label: '❓ Невідомо' },
  { code: 'none', label: '— Немає / —' },
];

export const DAY_OPTIONS = [
  { code: 'mon', label: 'Пн' }, { code: 'tue', label: 'Вт' }, { code: 'wed', label: 'Ср' },
  { code: 'thu', label: 'Чт' }, { code: 'fri', label: 'Пт' }, { code: 'sat', label: 'Сб' },
  { code: 'sun', label: 'Нд' },
];

export const OPEN_TIME_OPTIONS = ['08:00', '08:30', '09:00', '09:30', '10:00'];
export const CLOSE_TIME_OPTIONS = ['17:00', '18:00', '19:00', '19:30', '20:00'];
const CUSTOM_LABEL = '✏️ Інший';

function rows(items, prefix, perRow = 3) {
  const buttons = items.map((it) => {
    const [code, label] = Array.isArray(it) ? it : [it.code, it.label];
    return { text: label, callback_data: `${prefix}:${code}` };
  });
  const out = [];
  for (let i = 0; i < buttons.length; i += perRow) out.push(buttons.slice(i, i + perRow));
  return out;
}

export function getCycleLengthKeyboard() {
  return { inline_keyboard: rows(CYCLE_OPTIONS.map((o) => [o.code, o.label]), 'cyc', 3) };
}

export function getDayOfWeekKeyboard() {
  return { inline_keyboard: rows(DAY_OPTIONS.map((o) => [o.code, o.label]), 'day', 4) };
}

export function getOpenTimeKeyboard() {
  const opts = OPEN_TIME_OPTIONS.map((t) => [t, t]).concat([['custom', CUSTOM_LABEL]]);
  return { inline_keyboard: rows(opts, 'open', 3) };
}

export function getCloseTimeKeyboard() {
  const opts = CLOSE_TIME_OPTIONS.map((t) => [t, t]).concat([['custom', CUSTOM_LABEL]]);
  return { inline_keyboard: rows(opts, 'close', 3) };
}

export function getConfirmKeyboard() {
  return { inline_keyboard: [[{ text: '✅ Підтвердити', callback_data: 'confirm' }, { text: '❌ Скасувати', callback_data: 'cancel' }]] };
}

function cycleLabel(code) {
  return (CYCLE_OPTIONS.find((o) => o.code === code) || {}).label || code;
}
function dayLabel(code) {
  return (DAY_OPTIONS.find((o) => o.code === code) || {}).label || code;
}

export function summaryText(session) {
  const lines = [`📦 <b>${session.storeName}</b>`, ''];
  lines.push(`Цикл: ${cycleLabel(session.cycle)}`);
  if (session.restockDay) lines.push(`День завезення: ${dayLabel(session.restockDay)}`);
  if (session.open && session.close) lines.push(`Години: ${session.open}–${session.close}`);
  lines.push('', 'Надіслати ці зміни на перевірку?');
  return lines.join('\n');
}

// Builds the { cycle, restockDay, hours } patch object from a completed
// session, ready for the { store_id, updates } payload the map-update
// pipeline (.github/workflows/update-map.yml) expects. A single open/close
// pair applies to every day — the picker only asks for one — matching how
// most stores in the dataset already keep identical hours all week.
export function sessionToUpdates(session) {
  const updates = {};
  if (session.cycle === '7' || session.cycle === '14' || session.cycle === '35') {
    updates.cycle = Number(session.cycle);
    if (session.restockDay) updates.restockDay = session.restockDay;
  } else if (session.cycle === 'none') {
    updates.restockDay = null;
  }
  if (session.open && session.close) {
    const hours = {};
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) hours[d] = `${session.open}–${session.close}`;
    updates.hours = hours;
  }
  return updates;
}
