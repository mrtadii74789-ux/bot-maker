import { InlineKeyboard, Keyboard } from 'grammy';

export const mainKeyboard = new InlineKeyboard()
  .text('🤖 إنشاء بوت', 'menu:create').text('🤖 بوتاتي', 'menu:mybots').row()
  .text('📊 إحصائياتي', 'menu:stats').text('⚙️ إدارة بوتاتي', 'menu:manage').row()
  .text('ℹ️ المساعدة', 'menu:help');

export const templateKeyboard = new InlineKeyboard()
  .text('🛡️ إدارة المجموعات', 'template:groups').row()
  .text('📩 بوت تواصل', 'template:contact').row()
  .text('✨ بوت زخرفة', 'template:decor').row()
  .text('🔳 بوت QR', 'template:qr');

export const adminKeyboard = new InlineKeyboard()
  .text('📊 الإحصائيات', 'admin:stats').text('🤖 البوتات', 'admin:bots').row()
  .text('📢 الإذاعة', 'admin:broadcast').text('🔒 الاشتراك', 'admin:subscription').row()
  .text('➕ إضافة اشتراك', 'admin:addchat').text('⚙️ الإعدادات', 'admin:settings');

export const qrKeyboard = new InlineKeyboard()
  .text('📝 نص', 'qr:text').text('🔗 رابط', 'qr:url').row()
  .text('📞 رقم هاتف', 'qr:phone').text('📧 إيميل', 'qr:email').row()
  .text('📶 Wi‑Fi', 'qr:wifi').text('👤 جهة اتصال', 'qr:contact').row()
  .text('💬 رسالة SMS', 'qr:sms').text('📍 موقع', 'qr:location').row()
  .text('🟢 واتساب', 'qr:whatsapp').text('🖼️ رابط صورة', 'qr:image');

export const backKeyboard = new InlineKeyboard().text('⬅️ الرئيسية', 'menu:home');
