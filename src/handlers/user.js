import { verifyBotToken, startManagedBot, setManagedBotProfile, getRuntimeBots } from '../bot-manager.js';
import { InlineKeyboard } from 'grammy';
import { mainKeyboard, templateKeyboard, adminKeyboard, backKeyboard } from '../keyboards.js';

const pending = new Map();
const ownerBotState = new Map();

const botFather = 'https://t.me/BotFather';
const templateNames = {groups:'🛡️ إدارة المجموعات',contact:'📩 بوت تواصل',decor:'✨ بوت زخرفة',qr:'🔳 بوت QR'};

function startText() {
  return '🤖 **أهلًا بك في صانع البوتات**\n\nأنشئ بوتك واختر القالب المناسب لك.\n\nكل الخطوات بسيطة وواضحة.';
}

function creationGuide(template) {
  return `🚀 **إنشاء ${templateNames[template]}**\n\n1️⃣ أنشئ البوت من BotFather.\n2️⃣ اضغط «كيفية إحضار التوكن» إذا تحتاج شرحًا.\n3️⃣ أرسل اسم البوت هنا.\n4️⃣ بعدها أرسل الـ Token.\n\n🔐 لا تشارك Token مع أي شخص.\n\nالقالب: ${templateNames[template]}`;
}


async function showMyBots(ctx,db) {
  const bots=db.listOwnerBots(ctx.from.id);
  if(!bots.length) return ctx.reply('📭 ما عندك بوتات بعد.\n\nاضغط «🤖 إنشاء بوت» للبدء.',{reply_markup:backKeyboard});
  const lines=bots.map((b,i)=>`${i+1}. @${b.username||'-'}\n   🧩 ${templateNames[b.template]||b.template}\n   🟢 ${b.status}\n   👥 ${db.botUserCount(b.id)}`);
  return ctx.reply(`🤖 **بوتاتك**\n\n${lines.join('\n\n')}`,{parse_mode:'Markdown',reply_markup:backKeyboard});
}

async function showManageBots(ctx,db) {
  const bots=db.listOwnerBots(ctx.from.id);
  if(!bots.length) return ctx.reply('📭 ما عندك بوتات بعد.',{reply_markup:backKeyboard});
  const kb=new InlineKeyboard();
  for(const b of bots) kb.text(`@${b.username||b.id}`,`ownerbot:${b.id}`).row();
  kb.text('⬅️ الرئيسية','menu:home');
  return ctx.reply('⚙️ **اختر البوت الذي تريد إدارته**',{parse_mode:'Markdown',reply_markup:kb});
}

