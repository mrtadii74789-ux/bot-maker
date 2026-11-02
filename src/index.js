import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from './config.js';
import { createDatabase } from './database.js';
import { registerUserHandlers } from './handlers/user.js';
import { registerOwnerHandlers } from './handlers/owner.js';
import { startAllManagedBots } from './bot-manager.js';
import { safeError } from './utils.js';

const db=createDatabase(config.dbPath);
const bot=new Bot(config.botToken);

bot.catch(err=>{
  const e=err.error;
  if(e instanceof GrammyError) console.error('Telegram error:',e.description);
  else if(e instanceof HttpError) console.error('Network error:',e.message);
  else console.error('Unhandled error:',safeError(e));
});

bot.use(async(ctx,next)=>{
  if(ctx.from) db.touchUser(ctx.from);
  console.log(`Update received: ${ctx.update.update_id}`);
  if(ctx.message?.text) console.log(`Message text: ${JSON.stringify(ctx.message.text)} from ${ctx.from?.id ?? '-'}`);
  await next();
});

registerOwnerHandlers(bot,db,config.ownerId);
registerUserHandlers(bot,db);

process.once('SIGINT',()=>{db.close();bot.stop();});
process.once('SIGTERM',()=>{db.close();bot.stop();});

console.log('🤖 منصة صانع البوتات V5 تعمل...');

try {
  await bot.api.deleteWebhook({drop_pending_updates:false});
  const w=await bot.api.getWebhookInfo();
  console.log(`Telegram webhook: ${w.url||'none'}`);
} catch(e) {
  console.error('Polling setup error:',safeError(e));
}

await startAllManagedBots(db);
await bot.start({onStart:info=>console.log(`@${info.username} started - long polling active`)});
