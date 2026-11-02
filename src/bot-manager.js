import { Bot, GrammyError } from 'grammy';

const runtimes = new Map();

export async function verifyBotToken(token) {
  const b = new Bot(token);
  return await b.api.getMe();
}

function decorated(text) {
  return [
    `『 ${text} 』`,
    `★彡 ${text} 彡★`,
    `𓆩 ${text} 𓆪`,
    `【 ${text} 】`,
    `꧁ ${text} ꧂`
  ].join('\\n');
}

async function requiredCheck(bot, ctx, db) {
  const chats = db.listRequired();
  if (!ctx.from || !chats.length) return true;
  const missing = [];
  for (const c of chats) {
    try {
      const m = await bot.api.getChatMember(c.chat_id, ctx.from.id);
      if (m.status === 'left' || m.status === 'kicked') missing.push(c);
    } catch {
      missing.push(c);
    }
  }
  if (!missing.length) return true;

  const kb = [];
  for (const c of missing) {
    if (c.invite_url) kb.push([{ text:`📢 ${c.title || 'اشترك'}`, url:c.invite_url }]);
  }
  kb.push([{ text:'✅ تحقق من الاشتراك', callback_data:'subscription:check' }]);
  await ctx.reply('🔒 يجب عليك الاشتراك أولاً في القنوات/المجموعات المطلوبة.', { reply_markup:{inline_keyboard:kb} });
  return false;
}

async function groupsTemplate(bot, ctx, record, db) {
  const text = ctx.message?.text || '';
  if (ctx.chat.type === 'private') {
    if (text === '/help') {
      return ctx.reply('🛡️ أوامر الإدارة تعمل داخل المجموعات:\\n/admins\\n/lock\\n/unlock\\n/ban\\n/mute\\n/unmute\\n/rules\\n/game');
    }
    return ctx.reply('🛡️ هذا بوت إدارة مجموعات. أضفني إلى مجموعتك وارفعني مشرفاً.');
  }
  if (text === '/rules') {
    return ctx.reply(db.getBotSetting(record.id,'rules') || '📜 لا توجد قوانين مضافة بعد.');
  }
  if (text === '/game') {
    const n = Math.floor(Math.random()*3)+1;
    return ctx.reply(`🎮 خمن الرقم من 1 إلى 3!\\nالرقم الحالي هو: ${n}`);
  }
  if (text === '/lock' || text === '/unlock') {
    const member = await bot.api.getChatMember(ctx.chat.id, ctx.from.id).catch(()=>null);
    if (!member || !['administrator','creator'].includes(member.status)) return ctx.reply('❌ هذا الأمر للمشرفين فقط.');
    return ctx.reply(text === '/lock' ? '🔒 تم تفعيل وضع القفل (واجهة القفل جاهزة للتوسعة).' : '🔓 تم إلغاء وضع القفل.');
  }
  if (/https?:\\/\\/|t\\.me\\//i.test(text)) {
    try {
      const member = await bot.api.getChatMember(ctx.chat.id, ctx.from.id);
      if (!['administrator','creator'].includes(member.status)) {
        await bot.api.deleteMessage(ctx.chat.id, ctx.msg.message_id);
        return ctx.reply('🚫 تم حذف الرابط لأن حماية الروابط مفعلة.');
      }
    } catch {}
  }
  const commands = db.listCommands(record.id);
  for (const c of commands) {
    if (text === c.command || text === `/${c.command.replace(/^\\//,'')}`) return ctx.reply(c.response);
  }
}

export function createManagedBot(record, db) {
  if (runtimes.has(record.id)) return runtimes.get(record.id);
  const bot = new Bot(record.token);

  bot.use(async (ctx,next)=>{
    if (ctx.from) db.touchBotUser(record.id,ctx.from);
    if (ctx.from?.id === record.owner_user_id) return next();
    if (!(await requiredCheck(bot,ctx,db))) return;
    return next();
  });

  bot.command('start', ctx => ctx.reply(
    record.template === 'groups' ? '🛡️ أهلاً بك في بوت إدارة المجموعات.' :
    record.template === 'contact' ? '📩 أهلاً بك في بوت التواصل. أرسل رسالتك.' :
    '✨ أهلاً بك في بوت الزخرفة. أرسل النص.'
  ));

  bot.callbackQuery('subscription:check', async ctx => {
    await ctx.answerCallbackQuery();
    if (await requiredCheck(bot,ctx,db)) await ctx.reply('✅ تم التحقق من الاشتراك.');
  });

  bot.on('message:text', async ctx => {
    if (record.template === 'decor') {
      return ctx.reply(decorated(ctx.message.text));
    }
    if (record.template === 'contact') {
      if (ctx.from.id !== record.owner_user_id) {
        await bot.api.sendMessage(record.owner_user_id, `📩 رسالة من ${ctx.from.id}\\n\\n${ctx.message.text}`);
        return ctx.reply('✅ وصلت رسالتك إلى صاحب البوت.');
      }
      return;
    }
    return groupsTemplate(bot,ctx,record,db);
  });

  bot.catch(err => {
    const e = err.error;
    console.error(`Managed bot #${record.id}:`, e instanceof GrammyError ? e.description : e?.message || e);
  });

  runtimes.set(record.id,bot);
  return bot;
}

export async function startManagedBot(record,db) {
  const bot = createManagedBot(record,db);
  await bot.api.deleteWebhook({drop_pending_updates:false});
  db.markBotStarted(record.id);
  bot.start({onStart:info=>console.log(`Managed @${info.username} started`)});
  return bot;
}

export function getRuntimeBots() { return runtimes; }
