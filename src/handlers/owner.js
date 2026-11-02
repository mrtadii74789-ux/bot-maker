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
    if ((sent+failed)%25===0) await new Promise(r=>setTimeout(r,1000));
  }
  db.finishBroadcast(id,sent,failed);
  return {sent,failed,total:users.length};
}

export function registerOwnerHandlers(bot,db,ownerId) {
  bot.command('admin',async ctx=>{
    if(ctx.from.id!==ownerId) return;
    await ctx.reply('👑 لوحة تحكم المنصة',{reply_markup:adminKeyboard});
  });

  bot.callbackQuery('admin:stats',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const s=db.stats();
    await ctx.reply(`📊 الإحصائيات\\n\\n👤 مستخدمو المنصة: ${s.users}\\n🤖 البوتات المصنوعة: ${s.bots}\\n🟢 البوتات العاملة: ${s.activeBots}`);
  });

  bot.callbackQuery('admin:bots',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const bots=db.listBots();
    if(!bots.length) return ctx.reply('لا توجد بوتات.');
    await ctx.reply(bots.slice(0,50).map((b,i)=>`${i+1}. #${b.id} @${b.username||'-'} | ${b.template} | ${b.status} | 👤 ${db.botUserCount(b.id)}`).join('\\n'));
  });

  bot.callbackQuery('admin:broadcast',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    ownerState.set(ownerId,{step:'broadcast'});
    await ctx.answerCallbackQuery();
    await ctx.reply('📢 أرسل رسالة الإذاعة.\\nستُرسل إلى جميع مستخدمي بوتات المنصة.');
  });

  bot.callbackQuery('admin:subscription',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const c=db.listRequired();
    await ctx.reply(c.length?c.map(x=>`#${x.id} ${x.title||x.chat_id}`).join('\\n'):'🔒 لا توجد اشتراكات إجبارية.');
  });

  bot.callbackQuery('admin:addchat',async ctx=>{
    if(ctx.from.id!==ownerId) return ctx.answerCallbackQuery();
    ownerState.set(ownerId,{step:'chat'});
    await ctx.answerCallbackQuery();
    await ctx.reply('أرسل: chat_id | الاسم | رابط_الدعوة');
  });

  bot.on('message:text',async (ctx,next)=>{
    if(ctx.from.id!==ownerId) return next();
    const state=ownerState.get(ownerId);
    if(!state) return next();

    if(state.step==='chat') {
      const p=ctx.message.text.split('|').map(x=>x.trim());
      if(p.length<3) return ctx.reply('❌ الصيغة: chat_id | الاسم | رابط_الدعوة');
      db.addRequired({chatId:p[0],title:p[1],type:'channel_or_group',inviteUrl:p[2]});
      ownerState.delete(ownerId);
      return ctx.reply('✅ تمت إضافة الاشتراك الإجباري. تأكد أن البوتات المنشأة لديها صلاحية فحص العضوية.');
    }

    if(state.step==='broadcast') {
      ownerState.delete(ownerId);
      const r=await broadcast(db,bot,'all',null,ctx.message.text);
      return ctx.reply(`📢 انتهت الإذاعة\\n\\n👥 الإجمالي: ${r.total}\\n✅ نجح: ${r.sent}\\n❌ فشل: ${r.failed}`);
    }
  });

  bot.command('runtime',async ctx=>{
    if(ctx.from.id!==ownerId) return;
    await ctx.reply(`🟢 البوتات المحملة بالذاكرة: ${getRuntimeBots().size}`);
  });
}
