import { Bot, GrammyError, InlineKeyboard } from 'grammy';

const runtimes = new Map();
const replyStates = new Map();
const decorStates = new Map();
const chatQuestionStates = new Map();

export async function verifyBotToken(token) {
  const b = new Bot(token);
  return await b.api.getMe();
}

const DECOR_STYLES = [
  t => `『${t}』`,
  t => `【${t}】`,
  t => `〖${t}〗`,
  t => `꧁༺ ${t} ༻꧂`,
  t => `𓆩 ${t} 𓆪`,
  t => `✦ ${t} ✦`,
  t => `★彡 ${t} 彡★`,
  t => `༒ ${t} ༒`,
  t => `◥ ${t} ◤`,
  t => `⟦ ${t} ⟧`
];

// Unicode letter styles: useful for Latin/English text. Arabic is kept intact and
// receives decorative framing because Unicode has no universal Arabic bold/italic alphabet.
const LATIN_MAPS = [
  ['abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'],
  ['abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', '𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ'],
  ['abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', '𝒶𝒷𝒸𝒹𝑒𝒻𝑔𝒽𝒾𝒿𝓀𝓁𝓂𝓃𝑜𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏𝒜𝐵𝒞𝒟𝐸𝐹𝒢𝐻𝐼𝒥𝒦𝐿𝑀𝒩𝒪𝒫𝒬𝑅𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵']
];

function mapLatin(text, index) {
  const [src, dst] = LATIN_MAPS[index % LATIN_MAPS.length];
  const map = new Map([...src].map((c, i) => [c, [...dst][i] || c]));
  return [...text].map(c => map.get(c) || c).join('');
}

function decorateArabicLetters(text, mark) {
  return [...text].map(ch => /[\u0600-\u06FF]/.test(ch) && /\S/.test(ch) ? ch + mark : ch).join('');
}

function tatweelArabic(text) {
  return [...text].map((ch, i, arr) => {
    if (!/[\u0600-\u06FF]/.test(ch) || /\s/.test(ch)) return ch;
    const next = arr[i + 1];
    return next && /[\u0600-\u06FF]/.test(next) ? `${ch}ـ` : ch;
  }).join('');
}

function makeDecorations(text) {
  const arabic = [
    tatweelArabic(text),
    decorateArabicLetters(text, '̲'),
    decorateArabicLetters(text, '̷'),
    decorateArabicLetters(text, '͟'),
    decorateArabicLetters(text, '͜'),
    `꧁༺ ${text} ༻꧂`,
    `𓆩♡𓆪 ${text} 𓆩♡𓆪`
  ];
  const latin = [mapLatin(text, 0), mapLatin(text, 1), mapLatin(text, 2)];
  // Arabic-first ordering, followed by Latin/English Unicode styles.
  return [...arabic, ...latin].slice(0, 10);
}

function decorationKeyboard(botId, userId, page) {
  const kb = new InlineKeyboard();
  for (let i=0;i<10;i++) kb.text(`📋 ${i+1}`, `decor:copy:${botId}:${userId}:${i}`).row();
  kb.text('🔄 زخارف جديدة', `decor:refresh:${botId}:${userId}:${page}`);
  return kb;
}

function templateLabel(t) {
  return t === 'groups' ? '🛡️ إدارة المجموعات' : t === 'contact' ? '📩 بوت تواصل' : '✨ بوت زخرفة';
}

function userLabel(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'بدون اسم';
  const username = user.username ? `@${user.username}` : 'بدون معرف';
  return `👤 الاسم: ${name}\n🔹 المعرف: ${username}\n🆔 Telegram ID: ${user.id}`;
}

async function requiredCheck(bot, ctx, db) {
  const chats = db.listRequired();
  if (!ctx.from || !chats.length) return true;
  const missing = [];
  for (const c of chats) {
    try {
      const m = await bot.api.getChatMember(c.chat_id, ctx.from.id);
      if (['left','kicked'].includes(m.status)) missing.push(c);
    } catch { missing.push(c); }
  }
  if (!missing.length) return true;
  const kb = new InlineKeyboard();
  for (const c of missing) if (c.invite_url) kb.url(`📢 ${c.title || 'الاشتراك المطلوب'}`, c.invite_url).row();
  kb.text('✅ تحقق من الاشتراك', 'subscription:check');
  await ctx.reply('🔒 **الاشتراك مطلوب قبل استخدام البوت**\n\nاشترك في الجهات المطلوبة ثم اضغط «تحقق من الاشتراك».', { parse_mode:'Markdown', reply_markup:kb });
  return false;
}

