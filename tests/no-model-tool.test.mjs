import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
test('status cards use native statusCenter APIs without injecting a model tool',()=>{
 const source=fs.readFileSync(fileURLToPath(new URL('../status-center.js',import.meta.url)),'utf8');
 assert(!source.includes("scope.tools.register("));
 assert(!source.includes("name:'status_health_check'"));
 assert(source.includes('async snapshot('));
 assert(source.includes('feishuPersonalStatus('));
 assert(source.includes('discordPersonalStatus('));
});
