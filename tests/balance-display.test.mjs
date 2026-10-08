import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source=fs.readFileSync(path.join(import.meta.dirname,'../client.js'),'utf8');
const start=source.indexOf('function DeepSeekBalanceCard('),end=source.indexOf('function apply(ctx)',start);
assert(start>=0&&end>start,'DeepSeek balance UI must remain in the card');
const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children})};
const render=vm.runInNewContext(source.slice(start,end)+';DeepSeekBalanceCard',{React,Intl,Number,String});
function flatten(node){
 if(node==null)return '';
 if(Array.isArray(node))return node.map(flatten).join(' ');
 if(typeof node==='string'||typeof node==='number')return String(node);
 return node.children.map(flatten).join(' ');
}
function collect(node,predicate,results=[]){
 if(node==null)return results;
 if(Array.isArray(node)){node.forEach(x=>collect(x,predicate,results));return results;}
 if(typeof node==='object'){if(predicate(node))results.push(node);node.children?.forEach(x=>collect(x,predicate,results));}
 return results;
}
test('rounds to 2 decimal places, hides exact zero gift balance, preserves original precision in title',()=>{
 const tree=render({mode:'account',balance:{source:'account',balances:[{currency:'CNY',normal:'11.2949329600000000',bonus:'0.00'}]}});
 const s=flatten(tree);
 assert.match(s,/¥11\.29/);
 assert.doesNotMatch(s,/11\.29493296/);
 assert.doesNotMatch(s,/赠送钱包/);
 const original=collect(tree,x=>x.props?.title==='11.2949329600000000');
 assert.equal(original.length,1);
});
test('shows nonzero gift balance and rounds it, keeps API total of zero',()=>{
 const account=flatten(render({mode:'account',balance:{source:'account',balances:[{currency:'CNY',normal:'11.2949',bonus:'0.765'}]}}));
 assert.match(account,/赠送钱包/);
 assert.match(account,/¥0\.77/);
 const api=flatten(render({mode:'api',balance:{source:'api',available:true,balances:[{currency:'CNY',total:'0.00',granted:'0.00',toppedUp:'0.00'}]}}));
 assert.match(api,/总余额/);
 assert.match(api,/¥0\.00/);
});
test('plugin settings panel uses same zero-gift hiding and amount formatting',()=>{
 const panel=fs.readFileSync(path.join(import.meta.dirname,'../client-panel.inc.js'),'utf8');
 assert.match(panel,/Number\(item\.bonus\)!==0/);
 assert.match(panel,/maximumFractionDigits:\s*2/);
});
