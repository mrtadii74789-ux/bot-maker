import { InlineKeyboard, Keyboard } from 'grammy';

export const mainKeyboard = new Keyboard()
  .text('🤖 إنشاء بوت').text('🤖 بوتاتي').row()
  .text('📊 إحصائياتي').text('⚙️ إدارة بوتاتي').row()
  .text('ℹ️ المساعدة').resized();

export const templateKeyboard = new InlineKeyboard()
  .text('🛡️ إدارة المجموعات', 'template:groups').row()
  .text('📩 بوت تواصل', 'template:contact').row()
  .text('✨ بوت زخرفة', 'template:decor');

export const adminKeyboard = new InlineKeyboard()
  .text('📊 الإحصائيات', 'admin:stats').text('🤖 البوتات', 'admin:bots').row()
  .text('📢 الإذاعة العامة', 'admin:broadcast').text('🔒 الاشتراك الإجباري', 'admin:subscription').row()
  .text('➕ إضافة اشتراك', 'admin:addchat').text('🧩 إدارة القوالب', 'admin:templates').row()
  .text('⚙️ الإعدادات', 'admin:settings');
