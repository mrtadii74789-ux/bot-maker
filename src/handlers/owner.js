import { InlineKeyboard } from 'grammy';
import { adminKeyboard } from '../keyboards.js';
import { getRuntimeBots } from '../bot-manager.js';

const ownerState = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));

function requiredKeyboard(chats) {
  const kb = new InlineKeyboard();
  for (const c of chats) kb.text(`❌ تعطيل #${c.id}`, `admin:req:disable:${c.id}`).row();
  return kb;
}

async function broadcastGeneral(db, mainBot, messageCtx) {
  const delivered = new Set();
  const targets = new Set([...db.platformUsers(), ...db.botUserRows().map(r => Number(r.user_id))]);
  let sent = 0;

  for (const userId of db.platformUsers()) {
    if (delivered.has(userId)) continue;
    try {
      await mainBot.api.copyMessage(userId, messageCtx.chat.id, messageCtx.msg.message_id);
      sent++;
      delivered.add(userId);
    } catch {}
    if ((sent + delivered.size) % 20 === 0) await sleep(900);
  }

  const rows = db.botUserRows();
  const runtimes = getRuntimeBots();
  for (const row of rows) {
    const userId = Number(row.user_id);
    if (delivered.has(userId)) continue;
    const runtime = runtimes.get(Number(row.bot_id));
    if (!runtime) continue;
    try {
      await runtime.api.copyMessage(userId, messageCtx.chat.id, messageCtx.msg.message_id);
      sent++;
      delivered.add(userId);
    } catch {}
    if (sent % 20 === 0) await sleep(900);
  }

  return { total: targets.size, sent, failed: Math.max(0, targets.size - delivered.size) };
}

async function broadcastBot(db, runtime, botId, messageCtx) {
  const users = db.getBroadcastUsers('bot', botId);
  let sent = 0, failed = 0;
  for (const userId of users) {
    try { await runtime.api.copyMessage(userId, messageCtx.chat.id, messageCtx.msg.message_id); sent++; }
    catch { failed++; }
    if ((sent + failed) % 20 === 0) await sleep(900);
  }
  return { total: users.length, sent, failed };
}

