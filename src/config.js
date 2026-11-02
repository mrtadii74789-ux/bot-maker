import 'dotenv/config';
import path from 'node:path';

const botToken = process.env.BOT_TOKEN?.trim();
const ownerId = Number(process.env.OWNER_ID || '0');
const dbPath = path.resolve(process.env.DB_PATH || '/data/bot-maker.sqlite');

if (!botToken) throw new Error('BOT_TOKEN is required.');
if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
  throw new Error('OWNER_ID must be a positive integer.');
}

export const config = Object.freeze({ botToken, ownerId, dbPath });
