import { Bot, GrammyError, InlineKeyboard, InputFile } from 'grammy';
import QRCode from 'qrcode';

const runtimes = new Map();
const replyStates = new Map();
const qrStates = new Map();

export async function verifyBotToken(token) {
  const b = new Bot(token);
  return await b.api.getMe();
}

function decorated(text) {
  return [
    `『 ${text} 』`, `★彡 ${text} 彡★`, `𓆩 ${text} 𓆪`,
    `【 ${text} 】`, `꧁ ${text} ꧂`, `⟦ ${text} ⟧`
  ].join('\n');
}

function templateLabel(t) {
  return t === 'groups' ? '🛡️ إدارة المجموعات' : t === 'contact' ? '📩 بوت تواصل' : t === 'decor' ? '✨ بوت زخرفة' : '🔳 بوت QR';
}

const QR_TYPES = {
  text: '📝 نص', url: '🔗 رابط', phone: '📞 رقم هاتف', email: '📧 إيميل', wifi: '📶 Wi‑Fi',
  contact: '👤 جهة اتصال', sms: '💬 رسالة SMS', location: '📍 موقع', whatsapp: '🟢 واتساب', image: '🖼️ رابط صورة'
};

function escapeWifi(value = '') {
  return value.replace(/[\\;,:"]/g, '\\$&');
}

function makeQrPayload(type, text) {
  const v = text.trim();
  if (!v) throw new Error('أرسل البيانات أولًا.');
  if (type === 'text') return v;
  if (type === 'url') return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  if (type === 'phone') return `tel:${v.replace(/[^+0-9]/g, '')}`;
  if (type === 'email') return `mailto:${v}`;
  if (type === 'wifi') {
    const parts = v.split('|');
    if (parts.length < 2) throw new Error('اكتب: اسم الشبكة|كلمة المرور|WPA');
    return `WIFI:T:${parts[2] || 'WPA'};S:${escapeWifi(parts[0])};P:${escapeWifi(parts[1])};;`;
  }
  if (type === 'contact') {
    const parts = v.split('|');
    return `BEGIN:VCARD\nVERSION:3.0\nFN:${parts[0] || ''}\nTEL:${parts[1] || ''}\nEMAIL:${parts[2] || ''}\nEND:VCARD`;
  }
  if (type === 'sms') {
    const parts = v.split('|');
    if (!parts[0]) throw new Error('اكتب: الرقم|نص الرسالة');
    return `SMSTO:${parts[0]}:${parts.slice(1).join('|')}`;
  }
  if (type === 'location') {
    const parts = v.split(',');
    if (parts.length < 2) throw new Error('اكتب: latitude,longitude');
    return `geo:${parts[0].trim()},${parts[1].trim()}`;
  }
  if (type === 'whatsapp') {
    const phone = v.replace(/[^0-9]/g, '');
    if (!phone) throw new Error('أرسل رقم واتساب مع رمز الدولة.');
    return `https://wa.me/${phone}`;
  }
  if (type === 'image') {
    if (!/^https?:\/\//i.test(v)) throw new Error('أرسل رابط الصورة المباشر.');
    return v;
  }
  return v;
}

async function sendQr(ctx, type, raw) {
  const payload = makeQrPayload(type, raw);
  const buffer = await QRCode.toBuffer(payload, { errorCorrectionLevel: 'M', width: 900, margin: 2 });
  return ctx.replyWithPhoto(new InputFile(buffer, 'qr.png'), { caption: `✅ تم إنشاء رمز QR\n\n${QR_TYPES[type] || 'QR'}` });
}

function userLabel(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'بدون اسم';
  const username = user.username ? `@${user.username}` : 'بدون معرف';
  return `👤 ${name}\n🔹 المعرف: ${username}\n🆔 ID: ${user.id}`;
}

async function requiredCheck(bot, ctx, db) {
  const chats = db.listRequired();
  if (!ctx.from || !chats.length) return true;
  const missing = [];
  for (const c of chats) {
    try {
      const m = await bot.api.getChatMember(c.chat_id, ctx.from.id);
      if (['left','kicked'].includes(m.status)) missing.push(c);
    } catch {
      missing.push(c);
    }
  }
  if (!missing.length) return true;
  const kb = new InlineKeyboard();
  for (const c of missing) if (c.invite_url) kb.url(`📢 ${c.title || 'الاشتراك المطلوب'}`, c.invite_url).row();
  kb.text('✅ تحقق من الاشتراك', 'subscription:check');
  await ctx.reply(
    '🔒 **الاشتراك مطلوب قبل استخدام البوت**\n\nلإكمال الاستخدام، اشترك في الجهات المطلوبة ثم اضغط «تحقق من الاشتراك».',
    { parse_mode:'Markdown', reply_markup:kb }
  );
  return false;
}

async function isAdmin(bot, chatId, userId) {
  const m = await bot.api.getChatMember(chatId, userId).catch(() => null);
  return Boolean(m && ['administrator','creator'].includes(m.status));
}

async function groupsTemplate(bot, ctx, record, db) {
  const text = ctx.message?.text || '';
  if (ctx.chat.type === 'private') {
    if (text === '/help') return ctx.reply('🛡️ **مساعدة إدارة المجموعات**\n\nأضف البوت إلى مجموعتك وارفعه مشرفًا.\n\nالأوامر:\n/admins — معلومات الإدارة\n/rules — القوانين\n/lock — قفل المحادثة\n/unlock — فتح المحادثة\n/ban — حظر عضو بالرد\n/mute — كتم عضو بالرد\n/unmute — إلغاء الكتم\n/game — لعبة بسيطة', {parse_mode:'Markdown'});
    return ctx.reply('🛡️ **بوت إدارة المجموعات**\n\nأضفني إلى مجموعتك، ثم امنحني صلاحيات الإدارة المناسبة لتفعيل الحماية والأوامر.', {parse_mode:'Markdown'});
  }

  if (text === '/rules') return ctx.reply(db.getBotSetting(record.id,'rules') || '📜 لم يتم تعيين قوانين لهذه المجموعة بعد.');
  if (text === '/game') return ctx.reply(`🎮 خمن رقمًا من 1 إلى 3!\n\n🎯 الرقم العشوائي: ${Math.floor(Math.random()*3)+1}`);
  if (['/lock','/unlock'].includes(text)) {
    if (!(await isAdmin(bot,ctx.chat.id,ctx.from.id))) return ctx.reply('❌ هذا الأمر للمشرفين فقط.');
    try {
      const locked = text === '/lock';
      await bot.api.setChatPermissions(ctx.chat.id, {
        can_send_messages: !locked,
        can_send_audios: !locked, can_send_documents: !locked, can_send_photos: !locked,
        can_send_videos: !locked, can_send_video_notes: !locked, can_send_voice_notes: !locked,
        can_send_polls: !locked, can_send_other_messages: !locked, can_add_web_page_previews: !locked,
        can_change_info: false, can_invite_users: !locked, can_pin_messages: false
      });
      return ctx.reply(locked ? '🔒 تم قفل المحادثة.' : '🔓 تم فتح المحادثة.');
    } catch { return ctx.reply('❌ تعذر تنفيذ الأمر. تأكد من أن البوت مشرف ولديه الصلاحيات اللازمة.'); }
  }

  if (['/ban','/mute','/unmute'].includes(text)) {
    if (!(await isAdmin(bot,ctx.chat.id,ctx.from.id))) return ctx.reply('❌ هذا الأمر للمشرفين فقط.');
    const replied = ctx.msg.reply_to_message;
    if (!replied?.from) return ctx.reply('↩️ استخدم الأمر بالرد على رسالة العضو المطلوب.');
    try {
      if (text === '/ban') {
        await bot.api.banChatMember(ctx.chat.id,replied.from.id);
        return ctx.reply('🚫 تم حظر العضو.');
      }
      const until = Math.floor(Date.now()/1000) + 3600;
      if (text === '/mute') {
        await bot.api.restrictChatMember(ctx.chat.id,replied.from.id,{permissions:{can_send_messages:false},until_date:until});
        return ctx.reply('🔇 تم كتم العضو لمدة ساعة.');
      }
      await bot.api.restrictChatMember(ctx.chat.id,replied.from.id,{permissions:{can_send_messages:true,can_send_audios:true,can_send_documents:true,can_send_photos:true,can_send_videos:true,can_send_video_notes:true,can_send_voice_notes:true,can_send_polls:true,can_send_other_messages:true,can_add_web_page_previews:true}});
      return ctx.reply('🔊 تم إلغاء الكتم.');
    } catch { return ctx.reply('❌ تعذر تنفيذ الإجراء. تحقق من صلاحيات البوت.'); }
  }

  if (/https?:\/\/|t\.me\//i.test(text)) {
    try {
      if (!(await isAdmin(bot,ctx.chat.id,ctx.from.id))) {
        await bot.api.deleteMessage(ctx.chat.id,ctx.msg.message_id);
        return ctx.reply('🚫 تم حذف الرابط لأن حماية الروابط مفعلة.');
      }
    } catch {}
  }

  for (const c of db.listCommands(record.id)) {
    if (text === c.command || text === `/${c.command.replace(/^\//,'')}`) return ctx.reply(c.response);
  }
}

async function sendContactToOwner(bot, ctx, record, db) {
  const user = ctx.from;
  if (db.isContactBlocked(record.id,user.id)) return ctx.reply('🚫 لا يمكنك إرسال رسائل إلى هذا البوت حاليًا.');
  const type = ctx.msg.photo ? 'photo' : ctx.msg.video ? 'video' : ctx.msg.document ? 'document' : ctx.msg.voice ? 'voice' : ctx.msg.audio ? 'audio' : 'text';
  db.recordContact({botId:record.id,userId:user.id,username:user.username,firstName:user.first_name,messageType:type,messageId:ctx.msg.message_id});
  const kb = new InlineKeyboard()
    .text('↩️ رد على المستخدم', `contact:reply:${record.id}:${user.id}`)
    .text('🚫 حظر', `contact:block:${record.id}:${user.id}`);
  await bot.api.sendMessage(record.owner_user_id,
    `📩 **رسالة جديدة — ${record.username ? '@'+record.username : 'بوت '+record.id}**\n\n${userLabel(user)}\n\n📎 النوع: ${type}`,
    {parse_mode:'Markdown',reply_markup:kb}
  );
  await bot.api.copyMessage(record.owner_user_id, ctx.chat.id, ctx.msg.message_id);
  return ctx.reply('✅ تم استلام رسالتك وإرسالها إلى صاحب البوت.\n\nسيتم الرد عليك هنا عند توفر الرد.');
}

function welcomeText(record, db) {
  const custom = db.getBotSetting(record.id,'welcome');
  if (custom) return custom;
  if (record.template === 'contact') return `📩 **مرحبًا بك في بوت التواصل**\n\nأرسل رسالتك هنا، وستصل مباشرة إلى صاحب البوت.\n\n✉️ يمكنك إرسال نص أو صورة أو ملف أو صوت.\n\nنحن نحافظ على بياناتك ولا نشاركها خارج صاحب البوت.`;
  if (record.template === 'decor') return '✨ **بوت الزخرفة**\n\nأرسل اسمًا أو كلمة وسأعرض لك زخارف جاهزة.';
  if (record.template === 'qr') return '🔳 **بوت QR**\n\nحوّل النصوص والروابط والأرقام وWi‑Fi والإيميل وجهة الاتصال وSMS والموقع وواتساب ورابط الصورة إلى QR.\n\nاستخدم /qr للبدء.';
  return '🛡️ **بوت إدارة المجموعات**\n\nأضفني إلى مجموعتك وارفعني مشرفًا للبدء.';
}

export function createManagedBot(record, db) {
  if (runtimes.has(record.id)) return runtimes.get(record.id);
  const bot = new Bot(record.token);

  bot.use(async (ctx,next) => {
    if (ctx.from) db.touchBotUser(record.id,ctx.from);
    if (ctx.from?.id === record.owner_user_id) return next();
    if (ctx.callbackQuery?.data === 'subscription:check') return next();
    if (!(await requiredCheck(bot,ctx,db))) return;
    return next();
  });

  bot.command('start', ctx => ctx.reply(welcomeText(record,db), {parse_mode:'Markdown'}));
  bot.command('help', ctx => ctx.reply(welcomeText(record,db), {parse_mode:'Markdown'}));

  bot.callbackQuery('subscription:check', async ctx => {
    await ctx.answerCallbackQuery();
    if (await requiredCheck(bot,ctx,db)) await ctx.reply('✅ تم التحقق من اشتراكك. يمكنك الآن استخدام البوت.');
  });

  if (record.template === 'qr') {
    bot.command('qr', async ctx => {
      const { qrKeyboard } = await import('./keyboards.js');
      await ctx.reply('🔳 **بوت QR**\n\nاختر ما تريد تحويله إلى صورة QR:', { parse_mode: 'Markdown', reply_markup: qrKeyboard });
    });
    bot.callbackQuery(/^qr:(text|url|phone|email|wifi|contact|sms|location|whatsapp|image)$/, async ctx => {
      const type = ctx.match[1];
      qrStates.set(`${record.id}:${ctx.from.id}`, type);
      await ctx.answerCallbackQuery();
      const examples = {
        text: 'أرسل النص.', url: 'أرسل الرابط.', phone: 'أرسل رقم الهاتف.', email: 'أرسل الإيميل.',
        wifi: 'اكتب: اسم الشبكة|كلمة المرور|WPA', contact: 'اكتب: الاسم|رقم الهاتف|الإيميل',
        sms: 'اكتب: الرقم|نص الرسالة', location: 'اكتب: latitude,longitude',
        whatsapp: 'أرسل رقم الواتساب مع رمز الدولة.', image: 'أرسل رابط الصورة المباشر.'
      };
      await ctx.reply(`${QR_TYPES[type]}\n\n${examples[type]}\n\n/cancel للإلغاء.`);
    });
  }

  bot.callbackQuery(/^contact:reply:(\d+):(\d+)$/, async ctx => {
    const botId = Number(ctx.match[1]), userId = Number(ctx.match[2]);
    if (botId !== record.id || ctx.from.id !== record.owner_user_id) return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    replyStates.set(`${record.id}:${ctx.from.id}`,{userId});
    await ctx.answerCallbackQuery();
    await ctx.reply(`↩️ **الرد على المستخدم**\n\n🆔 ${userId}\n\nأرسل الآن رسالتك، ويمكنك إرسال نص أو صورة أو ملف أو صوت.\n\nلإلغاء الرد أرسل /cancel`,{parse_mode:'Markdown'});
  });

  bot.callbackQuery(/^contact:block:(\d+):(\d+)$/, async ctx => {
    const botId = Number(ctx.match[1]), userId = Number(ctx.match[2]);
    if (botId !== record.id || ctx.from.id !== record.owner_user_id) return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    db.blockContact(record.id,userId);
    await ctx.answerCallbackQuery({text:'تم الحظر'});
    await ctx.reply(`🚫 تم حظر المستخدم ${userId} من التواصل مع هذا البوت.`);
  });

  bot.callbackQuery(/^contact:unblock:(\d+):(\d+)$/, async ctx => {
    const botId = Number(ctx.match[1]), userId = Number(ctx.match[2]);
    if (botId !== record.id || ctx.from.id !== record.owner_user_id) return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    db.unblockContact(record.id,userId);
    await ctx.answerCallbackQuery({text:'تم إلغاء الحظر'});
    await ctx.reply(`♻️ تم إلغاء حظر المستخدم ${userId}.`);
  });

  bot.on('message', async ctx => {
    if (!ctx.from) return;

    if (record.template === 'qr' && ctx.chat.type === 'private' && ctx.message.text) {
      const qkey = `${record.id}:${ctx.from.id}`;
      const qtype = qrStates.get(qkey);
      if (qtype) {
        if (ctx.message.text === '/cancel') {
          qrStates.delete(qkey);
          return ctx.reply('↩️ تم الإلغاء.');
        }
        try {
          qrStates.delete(qkey);
          return await sendQr(ctx, qtype, ctx.message.text);
        } catch (e) {
          return ctx.reply(`❌ ${e?.message || 'تعذر إنشاء رمز QR.'}`);
        }
      }
    }

    if (ctx.from.id === record.owner_user_id && ctx.chat.type === 'private') {
      const key = `${record.id}:${ctx.from.id}`;
      const state = replyStates.get(key);
      if (state) {
        if (ctx.message.text === '/cancel') {
          replyStates.delete(key);
          return ctx.reply('↩️ تم إلغاء وضع الرد.');
        }
        try {
          await bot.api.copyMessage(state.userId,ctx.chat.id,ctx.msg.message_id);
          replyStates.delete(key);
          return ctx.reply('✅ تم إرسال الرد إلى المستخدم.');
        } catch {
          replyStates.delete(key);
          return ctx.reply('❌ تعذر إرسال الرد. قد يكون المستخدم حظر البوت.');
        }
      }
      return;
    }

    if (record.template === 'contact') {
      if (ctx.chat.type !== 'private') return;
      return sendContactToOwner(bot,ctx,record,db);
    }

    if (record.template === 'decor') {
      if (ctx.message.text) return ctx.reply(decorated(ctx.message.text));
      return;
    }

    if (ctx.chat.type !== 'private' || ctx.message.text) return groupsTemplate(bot,ctx,record,db);
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

export async function startAllManagedBots(db) {
  for (const record of db.listActiveBots()) {
    try { await startManagedBot(record,db); }
    catch (e) { db.setBotStatus(record.id,'error'); console.error(`Failed to start managed bot #${record.id}:`,e?.message || e); }
  }
}


export async function setManagedBotProfile(record, displayName) {
  const bot = runtimes.get(record.id) || new Bot(record.token);
  if (displayName) {
    await bot.api.setMyName({name: displayName});
    await bot.api.setMyDescription({description: `بوت ${displayName} يعمل عبر منصة صانع البوتات.`});
    await bot.api.setMyShortDescription({short_description: displayName.slice(0,120)});
  }
}

export function getRuntimeBots() { return runtimes; }
