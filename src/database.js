import { DatabaseSync } from 'node:sqlite';

function ensureColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function createDatabase(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      bot_id INTEGER,
      username TEXT,
      first_name TEXT,
      template TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_started_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bot_users (
      bot_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT,
      first_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (bot_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS required_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL UNIQUE,
      title TEXT,
      type TEXT,
      invite_url TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_settings (
      bot_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (bot_id, key)
    );

    CREATE TABLE IF NOT EXISTS bot_commands (
      bot_id INTEGER NOT NULL,
      command TEXT NOT NULL,
      response TEXT NOT NULL,
      PRIMARY KEY (bot_id, command)
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      target_bot_id INTEGER,
      message TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT,
      first_name TEXT,
      message_type TEXT,
      message_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_blocks (
      bot_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (bot_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  ensureColumn(db, 'bots', 'last_started_at', 'TEXT');

  const s = {
    upsertUser: db.prepare(`INSERT INTO users(user_id,username,first_name) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_seen=CURRENT_TIMESTAMP`),
    addBot: db.prepare(`INSERT INTO bots(owner_user_id,token,bot_id,username,first_name,template) VALUES(?,?,?,?,?,?)`),
    getBot: db.prepare(`SELECT * FROM bots WHERE id=?`),
    listBots: db.prepare(`SELECT * FROM bots ORDER BY id DESC`),
    listOwnerBots: db.prepare(`SELECT * FROM bots WHERE owner_user_id=? ORDER BY id DESC`),
    listActiveBots: db.prepare(`SELECT * FROM bots WHERE status!='stopped' ORDER BY id ASC`),
    setBotStatus: db.prepare(`UPDATE bots SET status=? WHERE id=?`),
    markBotStarted: db.prepare(`UPDATE bots SET status='active',last_started_at=CURRENT_TIMESTAMP WHERE id=?`),
    upsertBotUser: db.prepare(`INSERT INTO bot_users(bot_id,user_id,username,first_name) VALUES(?,?,?,?) ON CONFLICT(bot_id,user_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_seen=CURRENT_TIMESTAMP`),
    botUserCount: db.prepare(`SELECT COUNT(*) n FROM bot_users WHERE bot_id=?`),
    allBotUsers: db.prepare(`SELECT DISTINCT user_id FROM bot_users`),
    oneBotUsers: db.prepare(`SELECT DISTINCT user_id FROM bot_users WHERE bot_id=?`),
    addRequired: db.prepare(`INSERT INTO required_chats(chat_id,title,type,invite_url) VALUES(?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET title=excluded.title,type=excluded.type,invite_url=excluded.invite_url,enabled=1`),
    listRequired: db.prepare(`SELECT * FROM required_chats WHERE enabled=1 ORDER BY id`),
    disableRequired: db.prepare(`UPDATE required_chats SET enabled=0 WHERE id=?`),
    setSetting: db.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`),
    getSetting: db.prepare(`SELECT value FROM settings WHERE key=?`),
    setBotSetting: db.prepare(`INSERT INTO bot_settings(bot_id,key,value) VALUES(?,?,?) ON CONFLICT(bot_id,key) DO UPDATE SET value=excluded.value`),
    getBotSetting: db.prepare(`SELECT value FROM bot_settings WHERE bot_id=? AND key=?`),
    listBotSettings: db.prepare(`SELECT key,value FROM bot_settings WHERE bot_id=? ORDER BY key`),
    setCommand: db.prepare(`INSERT INTO bot_commands(bot_id,command,response) VALUES(?,?,?) ON CONFLICT(bot_id,command) DO UPDATE SET response=excluded.response`),
    deleteCommand: db.prepare(`DELETE FROM bot_commands WHERE bot_id=? AND command=?`),
    listCommands: db.prepare(`SELECT command,response FROM bot_commands WHERE bot_id=? ORDER BY command`),
    addBroadcast: db.prepare(`INSERT INTO broadcasts(scope,target_bot_id,message) VALUES(?,?,?)`),
    updateBroadcast: db.prepare(`UPDATE broadcasts SET sent=?,failed=? WHERE id=?`),
    addContact: db.prepare(`INSERT INTO contact_messages(bot_id,user_id,username,first_name,message_type,message_id) VALUES(?,?,?,?,?,?)`),
    contactCount: db.prepare(`SELECT COUNT(*) n FROM contact_messages WHERE bot_id=?`),
    block: db.prepare(`INSERT OR IGNORE INTO contact_blocks(bot_id,user_id) VALUES(?,?)`),
    unblock: db.prepare(`DELETE FROM contact_blocks WHERE bot_id=? AND user_id=?`),
    blocked: db.prepare(`SELECT 1 n FROM contact_blocks WHERE bot_id=? AND user_id=?`),
    userCount: db.prepare(`SELECT COUNT(*) n FROM users`),
    botCount: db.prepare(`SELECT COUNT(*) n FROM bots`),
    activeBotCount: db.prepare(`SELECT COUNT(*) n FROM bots WHERE status='active'`)
  };

  return {
    touchUser(u) { s.upsertUser.run(u.id, u.username || null, u.first_name || null); },
    addBot(d) { return Number(s.addBot.run(d.ownerUserId,d.token,d.botId,d.username,d.firstName,d.template).lastInsertRowid); },
    getBot(id) { return s.getBot.get(id); },
    listBots() { return s.listBots.all(); },
    listOwnerBots(id) { return s.listOwnerBots.all(id); },
    listActiveBots() { return s.listActiveBots.all(); },
    setBotStatus(id,status) { s.setBotStatus.run(status,id); },
    markBotStarted(id) { s.markBotStarted.run(id); },
    botUserCount(id) { return Number(s.botUserCount.get(id).n); },
    contactCount(id) { return Number(s.contactCount.get(id).n); },
    touchBotUser(botId,u) { s.upsertBotUser.run(botId,u.id,u.username||null,u.first_name||null); },
    getBroadcastUsers(scope,botId) { return scope === 'bot' ? s.oneBotUsers.all(botId).map(x=>Number(x.user_id)) : s.allBotUsers.all().map(x=>Number(x.user_id)); },
    stats() { return { users:Number(s.userCount.get().n), bots:Number(s.botCount.get().n), activeBots:Number(s.activeBotCount.get().n) }; },
    addRequired(c) { s.addRequired.run(c.chatId,c.title,c.type,c.inviteUrl); },
    listRequired() { return s.listRequired.all(); },
    disableRequired(id) { s.disableRequired.run(id); },
    setSetting(k,v) { s.setSetting.run(k,String(v)); },
    getSetting(k) { return s.getSetting.get(k)?.value ?? null; },
    setBotSetting(id,k,v) { s.setBotSetting.run(id,k,String(v)); },
    getBotSetting(id,k) { return s.getBotSetting.get(id,k)?.value ?? null; },
    listBotSettings(id) { return s.listBotSettings.all(id); },
    setCommand(id,c,r) { s.setCommand.run(id,c,r); },
    deleteCommand(id,c) { s.deleteCommand.run(id,c); },
    listCommands(id) { return s.listCommands.all(id); },
    createBroadcast(scope,target,message) { return Number(s.addBroadcast.run(scope,target,message).lastInsertRowid); },
    finishBroadcast(id,sent,failed) { s.updateBroadcast.run(sent,failed,id); },
    recordContact(d) { s.addContact.run(d.botId,d.userId,d.username||null,d.firstName||null,d.messageType,d.messageId||null); },
    blockContact(botId,userId) { s.block.run(botId,userId); },
    unblockContact(botId,userId) { s.unblock.run(botId,userId); },
    isContactBlocked(botId,userId) { return Boolean(s.blocked.get(botId,userId)); },
    close() { db.close(); }
  };
}