async function isAdmin(bot, chatId, userId) {
  const m = await bot.api.getChatMember(chatId, userId).catch(() => null);
  return Boolean(m && ['administrator','creator'].includes(m.status));
}

const iraqiReplies = new Map([
  ['هلا', 'هلا وغلا 🌹 نورت/ي المجموعة!'],
  ['هلاو', 'هلاو والله 🌹'],
  ['هلا والله', 'هلا بيك/بيچ، نورت/ي ❤️'],
  ['السلام عليكم', 'وعليكم السلام ورحمة الله وبركاته 🌹'],
  ['سلام عليكم', 'وعليكم السلام 🌹'],
  ['شلونكم', 'بخير وعافية والحمد لله 😄'],
  ['شلونك', 'تمام والحمد لله، إنت شلونك؟ 🌹'],
  ['شلونج', 'تمام والحمد لله، إنتِ شلونچ؟ 🌹'],
  ['شخبارك', 'كلشي تمام والحمد لله ❤️'],
  ['شكو ماكو', 'ماكو غير الخير إن شاء الله 😄'],
  ['شكو', 'الخير كله موجود 🌹'],
  ['ماكو', 'إن شاء الله ماكو إلا الخير 😄'],
  ['تمام', 'تمام التمام 🌟'],
  ['زين', 'زين عليك 😄'],
  ['شكرا', 'العفو، تدلل 🌹'],
  ['شكرًا', 'العفو، تدلل 🌹'],
  ['تسلم', 'تسلم وتدوم 🌹'],
  ['تسلمين', 'تسلمين وتدومين 🌹'],
  ['الله يسلمك', 'يسلمك ربي ❤️'],
  ['احبك', 'تدلل 🌹'],
  ['هههه', 'دوم الضحكة 😂'],
  ['ههههه', 'دوم الضحكة 😂❤️'],
  ['صباح الخير', 'صباح النور والسرور ☀️🌹'],
  ['مساء الخير', 'مساء النور والعافية 🌙🌹'],
  ['تصبحون على خير', 'وإنت/ي من أهله، أحلام سعيدة 🌙'],
  ['باي', 'مع السلامة ونشوفك على خير 👋'],
  ['وينكم', 'هنا وياكم 😄'],
  ['وينك', 'هنا وياك، تدلل 😄'],
  ['كفو', 'كفوك الطيب 🌹'],
  ['فدوه', 'فدوة لعيونك 😄'],
  ['تدلل', 'تدلل عيني 🌹'],
  ['منور', 'بنورك حبيبي/حبيبتي ❤️'],
  ['منورة', 'بنورچ 🌹'],
  ['حبيبي', 'حبيب قلبي 🌹'],
  ['حبيبتي', 'حبيبتي 🌹']
]);

const personalQuestions = [
  'شنو أكثر شي تحبه بوقتك؟ 🌟',
  'شنو أكلك العراقي المفضل؟ 🍲',
  'إذا عندك سفر مجاني، وين تحب تروح؟ ✈️',
  'شنو أكثر شي يضحكك؟ 😂',
  'شنو الشي اللي تتمنى تتعلمه؟ 📚',
  'تفضل الليل لو النهار؟ وليش؟ 🌙☀️',
  'شنو أكثر أغنية/نوع موسيقى تحبه؟ 🎵',
  'شنو هوايتك المفضلة؟ 🎨',
  'شنو أكثر مكان تحب تروحه بالعراق؟ 🇮🇶',
  'شنو الشي اللي يخليك بمزاج زين؟ ❤️'
];

async function sendUserInfo(bot, ctx) {
  const u = ctx.from;
  const info = `👤 **معلومات المستخدم**\n\n${userLabel(u)}\n\n📅 الحساب ظاهر للبوت من: الآن`; 
  try {
    const photos = await bot.api.getUserProfilePhotos(u.id, {limit:1});
    if (photos.total_count && photos.photos[0]?.[0]) {
      return ctx.replyWithPhoto(photos.photos[0][photos.photos[0].length-1].file_id, {caption:info,parse_mode:'Markdown'});
    }
  } catch {}
  return ctx.reply(info,{parse_mode:'Markdown'});
}

