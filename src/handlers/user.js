import { verifyBotToken, startManagedBot, setManagedBotProfile, getRuntimeBots } from '../bot-manager.js';
import { InlineKeyboard } from 'grammy';
import { mainKeyboard, templateKeyboard } from '../keyboards.js';

const pending = new Map();
const ownerBotState = new Map();

const botFather = 'https://t.me/BotFather';
const templateNames = {groups:'🛡️ إدارة المجموعات',contact:'📩 بوت تواصل',decor:'✨ بوت زخرفة'};

function startText() {
  return '🤖 **مرحبًا بك في منصة صانع البوتات**\n\nمن هنا يمكنك إنشاء بوتك الخاص خلال دقائق، وإدارته من نفس المكان.\n\nاختر الخدمة التي تريدها من القائمة بالأسفل.';
}

function creationGuide(template) {
  return `🚀 **إنشاء ${templateNames[template]}**\n\nالخطوة 1️⃣ — أنشئ البوت في Telegram\n\nاضغط على **BotFather** لفتح أداة إنشاء البوتات:\n\n🔗 ${botFather}\n\nمن داخل BotFather:\n• أرسل /newbot\n• اكتب اسم البوت الذي تريده.\n• اختر Username ينتهي بـ bot.\n• سيعطيك BotFather رمزًا يسمى **Token**.\n\nالخطوة 2️⃣ — عد إلى هنا\n\n📌 سأطلب منك أولًا **اسم البوت**، ثم **Token** الذي حصلت عليه من BotFather.\n\n⚠️ لا ترسل Token بوت المنصة، ولا تشاركه مع أي شخص.\n\nالنوع المختار: ${templateNames[template]}`;
}