export function registerUserHandlers(bot,db) {
  bot.command('start', async ctx => {
    const kb = new InlineKeyboard()
      .text('🤖 إنشاء بوت','menu:create').text('🤖 بوتاتي','menu:mybots').row()
      .text('📊 إحصائياتي','menu:stats').text('⚙️ إدارة بوتاتي','menu:manage').row()
      .text('ℹ️ المساعدة','menu:help');
    if (ctx.from.id === Number(process.env.OWNER_ID)) kb.row().text('👑 لوحة المالك','menu:admin');
    await ctx.reply(startText(),{parse_mode:'Markdown',reply_markup:kb});
  });

  bot.callbackQuery('menu:home', async ctx => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('🤖 إنشاء بوت','menu:create').text('🤖 بوتاتي','menu:mybots').row().text('📊 إحصائياتي','menu:stats').text('⚙️ إدارة بوتاتي','menu:manage').row().text('ℹ️ المساعدة','menu:help');
    if (ctx.from.id === Number(process.env.OWNER_ID)) kb.row().text('👑 لوحة المالك','menu:admin');
    return ctx.reply(startText(),{parse_mode:'Markdown',reply_markup:kb});
  });

  bot.callbackQuery('menu:admin', async ctx => {
    if (ctx.from.id !== Number(process.env.OWNER_ID)) return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    await ctx.answerCallbackQuery();
    return ctx.reply('👑 **لوحة المالك**\n\nاختر ما تريد:',{parse_mode:'Markdown',reply_markup:adminKeyboard});
  });

  bot.callbackQuery('menu:create', async ctx => {
    await ctx.answerCallbackQuery();
    pending.set(ctx.from.id,{step:'template'});
    return ctx.reply('🧩 **اختر قالب البوت**\n\nاختر القالب الذي يناسبك:',{parse_mode:'Markdown',reply_markup:templateKeyboard});
  });

  bot.callbackQuery('menu:mybots', async ctx => {
    await ctx.answerCallbackQuery();
    return showMyBots(ctx,db);
  });

  bot.callbackQuery('menu:stats', async ctx => {
    await ctx.answerCallbackQuery();
    const bots=db.listOwnerBots(ctx.from.id);
    const users=bots.reduce((n,b)=>n+db.botUserCount(b.id),0);
    const messages=bots.reduce((n,b)=>n+db.contactCount(b.id),0);
    return ctx.reply(`📊 **إحصائياتك**\n\n🤖 البوتات: ${bots.length}\n👥 المستخدمون: ${users}\n📩 الرسائل: ${messages}`,{parse_mode:'Markdown',reply_markup:backKeyboard});
  });

  bot.callbackQuery('menu:manage', async ctx => {
    await ctx.answerCallbackQuery();
    return showManageBots(ctx,db);
  });

  bot.callbackQuery('menu:help', async ctx => {
    await ctx.answerCallbackQuery();
    return ctx.reply('ℹ️ **مساعدة**\n\n🤖 إنشاء بوت: اختر قالبًا ثم أرسل الاسم والـToken.\n\n🔐 كيفية إحضار التوكن: افتح BotFather، أرسل /newbot، أنشئ البوت، ثم انسخ Token وأرسله هنا.\n\n📌 بوت QR: يحول النص، الرابط، الرقم، Wi‑Fi، الإيميل، جهة الاتصال، SMS، الموقع، واتساب ورابط الصورة إلى QR.\n\n⚠️ لا ترسل Token لأي شخص.',{parse_mode:'Markdown',reply_markup:new InlineKeyboard().url('🤖 فتح BotFather',botFather).text('🔐 كيفية إحضار التوكن','help:token').row().text('⬅️ الرئيسية','menu:home')});
  });

  bot.callbackQuery('help:token', async ctx => {
    await ctx.answerCallbackQuery();
    return ctx.reply('🔐 **كيفية إحضار التوكن**\n\n1️⃣ افتح BotFather.\n2️⃣ أرسل /newbot.\n3️⃣ اكتب اسم البوت.\n4️⃣ اكتب Username ينتهي بـ bot.\n5️⃣ سيظهر لك Token.\n6️⃣ انسخه كاملًا وأرسله هنا.\n\n⚠️ لا تشارك Token مع أي شخص.',{parse_mode:'Markdown',reply_markup:new InlineKeyboard().url('🤖 فتح BotFather',botFather).text('⬅️ رجوع','menu:help')});
  });

  bot.hears('👑 لوحة المالك', async ctx => {
    if (ctx.from.id !== Number(process.env.OWNER_ID)) return;
    await ctx.reply('👑 **لوحة تحكم منصة صانع البوتات**\n\nاختر العملية التي تريد تنفيذها:', {parse_mode:'Markdown', reply_markup:adminKeyboard});
  });

  bot.hears('🤖 إنشاء بوت',async ctx=>{
    pending.set(ctx.from.id,{step:'template'});
    await ctx.reply('🧩 **اختر نوع البوت الذي تريد إنشاءه**\n\nكل بوت يتم إنشاؤه يكون مستقلًا عن بقية البوتات، وله مستخدموه وإعداداته الخاصة.',{parse_mode:'Markdown',reply_markup:templateKeyboard});
  });

  bot.callbackQuery(/^template:(groups|contact|decor|qr)$/,async ctx=>{
    const template=ctx.match[1];
    pending.set(ctx.from.id,{step:'name',template});
    await ctx.answerCallbackQuery();
    await ctx.reply(creationGuide(template),{parse_mode:'Markdown'});
  });

  bot.on('message:text', async ctx => {
    const p = pending.get(ctx.from.id);
    if (!p) return;

    const text = ctx.message.text.trim();

    if (p.step === 'name') {
      if (text.length < 2 || text.length > 64) {
        return ctx.reply('❌ اسم البوت غير مناسب. أرسله بين حرفين و64 حرفًا.');
      }
      pending.set(ctx.from.id, { ...p, step: 'token', name: text });
      const kb = new InlineKeyboard().url('🤖 فتح BotFather', botFather).text('🔐 كيفية إحضار التوكن','help:token');
      return ctx.reply(
        `✅ **تم حفظ اسم البوت**\n\n🤖 الاسم: ${text.replace(/([_\\*\\[\]`])/g,'\\$1')}\n\nالخطوة الأخيرة هي ربط البوت الذي أنشأته في BotFather.\n\n🔐 أرسل الآن **Token** الذي أعطاك إياه BotFather.\n\n⚠️ لا ترسل Token بوت المنصة، ولا تنشر Token الخاص ببوتك في أي مكان.`,
        { parse_mode:'Markdown', reply_markup:kb }
      );
    }

    if (p.step === 'token') {
      const token = text;
      if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
        return ctx.reply('❌ صيغة الـToken تبدو غير صحيحة. انسخه كاملًا من BotFather وأرسله مرة أخرى.');
      }
      try {
        await ctx.reply('⏳ **جاري التحقق من Token...**\n\nسأتحقق من البوت ثم أشغّله تلقائيًا. لا ترسل الرسالة مرة أخرى أثناء التحقق.', {parse_mode:'Markdown'});
        const me = await verifyBotToken(token);
        const existing = db.findBotByTelegramId?.(me.id);
        if (existing) return ctx.reply(`⚠️ هذا البوت مرتبط مسبقًا بالمنصة كـ @${existing.username || me.username}.`);
        const id = db.addBot({ownerUserId:ctx.from.id,token,botId:me.id,username:me.username,firstName:me.first_name,template:p.template});
        const record = db.getBot(id);
        await startManagedBot(record,db);
        try { await setManagedBotProfile(record,p.name); } catch (e) { console.error(`Profile setup failed for bot #${id}:`,e?.message||e); }
        db.setBotSetting(id,'display_name',p.name);
        pending.delete(ctx.from.id);
        const kb = new InlineKeyboard().url('🤖 فتح البوت', `https://t.me/${me.username}`).row().text('⚙️ إدارة بوتاتي','noop');
        return ctx.reply(`🎉 **تم إنشاء البوت بنجاح**\n\n🤖 البوت: @${me.username}\n📝 الاسم: ${p.name}\n🧩 النوع: ${templateNames[p.template]}\n🟢 الحالة: يعمل الآن\n\nهذا البوت مستقل عن بقية البوتات، ومستخدموه ورسائلهم مرتبطة بصاحب هذا البوت فقط.`, {parse_mode:'Markdown',reply_markup:kb});
      } catch (e) {
        console.error('Create bot failed:',e);
        return ctx.reply(`❌ **تعذر إنشاء البوت**\n\n${e?.description || e?.message || 'تعذر التحقق من Token'}\n\nتأكد من أن Token كامل وصحيح ثم أرسله مرة أخرى.` , {parse_mode:'Markdown'});
      }
    }
  });

  bot.callbackQuery('noop', ctx => ctx.answerCallbackQuery());

  bot.hears('🤖 بوتاتي',async ctx=>{
    const bots=db.listOwnerBots(ctx.from.id);
    if(!bots.length) return ctx.reply('📭 لا توجد لديك بوتات حتى الآن.\n\nاضغط «🤖 إنشاء بوت» للبدء.',{reply_markup:mainKeyboard});
    const lines=bots.map((b,i)=>`${i+1}. @${b.username||'-'}\n   🧩 ${templateNames[b.template]||b.template}\n   🟢 ${b.status}\n   👥 ${db.botUserCount(b.id)} مستخدم\n   📩 ${db.contactCount(b.id)} رسالة`);
    await ctx.reply(`🤖 **بوتاتك**\n\n${lines.join('\n\n')}`,{parse_mode:'Markdown'});
  });

  bot.hears('⚙️ إدارة بوتاتي',async ctx=>{
    const bots=db.listOwnerBots(ctx.from.id);
    if(!bots.length) return ctx.reply('📭 لا توجد لديك بوتات.');
    const kb = new InlineKeyboard();
    for (const b of bots) kb.text(`@${b.username||b.id}`,`ownerbot:${b.id}`).row();
    await ctx.reply('⚙️ **اختر البوت الذي تريد إدارته**',{parse_mode:'Markdown',reply_markup:kb});
  });

  bot.callbackQuery(/^ownerbot:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]);
    const b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id) return ctx.answerCallbackQuery({text:'هذا البوت ليس لك',show_alert:true});
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('📊 إحصائيات البوت',`ownerbot:stats:${id}`).row()
      .text('📢 إذاعة لمستخدمي البوت',`ownerbot:announce:${id}`).row()
      .text('✏️ رسالة الترحيب',`ownerbot:welcome:${id}`);
    await ctx.reply(`⚙️ **إدارة @${b.username||'-'}**\n\n🧩 القالب: ${templateNames[b.template]}\n🟢 الحالة: ${b.status}\n👥 المستخدمون: ${db.botUserCount(id)}\n📩 الرسائل: ${db.contactCount(id)}`,{parse_mode:'Markdown',reply_markup:kb});
  });

  bot.callbackQuery(/^ownerbot:stats:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]), b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id) return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    await ctx.answerCallbackQuery();
    await ctx.reply(`📊 **@${b.username}**\n\n👥 المستخدمون: ${db.botUserCount(id)}\n📩 رسائل التواصل: ${db.contactCount(id)}\n🟢 الحالة: ${b.status}` ,{parse_mode:'Markdown'});
  });

  bot.callbackQuery(/^ownerbot:announce:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]), b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id) return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    if(!getRuntimeBots().has(id)) return ctx.answerCallbackQuery({text:'البوت غير محمل حاليًا',show_alert:true});
    ownerBotState.set(ctx.from.id,{botId:id});
    await ctx.answerCallbackQuery();
    await ctx.reply('📢 **إذاعة خاصة بهذا البوت**\n\nلإرسال رسالة نصية إلى جميع مستخدميه، أرسل الرسالة الآن.\n\nملاحظة: الوسائط يمكن إرسالها من داخل بوتك نفسه عبر أمر /broadcast لاحقًا.');
  });

  bot.callbackQuery(/^ownerbot:welcome:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]), b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id) return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    ownerBotState.set(ctx.from.id,{botId:id,step:'welcome'});
    await ctx.answerCallbackQuery();
    await ctx.reply('✏️ أرسل رسالة الترحيب الجديدة. سيتم استخدامها عند إرسال /start إلى هذا البوت.');
  });

  bot.hears('📊 إحصائياتي',async ctx=>{
    const bots=db.listOwnerBots(ctx.from.id);
    const users=bots.reduce((n,b)=>n+db.botUserCount(b.id),0);
    const messages=bots.reduce((n,b)=>n+db.contactCount(b.id),0);
    await ctx.reply(`📊 **إحصائياتك**\n\n🤖 عدد البوتات: ${bots.length}\n👥 إجمالي المستخدمين: ${users}\n📩 رسائل التواصل: ${messages}`,{parse_mode:'Markdown'});
  });

  bot.on('message:text',async ctx=>{
    const st=ownerBotState.get(ctx.from.id);
    if(!st) return;
    const b=db.getBot(st.botId);
    if(!b || b.owner_user_id!==ctx.from.id) { ownerBotState.delete(ctx.from.id); return; }
    const runtime=getRuntimeBots().get(st.botId);
    if(st.step==='welcome') {
      db.setBotSetting(st.botId,'welcome',ctx.message.text);
      ownerBotState.delete(ctx.from.id);
      return ctx.reply('✅ تم تحديث رسالة الترحيب الخاصة بهذا البوت.');
    }
    ownerBotState.delete(ctx.from.id);
    if(!runtime) return ctx.reply('❌ البوت غير محمل حاليًا.');
    const users=db.getBroadcastUsers('bot',st.botId);
    let sent=0,failed=0;
    for(const userId of users){ try { await runtime.api.sendMessage(userId,ctx.message.text); sent++; } catch { failed++; } if((sent+failed)%20===0) await new Promise(r=>setTimeout(r,1000)); }
    return ctx.reply(`📢 اكتملت الإذاعة الخاصة بـ @${b.username}\n\n👥 الإجمالي: ${users.length}\n✅ تم: ${sent}\n❌ فشل: ${failed}`);
  });

  bot.hears('ℹ️ المساعدة',ctx=>ctx.reply('ℹ️ **طريقة إنشاء بوت**\n\n1. اضغط «🤖 إنشاء بوت».\n2. اختر القالب.\n3. افتح BotFather من الرابط الذي سيظهر لك.\n4. أنشئ البوت باستخدام /newbot.\n5. انسخ Token وأرسله للمنصة.\n6. بعد التحقق سيبدأ بوتك تلقائيًا.\n\n🔐 كل بوت يتم إنشاؤه يبقى مستقلًا عن البوتات الأخرى.',{parse_mode:'Markdown'}));
}