async function groupsTemplate(bot, ctx, record, db) {
  const text = ctx.message?.text || '';

  if (ctx.chat.type === 'private') {
    if (text === '/help') return ctx.reply('🛡️ **مساعدة بوت إدارة المجموعات**\n\nأضف البوت إلى مجموعتك وارفعه مشرفًا.\n\nالأوامر:\n/1 — معلومات المستخدم مع صورته\nكت — سؤال شخصي\n/rules — القوانين\n/lock — قفل المحادثة\n/unlock — فتح المحادثة\n/ban — حظر بالرد\n/mute — كتم بالرد\n/unmute — إلغاء الكتم\n/game — لعبة بسيطة', {parse_mode:'Markdown'});
    return ctx.reply('🛡️ **بوت إدارة المجموعات**\n\nأضفني إلى مجموعتك وارفعني مشرفًا بالصلاحيات المناسبة، ثم استخدم الأوامر داخل المجموعة.', {parse_mode:'Markdown'});
  }

  // Welcome new members.
  if (ctx.message?.new_chat_members?.length) {
    const custom = db.getBotSetting(record.id,'group_welcome');
    for (const member of ctx.message.new_chat_members) {
      const name = [member.first_name,member.last_name].filter(Boolean).join(' ') || 'صديقنا';
      await ctx.reply(custom ? custom.replaceAll('{name}',name).replaceAll('{username}',member.username ? '@'+member.username : 'بدون معرف') : `🌹 **هلا وغلا ${name}!**\n\nنورت مجموعتنا، نتمنى لك وقتًا ممتعًا ويانا ❤️\n\n📌 اكتب **/1** إذا تريد تشوف معلومات حسابك.` , {parse_mode:'Markdown'}).catch(()=>{});
    }
    return;
  }

  if (text === '/1' || text === '1') return sendUserInfo(bot,ctx);
  if (text === 'كت' || text === '/كت') {
    const question = personalQuestions[Math.floor(Math.random()*personalQuestions.length)];
    chatQuestionStates.set(`${record.id}:${ctx.chat.id}:${ctx.from.id}`, {question, createdAt:Date.now()});
    return ctx.reply(`💬 **سؤال شخصي**\n\n${question}\n\n✍️ جاوب إذا تحب، والبوت يتذكر أن السؤال كان إلك.`,{parse_mode:'Markdown'});
  }

  const qKey = `${record.id}:${ctx.chat.id}:${ctx.from.id}`;
  if (chatQuestionStates.has(qKey) && text && !text.startsWith('/')) {
    chatQuestionStates.delete(qKey);
    return ctx.reply('❤️ جواب جميل! شكرًا لأنك شاركتنا.');
  }

  const normalized = text.trim().toLowerCase().replace(/[ًٌٍَُِّْ]/g,'');
  if (iraqiReplies.has(normalized)) return ctx.reply(iraqiReplies.get(normalized));

  if (text === '/rules') return ctx.reply(db.getBotSetting(record.id,'rules') || '📜 لم يتم تعيين قوانين لهذه المجموعة بعد.');
  if (text === '/game') return ctx.reply(`🎮 خمن رقمًا من 1 إلى 3!\n\n🎯 الرقم: ${Math.floor(Math.random()*3)+1}`);

  if (['/lock','/unlock'].includes(text)) {
    if (!(await isAdmin(bot,ctx.chat.id,ctx.from.id))) return ctx.reply('❌ هذا الأمر للمشرفين فقط.');
    try {
      const locked = text === '/lock';
      await bot.api.setChatPermissions(ctx.chat.id, {
        can_send_messages: !locked, can_send_audios: !locked, can_send_documents: !locked, can_send_photos: !locked,
        can_send_videos: !locked, can_send_video_notes: !locked, can_send_voice_notes: !locked, can_send_polls: !locked,
        can_send_other_messages: !locked, can_add_web_page_previews: !locked, can_change_info: false,
        can_invite_users: !locked, can_pin_messages: false
      });
      return ctx.reply(locked ? '🔒 تم قفل المحادثة.' : '🔓 تم فتح المحادثة.');
    } catch { return ctx.reply('❌ تعذر تنفيذ الأمر. تأكد من صلاحيات البوت.'); }
  }

  if (['/ban','/mute','/unmute'].includes(text)) {
    if (!(await isAdmin(bot,ctx.chat.id,ctx.from.id))) return ctx.reply('❌ هذا الأمر للمشرفين فقط.');
    const replied = ctx.msg.reply_to_message;
    if (!replied?.from) return ctx.reply('↩️ استخدم الأمر بالرد على رسالة العضو المطلوب.');
    try {
      if (text === '/ban') { await bot.api.banChatMember(ctx.chat.id,replied.from.id); return ctx.reply('🚫 تم حظر العضو.'); }
      const until = Math.floor(Date.now()/1000)+3600;
      if (text === '/mute') { await bot.api.restrictChatMember(ctx.chat.id,replied.from.id,{permissions:{can_send_messages:false},until_date:until}); return ctx.reply('🔇 تم كتم العضو لمدة ساعة.'); }
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
  const type = ctx.msg.photo ? 'photo' : ctx.msg.video ? 'video' : ctx.msg.document ? 'document' : ctx.msg.voice ? 'voice' : ctx.msg.audio ? 'audio' : ctx.msg.animation ? 'animation' : 'text';
  db.recordContact({botId:record.id,userId:user.id,username:user.username,firstName:user.first_name,messageType:type,messageId:ctx.msg.message_id});
  const kb = new InlineKeyboard().text('↩️ رد على المستخدم',`contact:reply:${record.id}:${user.id}`).text('🚫 حظر',`contact:block:${record.id}:${user.id}`);
  await bot.api.sendMessage(record.owner_user_id,`📩 **رسالة جديدة**\n\n${userLabel(user)}\n\n📎 النوع: ${type}`,{parse_mode:'Markdown',reply_markup:kb});
  await bot.api.copyMessage(record.owner_user_id,ctx.chat.id,ctx.msg.message_id);
  return ctx.reply('✅ وصلت رسالتك إلى صاحب البوت.\n\nسيصلك الرد هنا عند الرد عليك.');
}

function welcomeText(record, db) {
  const custom = db.getBotSetting(record.id,'welcome');
  if (custom) return custom;
  if (record.template === 'contact') {
    const intro = db.getBotSetting(record.id,'contact_intro') || '📩 أرسل رسالتك، وسيتم الرد عليك بأقرب وقت ممكن.';
    return `📩 **أهلًا بك في بوت التواصل**\n\n${intro}\n\n✉️ يمكنك إرسال رسالتك أو صورتك أو ملفك أو تسجيلك الصوتي، وستصل إلى صاحب هذا البوت مباشرة.\n\n🔐 رسالتك خاصة بهذا البوت وتصل إلى مالكه فقط.`;
  }
  if (record.template === 'decor') return '✨ **أهلًا بك في بوت الزخرفة**\n\nأرسل الاسم أو العبارة، وسأعرض لك 10 خيارات مزخرفة مع زر نسخ لكل خيار وزر لتحديث الزخارف.';
  return '🛡️ **أهلًا بك في بوت إدارة المجموعات**\n\nأضفني إلى مجموعتك وارفعني مشرفًا بالصلاحيات المناسبة لبدء الحماية والترحيب والردود العراقية والأوامر.';
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

  bot.command('start', ctx => ctx.reply(welcomeText(record,db),{parse_mode:'Markdown'}));
  bot.command('help', ctx => ctx.reply(welcomeText(record,db),{parse_mode:'Markdown'}));

  bot.callbackQuery('subscription:check',async ctx=>{ await ctx.answerCallbackQuery(); if (await requiredCheck(bot,ctx,db)) await ctx.reply('✅ تم التحقق من اشتراكك. يمكنك الآن استخدام البوت.'); });

  bot.callbackQuery(/^decor:refresh:(\d+):(\d+):(\d+)$/,async ctx=>{
    const botId=Number(ctx.match[1]),userId=Number(ctx.match[2]);
    if (botId!==record.id || userId!==ctx.from.id) return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    const state=decorStates.get(`${record.id}:${userId}`); if(!state) return ctx.answerCallbackQuery({text:'أرسل عبارة جديدة أولًا'});
    const variants=makeDecorations(state.text); state.variants=variants;
    await ctx.answerCallbackQuery({text:'تم تحديث الزخارف'});
    return ctx.editMessageText(`✨ **زخارف جديدة**\n\nالنص: ${state.text}\n\n${variants.map((v,i)=>`${i+1}. ${v}`).join('\n')}`,{parse_mode:'Markdown',reply_markup:decorationKeyboard(record.id,userId,0)});
  });

  bot.callbackQuery(/^decor:copy:(\d+):(\d+):(\d+)$/,async ctx=>{
    const botId=Number(ctx.match[1]),userId=Number(ctx.match[2]),index=Number(ctx.match[3]);
    if (botId!==record.id || userId!==ctx.from.id) return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    const state=decorStates.get(`${record.id}:${userId}`); const value=state?.variants?.[index];
    if (!value) return ctx.answerCallbackQuery({text:'انتهت هذه النتيجة، أرسل النص من جديد'});
    await ctx.answerCallbackQuery({text:'تم نسخ الخيار وإرساله لك'});
    return ctx.reply(`📋 **الخيار ${index+1}**\n\n${value}`);
  });

  bot.callbackQuery(/^contact:reply:(\d+):(\d+)$/,async ctx=>{
    const botId=Number(ctx.match[1]),userId=Number(ctx.match[2]);
    if(botId!==record.id||ctx.from.id!==record.owner_user_id)return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true});
    replyStates.set(`${record.id}:${ctx.from.id}`,{userId}); await ctx.answerCallbackQuery();
    await ctx.reply(`↩️ **الرد على المستخدم**\n\n🆔 ${userId}\n\nأرسل رسالتك الآن. يمكنك إرسال نص أو صورة أو ملف أو صوت.\n\nللإلغاء أرسل /cancel`,{parse_mode:'Markdown'});
  });

  bot.callbackQuery(/^contact:block:(\d+):(\d+)$/,async ctx=>{ const botId=Number(ctx.match[1]),userId=Number(ctx.match[2]); if(botId!==record.id||ctx.from.id!==record.owner_user_id)return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true}); db.blockContact(record.id,userId); await ctx.answerCallbackQuery({text:'تم الحظر'}); await ctx.reply(`🚫 تم حظر المستخدم ${userId} من التواصل مع هذا البوت.`); });
  bot.callbackQuery(/^contact:unblock:(\d+):(\d+)$/,async ctx=>{ const botId=Number(ctx.match[1]),userId=Number(ctx.match[2]); if(botId!==record.id||ctx.from.id!==record.owner_user_id)return ctx.answerCallbackQuery({text:'غير مسموح',show_alert:true}); db.unblockContact(record.id,userId); await ctx.answerCallbackQuery({text:'تم إلغاء الحظر'}); await ctx.reply(`♻️ تم إلغاء حظر المستخدم ${userId}.`); });

  bot.on('message',async ctx=>{
    if(!ctx.from)return;
    if(ctx.from.id===record.owner_user_id&&ctx.chat.type==='private'){
      const key=`${record.id}:${ctx.from.id}`,state=replyStates.get(key);
      if(state){ if(ctx.message.text==='/cancel'){replyStates.delete(key);return ctx.reply('↩️ تم إلغاء وضع الرد.');} try{await bot.api.copyMessage(state.userId,ctx.chat.id,ctx.msg.message_id);replyStates.delete(key);return ctx.reply('✅ تم إرسال الرد إلى المستخدم.');}catch{replyStates.delete(key);return ctx.reply('❌ تعذر إرسال الرد. قد يكون المستخدم حظر البوت.');} }
      return;
    }
    if(record.template==='contact'){if(ctx.chat.type!=='private')return;return sendContactToOwner(bot,ctx,record,db);}
    if(record.template==='decor'){
      if(!ctx.message.text)return;
      const text=ctx.message.text.trim(); if(!text)return;
      const variants=makeDecorations(text); decorStates.set(`${record.id}:${ctx.from.id}`,{text,variants});
      return ctx.reply(`✨ **10 زخارف جاهزة**\n\nالنص: ${text}\n\n${variants.map((v,i)=>`${i+1}. ${v}`).join('\n')}`,{parse_mode:'Markdown',reply_markup:decorationKeyboard(record.id,ctx.from.id,0)});
    }
    if(ctx.chat.type!=='private'||ctx.message.text||ctx.message.new_chat_members)return groupsTemplate(bot,ctx,record,db);
  });

  bot.catch(err=>{const e=err.error;console.error(`Managed bot #${record.id}:`,e instanceof GrammyError?e.description:e?.message||e);});
  runtimes.set(record.id,bot); return bot;
}

export async function startManagedBot(record,db){ const bot=createManagedBot(record,db); await bot.api.deleteWebhook({drop_pending_updates:false}); db.markBotStarted(record.id); bot.start({onStart:info=>console.log(`Managed @${info.username} started`)}); return bot; }
export async function startAllManagedBots(db){ for(const record of db.listActiveBots()){try{await startManagedBot(record,db);}catch(e){db.setBotStatus(record.id,'error');console.error(`Failed to start managed bot #${record.id}:`,e?.message||e);}} }
export async function setManagedBotProfile(record,displayName){const bot=runtimes.get(record.id)||new Bot(record.token);if(displayName){await bot.api.setMyName({name:displayName});await bot.api.setMyDescription({description:`بوت ${displayName} يعمل عبر منصة صانع البوتات.`});await bot.api.setMyShortDescription({short_description:displayName.slice(0,120)});}}
export function getRuntimeBots(){return runtimes;}
