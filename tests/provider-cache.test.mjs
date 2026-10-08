import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderCache} from '../provider-cache.js';

test('caches successful provider reads, then refreshes after TTL',async()=>{
 let now=0,calls=0;
 const cache=new ProviderCache({clock:()=>now});
 const load=async()=>{calls++;return{state:'ok',data:{n:calls}}};
 assert.equal((await cache.read('quota',load,{ttl:1000})).data.n,1);
 assert.equal((await cache.read('quota',load,{ttl:1000})).data.n,1);
 now=1001;
 assert.equal((await cache.read('quota',load,{ttl:1000})).data.n,2);
 assert.equal(calls,2);
 cache.close();
});
test('multiple simultaneous requests share a single in-flight read',async()=>{
 const cache=new ProviderCache();let count=0;
 const load=async()=>{count++;await new Promise(resolve=>setTimeout(resolve,12));return{state:'ok',data:1}};
 const [a,b]=await Promise.all([cache.read('same',load),cache.read('same',load)]);
 assert.equal(a.data,1);assert.equal(b.data,1);assert.equal(count,1);
 cache.close();
});
test('failure is isolated and cannot report fabricated zero',async()=>{
 const cache=new ProviderCache();
 const result=await cache.read('bad',async()=>{throw Object.assign(new Error('bad'),{code:'auth'})});
 assert.equal(result.state,'unavailable');
 assert.equal(result.data,null);
 assert.equal(result.code,'auth');
 cache.close();
 assert.equal((await cache.read('bad',async()=>({state:'ok',data:1}))).code,'closed');
});
