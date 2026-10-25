// Composes an occasional ad for the Telegram bot, posted to the channel by
// .github/workflows/bot-promo.yml. The channel's readers already found us; the
// bot is what turns a reader into someone who gets pinged on restock day, so
// the channel is the cheapest place to advertise it.
//
// IT IS RANDOM ON PURPOSE
// The same ad every Monday is wallpaper by the third week. So this rolls a die
// on every (daily) run and prints nothing most days — the workflow reads empty
// output as "post nothing today" — and when it does post, it picks one of the
// pitches below at random. At the default 1-in-7 that is about one ad a week,
// never on a predictable day.
//
// Every pitch names a command or feature the bot really has (telegram-bot/
// worker.js) — an ad promising something the bot doesn't do costs more
// subscribers than it gains.
//
// Inputs (all optional):
//   BOT_PROMO_CHANCE   probability of posting on a given run, default 1/7.
//                      Set to 1 to force a post (the workflow's `force` input).
//
// Run: node bot-promo.mjs
const BOT = 'https://t.me/Secondhandlvivbot';

const PITCHES = [
  `🤖 Не пропускайте завози!

Наш бот @Secondhandlvivbot підкаже, які секонди Львова отримують новий товар сьогодні — команда /today.

Безкоштовно → ${BOT}`,

  `🔔 Улюблений секонд — і сповіщення в день завозу.

Відкрийте магазин на карті https://www.lvivsecondhand.com, натисніть «🔔 Сповіщення про завіз у Telegram» — і бот @Secondhandlvivbot напише вам зранку, коли там очікується новий товар.`,

  `💸 Де зараз найдешевше?

/cheap у боті @Secondhandlvivbot показує вагові секонди, які найдовше без завозу — тобто з найнижчими цінами в циклі.

${BOT}`,

  `📅 Плануєте шопінг на вихідні?

/day у боті @Secondhandlvivbot — завози на будь-який день тижня. Оберіть день, і бот покаже, куди йти.

${BOT}`,

  `🛍 Усі секонд-хенди Львова — у вашому Telegram.

Бот @Secondhandlvivbot: завози сьогодні (/today), найвигідніші магазини (/cheap), сповіщення про акції улюблених секондів.

Спробуйте → ${BOT}`,
];

const raw = process.env.BOT_PROMO_CHANCE;
const chance = raw === undefined || raw === '' ? 1 / 7 : Number(raw);
if (!(chance >= 0 && chance <= 1)) {
  console.error(`BOT_PROMO_CHANCE must be between 0 and 1, got "${raw}".`);
  process.exit(1);
}

if (Math.random() < chance) {
  process.stdout.write(PITCHES[Math.floor(Math.random() * PITCHES.length)] + '\n');
}