export function registerOwnerHandlers(bot, db, ownerId) {
  bot.command('admin', async ctx => {
    if (ctx.from.id !== ownerId) return;
    await ctx.reply('👑 **لوحة تحكم منصة صانع البوتات**\n\nإدارة البوتات، الإحصائيات، الاشتراك الإجباري، والإذاعة العامة من مكان واحد.', { parse_mode: 'Markdown', reply_markup: adminKeyboard });
  });

  bot.callbackQuery('admin:stats', async ctx => {
    if (ctx.from.id !== ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const s = db.stats();
    const users = new Set([...db.platformUsers(), ...db.botUserRows().map(r => Number(r.user_id))]).size;
    await ctx.reply(`📊 **إحصائيات المنصة**\n\n👤 مستخدمو المنصة: ${s.users}\n👥 مستخدمون فريدون للبوتات: ${users}\n🤖 البوتات المصنوعة: ${s.bots}\n🟢 البوتات العاملة: ${s.activeBots}\n⚙️ البوتات المحملة: ${getRuntimeBots().size}`, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('admin:bots', async ctx => {
    if (ctx.from.id !== ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const bots = db.listBots();
    if (!bots.length) return ctx.reply('📭 لا توجد بوتات مصنوعة بعد.');
    const text = bots.slice(0, 50).map((b, i) => `${i + 1}. #${b.id} @${b.username || '-'}\n   👤 المالك: ${b.owner_user_id}\n   🧩 ${b.template}\n   🟢 ${b.status}\n   👥 ${db.botUserCount(b.id)} مستخدم\n   📩 ${db.contactCount(b.id)} رسالة`).join('\n\n');
    await ctx.reply(`🤖 **البوتات المصنوعة**\n\n${text}`, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('admin:broadcast', async ctx => {
    if (ctx.from.id !== ownerId) return ctx.answerCallbackQuery();
    ownerState.set(ownerId, { step: 'broadcast' });
    await ctx.answerCallbackQuery();
    await ctx.reply('📢 **الإذاعة العامة**\n\nأرسل الآن أي رسالة أو صورة أو فيديو أو ملف أو رابط.\n\nسيتم إرسالها إلى مستخدمي المنصة ومستخدمي البوتات المصنوعة، مع استخدام البوت المناسب للإرسال عندما يكون ذلك مطلوبًا.', { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('admin:subscription', async ctx => {
    if (ctx.from.id !== ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const chats = db.listRequired();
    if (!chats.length) return ctx.reply('🔒 **الاشتراك الإجباري**\n\nلا توجد قنوات أو مجموعات مضافة حاليًا.\n\nاستخدم «➕ إضافة اشتراك» لإضافة أكثر من قناة أو مجموعة.', { parse_mode: 'Markdown' });
    const text = chats.map(c => `#${c.id} — ${c.title || c.chat_id}\n🆔 ${c.chat_id}\n🔗 ${c.invite_url || 'بدون رابط'}`).join('\n\n');
    await ctx.reply(`🔒 **الاشتراكات الإجبارية**\n\n${text}`, { parse_mode: 'Markdown', reply_markup: requiredKeyboard(chats) });
  });

  bot.callbackQuery(/^admin:req:disable:(\d+)$/, async ctx => {
    if (ctx.from.id !== ownerId) return ctx.answerCallbackQuery();
    db.disableRequired(Number(ctx.match[1]));
    await ctx.answerCallbackQuery({ text: 'تم التعطيل' });
    const chats = db.listRequired();
    await ctx.editMessageText(chats.length ? `🔒 **الاشتراكات الإجبارية**\n\n${chats.map(c => `#${c.id} — ${c.title || c.chat_id}\n🔗 ${c.invite_url || 'بدون رابط'}`).join('\n\n')}` : '🔒 لا توجد اشتراكات إجبارية فعالة.', { parse_mode: 'Markdown', reply_markup: chats.length ? requiredKeyboard(chats) : undefined });
  });

  bot.callbackQuery('admin:addchat', async ctx => {
    if (ctx.from.id !== ownerId) return ctx.answerCallbackQuery();
    ownerState.set(ownerId, { step: 'chat' });
    await ctx.answerCallbackQuery();
    await ctx.reply('➕ **إضافة اشتراك إجباري**\n\nأرسل كل اشتراك بهذا الشكل:\n`chat_id | الاسم | رابط الدعوة`\n\nمثال:\n`-1001234567890 | قناتي | https://t.me/example`\n\nيمكنك تكرار العملية لإضافة عدد غير محدود من القنوات والمجموعات.', { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('admin:settings', async ctx => {
    if (ctx.from.id !== ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.reply('⚙️ **إعدادات المنصة**\n\nيتم ضبط BOT_TOKEN و OWNER_ID و DB_PATH من Environment Variables في FadeHost.');
  });

  bot.on('message', async (ctx, next) => {
    if (!ctx.from || ctx.from.id !== ownerId) return next();
    const state = ownerState.get(ownerId);
    if (!state) return next();

    if (state.step === 'chat') {
      if (!ctx.message.text) return ctx.reply('❌ أرسل بيانات الاشتراك كنص: chat_id | الاسم | رابط الدعوة');
      const p = ctx.message.text.split('|').map(x => x.trim());
      if (p.length < 3 || !p[0] || !p[1] || !p[2]) return ctx.reply('❌ الصيغة غير صحيحة. استخدم: chat_id | الاسم | رابط الدعوة');
      db.addRequired({ chatId: p[0], title: p[1], type: 'channel_or_group', inviteUrl: p[2] });
      ownerState.delete(ownerId);
      return ctx.reply('✅ تمت إضافة الاشتراك الإجباري بنجاح. يمكنك إضافة اشتراكات أخرى من «➕ إضافة اشتراك».\n\n⚠️ تأكد أن البوتات المصنوعة تستطيع فحص عضوية المستخدمين في هذه القناة/المجموعة.');
    }

    if (state.step === 'broadcast') {
      ownerState.delete(ownerId);
      const id = db.createBroadcast('all', null, ctx.message.text || `[media:${ctx.msg?.message_id || 'unknown'}]`);
      const result = await broadcastGeneral(db, bot, ctx);
      db.finishBroadcast(id, result.sent, result.failed);
      return ctx.reply(`📢 **اكتملت الإذاعة العامة**\n\n👥 المستهدفون: ${result.total}\n✅ تم الإرسال: ${result.sent}\n❌ فشل/لا يوجد مرسل متاح: ${result.failed}`, { parse_mode: 'Markdown' });
    }

    return next();
  });

  bot.command('runtime', async ctx => {
    if (ctx.from.id !== ownerId) return;
    await ctx.reply(`🟢 البوتات المحملة حاليًا: ${getRuntimeBots().size}`);
  });
}
