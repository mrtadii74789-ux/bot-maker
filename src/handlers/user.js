import { verifyBotToken, startManagedBot } from '../bot-manager.js';
import { mainKeyboard, templateKeyboard } from '../keyboards.js';

const pending = new Map();

export function registerUserHandlers(bot,db) {
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
      console.log(`Start command from user ${ctx.from.id} (@${ctx.from.username || '-'})`);
      await ctx.reply('🤖 أهلاً بك في منصة صانع البوتات!\\n\\nاختر من القائمة:', { reply_markup: mainKeyboard });
      return;
    }
    await next();
  });

  bot.command('start',ctx=>ctx.reply('🤖 أهلاً بك في منصة صانع البوتات!\\n\\nاختر من القائمة:',{reply_markup:mainKeyboard}));

  bot.hears('🤖 إنشاء بوت',async ctx=>{
    pending.set(ctx.from.id,{step:'template'});
    await ctx.reply('اختر نوع البوت:',{reply_markup:templateKeyboard});
  });

  bot.callbackQuery(/^template:(groups|contact|decor)$/,async ctx=>{
    pending.set(ctx.from.id,{step:'token',template:ctx.match[1]});
    await ctx.answerCallbackQuery();
    await ctx.reply('🔑 أرسل Token البوت من BotFather الآن.\\nلا ترسل Token بوت المنصة.');
  });

  bot.on('message:text',async ctx=>{
    const p=pending.get(ctx.from.id);
    if (!p || p.step!=='token') return;
    try {
      const me=await verifyBotToken(ctx.message.text.trim());
      const id=db.addBot({ownerUserId:ctx.from.id,token:ctx.message.text.trim(),botId:me.id,username:me.username,firstName:me.first_name,template:p.template});
      const record=db.getBot(id);
      pending.delete(ctx.from.id);
      await startManagedBot(record,db);
      await ctx.reply(`✅ تم إنشاء البوت!\\n\\n🤖 @${me.username}\\n📦 النوع: ${p.template}\\n🟢 يعمل الآن.`,{reply_markup:mainKeyboard});
    } catch(e) {
      await ctx.reply(`❌ Token غير صالح أو لا يمكن الوصول إلى Telegram.\\n${e?.description||e?.message||''}`);
    }
  });

  bot.hears('🤖 بوتاتي',async ctx=>{
    const bots=db.listOwnerBots(ctx.from.id);
    if(!bots.length) return ctx.reply('ليس لديك بوتات بعد.');
    await ctx.reply(bots.map((b,i)=>`${i+1}. #${b.id} @${b.username||'-'} | ${b.template} | ${b.status} | 👤 ${db.botUserCount(b.id)}`).join('\\n'));
  });

  bot.hears('📊 إحصائياتي',async ctx=>{
    const bots=db.listOwnerBots(ctx.from.id);
    const users=bots.reduce((n,b)=>n+db.botUserCount(b.id),0);
    await ctx.reply(`📊 إحصائياتك\\n\\n🤖 البوتات: ${bots.length}\\n👤 مستخدمو بوتاتك: ${users}`);
  });

  bot.hears('ℹ️ المساعدة',ctx=>ctx.reply('اختر إنشاء بوت، ثم القالب، ثم أرسل Token الخاص بالبوت. لا تشارك Token مع أي شخص.'));
}
