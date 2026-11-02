import assert from 'node:assert/strict';
import { createDatabase } from '../src/database.js';
import fs from 'node:fs';
const p='/tmp/bot-maker-test.sqlite';
try { fs.rmSync(p,{force:true}); } catch {}
const db=createDatabase(p);
db.touchUser({id:1,username:'test',first_name:'Test'});
assert.equal(db.stats().users,1);
db.addRequired({chatId:'-1001',title:'Test',type:'channel',inviteUrl:'https://t.me/test'});
assert.equal(db.listRequired().length,1);
db.close();
fs.rmSync(p,{force:true});
console.log('Smoke test passed.');
