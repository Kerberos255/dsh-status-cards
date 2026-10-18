import test from 'node:test';
import assert from 'node:assert/strict';
import {statusCard} from '../feishu-personal-status.js';
import {discordStatusPanel} from '../discord-personal-status.js';

test('public status card titles are generic across both channels',()=>{
 const feishu=statusCard();
 const discord=discordStatusPanel();
 assert.equal(feishu.card.header.title.content,'📊 DSH 状态');
 assert.equal(feishu.card.config.summary.content,'DSH 状态 · 额度、余额与天气');
 assert(feishu.text.startsWith('📊 DSH 状态'));
 assert.equal(discord.embeds[0].title,'📊 DSH 状态');
 for(const rendered of [JSON.stringify(feishu),JSON.stringify(discord)]){
  const disallowed=[String.fromCharCode(0x767d,0x6cfd),String.fromCharCode(0x767d,0x6fa4),['bai','ze'].join('')];
  for(const label of disallowed)assert(!rendered.toLowerCase().includes(label));
 }
});
