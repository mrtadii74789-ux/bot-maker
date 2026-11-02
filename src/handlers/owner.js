import { adminKeyboard } from '../keyboards.js';
import { getRuntimeBots } from '../bot-manager.js';

const ownerState = new Map();

async function broadcast(db, bot, scope, targetBotId, message) {
  const users=db.getBroadcastUsers(scope,targetBotId);
  const id=db.createBroadcast(scope,targetBotId,message);
  let sent=0, failed=0;
  for (const userId of users) {
    try { await bot.api.sendMessage(userId,message); sent++; }
    catch { failed++; }
    if ((sent+failed)%20===0) await new Promise(r=>setTimeout(r,1000));
  }
  db.finishBroadcast(id,sent,failed);
  return {sent,failed,total:users.length};
}

export function registerOwnerHandlers(bot,db,ownerId) {
  bot.command('admin',async ctx=>{
    if(ctx.from.id!==ownerId) return;
    await ctx.reply('👑 **لوحة تحكم منصة صانع البوتات**\n\nمن هنا يمكنك متابعة المنصة، البوتات، المستخدمين، الاشتراك الإجباري والإذاعة.',{parse_mode:'Markdown',reply_markup:adminKeyboard});
  });

  bot.callbackQuery('admin:stats',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const s=db.stats();
    await ctx.reply(`📊 **إحصائيات المنصة**\n\n👤 مستخدمو المنصة: ${s.users}\n🤖 البوتات المصنوعة: ${s.bots}\n🟢 البوتات العاملة: ${s.activeBots}\n💾 البوتات المحملة بالذاكرة: ${getRuntimeBots().size}`,{parse_mode:'Markdown'});
  });

  bot.callbackQuery('admin:bots',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const bots=db.listBots();
    if(!bots.length) return ctx.reply('📭 لا توجد بوتات مصنوعة بعد.');
    const text=bots.slice(0,50).map((b,i)=>`${i+1}. #${b.id} @${b.username||'-'}\n   👤 المالك: ${b.owner_user_id}\n   🧩 ${b.template}\n   🟢 ${b.status}\n   👥 ${db.botUserCount(b.id)} مستخدم\n   📩 ${db.contactCount(b.id)} رسالة`).join('\n\n');
    await ctx.reply(`🤖 **البوتات**\n\n${text}`,{parse_mode:'Markdown'});
  });

  bot.callbackQuery('admin:broadcast',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    ownerState.set(ownerId,{step:'broadcast'});
    await ctx.answerCallbackQuery();
    await ctx.reply('📢 **الإذاعة العامة**\n\nأرسل الآن الرسالة التي تريد نشرها إلى مستخدمي بوتات المنصة.',{parse_mode:'Markdown'});
  });

  bot.callbackQuery('admin:subscription',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const c=db.listRequired();
    await ctx.reply(c.length?`🔒 **الاشتراكات الإجبارية**\n\n${c.map(x=>`#${x.id} — ${x.title||x.chat_id}\n${x.invite_url||'بدون رابط'}`).join('\n\n')}`:'🔒 لا توجد اشتراكات إجبارية.',{parse_mode:'Markdown'});
  });

  bot.callbackQuery('admin:addchat',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    ownerState.set(ownerId,{step:'chat'});
    await ctx.answerCallbackQuery();
    await ctx.reply('➕ **إضافة اشتراك إجباري**\n\nأرسل البيانات بهذا الشكل:\n`chat_id | الاسم | رابط_الدعوة`\n\nمثال:\n`-1001234567890 | قناتي | https://t.me/example`',{parse_mode:'Markdown'});
  });

  bot.callbackQuery('admin:settings',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.reply('⚙️ **إعدادات المنصة**\n\nالمتغيرات الأساسية يتم ضبطها من FadeHost:\n• BOT_TOKEN\n• OWNER_ID\n• DB_PATH\n\nقاعدة البيانات محفوظة في المسار المحدد بـ DB_PATH.');
  });

  bot.on('message',async (ctx,next)=>{
    if(ctx.from.id!==ownerId) return next();
    const state=ownerState.get(ownerId);
    if(!state) return next();

    if(state.step==='chat') {
      if(!ctx.message.text) return ctx.reply('❌ أرسل بيانات الاشتراك كنص: chat_id | الاسم | رابط_الدعوة');
      const p=ctx.message.text.split('|').map(x=>x.trim());
      if(p.length<3) return ctx.reply('❌ الصيغة غير صحيحة. استخدم:\nchat_id | الاسم | رابط_الدعوة');
      db.addRequired({chatId:p[0],title:p[1],type:'channel_or_group',inviteUrl:p[2]});
      ownerState.delete(ownerId);
      return ctx.reply('✅ تمت إضافة الاشتراك الإجباري. تأكد أن كل بوت منشأ يستطيع فحص عضوية المستخدمين في القناة/المجموعة.');
    }

    if(state.step==='broadcast') {
      ownerState.delete(ownerId);
      const users=db.getBroadcastUsers('all',null);
      const id=db.createBroadcast('all',null,ctx.message.text || `[${ctx.msg?.message_id || 'media'}]`);
      let sent=0,failed=0;
      for(const userId of users){
        try { await bot.api.copyMessage(userId,ctx.chat.id,ctx.msg.message_id); sent++; } catch { failed++; }
        if((sent+failed)%20===0) await new Promise(r=>setTimeout(r,1000));
      }
      db.finishBroadcast(id,sent,failed);
      return ctx.reply(`📢 **اكتملت الإذاعة**\n\n👥 الإجمالي: ${users.length}\n✅ تم الإرسال: ${sent}\n❌ فشل: ${failed}`,{parse_mode:'Markdown'});
    }
  });

  bot.command('runtime',async ctx=>{
    if(ctx.from.id!==ownerId) return;
    await ctx.reply(`🟢 البوتات المحملة بالذاكرة: ${getRuntimeBots().size}`);
  });
}