export function registerUserHandlers(bot,db) {
  bot.command('start', async ctx => ctx.reply(startText(),{parse_mode:'Markdown',reply_markup:mainKeyboard}));

  bot.hears('🤖 إنشاء بوت',async ctx=>{
    pending.set(ctx.from.id,{step:'template'});
    await ctx.reply('🧩 **اختر نوع البوت الذي تريد إنشاءه**\n\nكل بوت يتم إنشاؤه يكون مستقلًا عن بقية البوتات، وله مستخدموه وإعداداته الخاصة.',{parse_mode:'Markdown',reply_markup:templateKeyboard});
  });

  bot.callbackQuery(/^template:(groups|contact|decor)$/,async ctx=>{
    const template=ctx.match[1];
    pending.set(ctx.from.id,{step:'name',template});
    await ctx.answerCallbackQuery();
    await ctx.reply(creationGuide(template),{parse_mode:'Markdown'});
  });

  bot.on('message:text',async ctx=>{
    const p=pending.get(ctx.from.id);
    if(!p || p.step!=='name') return;
    const name=ctx.message.text.trim();
    if(name.length<2 || name.length>64) return ctx.reply('❌ اسم البوت يجب أن يكون بين حرفين و64 حرفًا. أرسل الاسم مرة أخرى.');
    pending.set(ctx.from.id,{step:'token',template:p.template,name});
    await ctx.reply(`✅ تم حفظ اسم البوت: **${name.replace(/([_*\[\]`])/g,'\\$1')}**\n\nالخطوة الأخيرة: أرسل الآن **Token** الذي حصلت عليه من BotFather.`,{parse_mode:'Markdown'});
  });

  bot.on('message:text',async ctx=>{
    const p=pending.get(ctx.from.id);
    if(!p || p.step!=='token') return;
    const token=ctx.message.text.trim();
    if (token.startsWith('/start')) return;
    try {
      await ctx.reply('⏳ **جاري التحقق من Token وإنشاء البوت...**\n\nقد تستغرق العملية بضع ثوانٍ.',{parse_mode:'Markdown'});
      const me=await verifyBotToken(token);
      const id=db.addBot({ownerUserId:ctx.from.id,token,botId:me.id,username:me.username,firstName:me.first_name,template:p.template});
      const record=db.getBot(id);
      await startManagedBot(record,db);
      try { await setManagedBotProfile(record, p.name); } catch (profileError) { console.error(`Profile setup failed for bot #${id}:`, profileError?.message || profileError); }
      db.setBotSetting(id,'display_name',p.name);
      pending.delete(ctx.from.id);
      await ctx.reply(`🎉 **تم إنشاء بوتك بنجاح**\n\n🤖 البوت: @${me.username}\n🧩 القالب: ${templateNames[p.template]}\n🟢 الحالة: يعمل الآن\n\nهذا البوت أصبح خاصًا بك، وسيتم توجيه مستخدميه إليك أنت فقط وفقًا لوظيفة القالب.`,{parse_mode:'Markdown',reply_markup:mainKeyboard});
    } catch(e) {
      await ctx.reply(`❌ **تعذر إنشاء البوت**\n\nالسبب: ${e?.description||e?.message||'Token غير صالح'}\n\nتأكد من نسخ Token كاملًا من BotFather ثم أرسله مرة أخرى.`,{parse_mode:'Markdown'});
    }
  });

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
      .text('✏️ رسالة الترحيب',`ownerbot:welcome:${id}`).row();
    if (b.template === 'groups') {
      kb.text('🌹 ترحيب المجموعة',`ownerbot:groupwelcome:${id}`).row()
        .text('📜 القوانين',`ownerbot:rules:${id}`).row()
        .text('➕ أمر مخصص',`ownerbot:addcmd:${id}`).text('🗑️ حذف أمر',`ownerbot:delcmd:${id}`).row();
    }
    if (b.template === 'contact') kb.text('📩 آخر رسائل التواصل',`ownerbot:contacts:${id}`).row()
      .text('✏️ نص الاستقبال',`ownerbot:contactintro:${id}`).row();
    await ctx.reply(`⚙️ **إدارة @${b.username||'-'}**\n\n🧩 القالب: ${templateNames[b.template]}\n🟢 الحالة: ${b.status}\n👥 المستخدمون: ${db.botUserCount(id)}\n📩 الرسائل: ${db.contactCount(id)}`,{parse_mode:'Markdown',reply_markup:kb});
  });


  bot.callbackQuery(/^ownerbot:groupwelcome:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]), b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id || b.template!=='groups') return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    ownerBotState.set(ctx.from.id,{botId:id,step:'group_welcome'});
    await ctx.answerCallbackQuery();
    await ctx.reply('🌹 **ترحيب المجموعة**\n\nأرسل رسالة الترحيب الجديدة. يمكنك استخدام `{name}` لاسم العضو و`{username}` للمعرف.');
  });

  bot.callbackQuery(/^ownerbot:rules:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]), b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id || b.template!=='groups') return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    ownerBotState.set(ctx.from.id,{botId:id,step:'rules'});
    await ctx.answerCallbackQuery();
    await ctx.reply('📜 أرسل الآن نص قوانين المجموعة.');
  });

  bot.callbackQuery(/^ownerbot:addcmd:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]), b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id || b.template!=='groups') return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    ownerBotState.set(ctx.from.id,{botId:id,step:'addcmd'});
    await ctx.answerCallbackQuery();
    await ctx.reply('➕ أرسل الأمر والرد بهذا الشكل:\n`امر | الرد`\n\nمثال: `اهلا | هلا وغلا نورت المجموعة 🌹`');
  });

  bot.callbackQuery(/^ownerbot:delcmd:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]), b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id || b.template!=='groups') return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    ownerBotState.set(ctx.from.id,{botId:id,step:'delcmd'});
    await ctx.answerCallbackQuery();
    const cmds=db.listCommands(id);
    await ctx.reply(cmds.length?`🗑️ أرسل اسم الأمر المراد حذفه.\n\nالموجود حاليًا: ${cmds.map(c=>c.command).join(', ')}`:'📭 لا توجد أوامر مخصصة.');
  });

  bot.callbackQuery(/^ownerbot:contacts:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]), b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id || b.template!=='contact') return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    await ctx.answerCallbackQuery();
    await ctx.reply(`📩 **رسائل التواصل**\n\nإجمالي الرسائل المسجلة: ${db.contactCount(id)}\n\nالمحادثات تصل إليك مباشرة مع زر «↩️ رد على المستخدم».`);
  });

  bot.callbackQuery(/^ownerbot:contactintro:(\d+)$/,async ctx=>{
    const id=Number(ctx.match[1]), b=db.getBot(id);
    if(!b || b.owner_user_id!==ctx.from.id || b.template!=='contact') return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    ownerBotState.set(ctx.from.id,{botId:id,step:'contact_intro'});
    await ctx.answerCallbackQuery();
    const current=db.getBotSetting(id,'contact_intro') || '📩 أرسل رسالتك، وسيتم الرد عليك بأقرب وقت ممكن.';
    await ctx.reply(`✏️ **نص الاستقبال**\n\nهذا النص سيظهر للمستخدم عندما يضغط /start في بوت التواصل الخاص بك.\n\nالنص الحالي:\n${current}\n\nأرسل الآن النص الجديد. يمكنك كتابة أي عبارة ترحيبية أو تعليمات تريدها.`);
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
    if(st.step==='group_welcome') {
      db.setBotSetting(st.botId,'group_welcome',ctx.message.text);
      ownerBotState.delete(ctx.from.id);
      return ctx.reply('✅ تم تحديث ترحيب المجموعة.');
    }
    if(st.step==='rules') {
      db.setBotSetting(st.botId,'rules',ctx.message.text);
      ownerBotState.delete(ctx.from.id);
      return ctx.reply('✅ تم تحديث قوانين المجموعة.');
    }
    if(st.step==='contact_intro') {
      if(!ctx.message.text.trim()) return ctx.reply('❌ أرسل نصًا غير فارغ.');
      db.setBotSetting(st.botId,'contact_intro',ctx.message.text.trim());
      ownerBotState.delete(ctx.from.id);
      return ctx.reply('✅ تم حفظ نص الاستقبال. سيظهر الآن للمستخدمين عند دخول بوت التواصل.');
    }
    if(st.step==='addcmd') {
      const parts=ctx.message.text.split('|');
      if(parts.length<2) return ctx.reply('❌ الصيغة: `امر | الرد`');
      const command=parts.shift().trim().replace(/^\//,'');
      const response=parts.join('|').trim();
      if(!command || !response) return ctx.reply('❌ الصيغة غير صحيحة: `امر | الرد`');
      db.setCommand(st.botId,command,response); ownerBotState.delete(ctx.from.id);
      return ctx.reply(`✅ تم حفظ الأمر \`${command}\`.`);
    }
    if(st.step==='delcmd') {
      const command=ctx.message.text.trim().replace(/^\//,'');
      db.deleteCommand(st.botId,command); ownerBotState.delete(ctx.from.id);
      return ctx.reply(`✅ تم حذف الأمر \`${command}\` إن كان موجودًا.`);
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
