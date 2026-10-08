import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredSources, normalizePlatformBalance, normalizeApiBalance, deepSeekApiCredentialName, readDeepSeekBalance } from '../deepseek-balance.js';

const account=({signedIn=false,balance=null}={})=>({
  getState:async()=>({status:signedIn?'credential-stored':'signed-out'}),
  getBalance:async()=>balance,
});
const settings=(value=null)=>({describe:()=>value?[{ns:'llm-deepseek',value}]:[]});
const credentials=map=>({resolve:async id=>map[id]?{value:map[id]}:null});
const api={is_available:true,balance_infos:[{currency:'CNY',total_balance:'0.00',granted_balance:'0.00',topped_up_balance:'0.00'}]};
const wallets={status:'ready',value:[{currency:'CNY',balance:'11.38'}],bonusWallets:[{currency:'CNY',balance:'0.00'}]};

test('signed-in DeepSeek account is configured without any API key',async()=>{
 const result=await configuredSources(account({signedIn:true}),settings(),credentials({}));
 assert.deepEqual(result,{opencodeGo:false,deepseek:true,deepseekMode:'account'});
 const data=await readDeepSeekBalance(account({signedIn:true,balance:wallets}),settings(),credentials({}),{version:'0.2.0',locale:'zh_CN',timezoneOffsetSeconds:28800},new AbortController().signal,async()=>{throw Error('unexpected API fetch')});
 assert.deepEqual(data,{source:'account',balances:[{currency:'CNY',normal:'11.38',bonus:'0.00'}]});
});

test('when signed out, configured API key is a supported alternate source',async()=>{
 const cfg=settings({apiKeyEnv:'DEEPSEEK_API_KEY',baseURL:'https://api.deepseek.com/v1'});
 const creds=credentials({DEEPSEEK_API_KEY:'TEST_KEY'});
 assert.deepEqual(await configuredSources(account(),cfg,creds),{opencodeGo:false,deepseek:true,deepseekMode:'api'});
 let target;
 const result=await readDeepSeekBalance(account(),cfg,creds,{version:'0.2.0',locale:'zh_CN',timezoneOffsetSeconds:0},new AbortController().signal,async(url,options)=>{
   target={url,options};
   return new Response(JSON.stringify(api),{status:200});
 });
 assert.equal(target.url,'https://api.deepseek.com/user/balance');
 assert.equal(target.options.headers.Authorization,'Bearer TEST_KEY');
 assert.equal(target.options.redirect,'manual');
 assert.deepEqual(result,{source:'api',available:true,balances:[{currency:'CNY',total:'0.00',granted:'0.00',toppedUp:'0.00'}]});
 assert(!JSON.stringify(result).includes('TEST_KEY'));
});

test('when both present, native account wins; no configured source hides DeepSeek section',async()=>{
 const cfg=settings({apiKeyEnv:'DEEPSEEK_API_KEY'});
 const creds=credentials({DEEPSEEK_API_KEY:'TOKEN',OPENCODE_GO_API_KEY:'GO'});
 assert.deepEqual(await configuredSources(account({signedIn:true}),cfg,creds),{opencodeGo:true,deepseek:true,deepseekMode:'account'});
 assert.deepEqual(await configuredSources(account(),settings(),credentials({})),{opencodeGo:false,deepseek:false,deepseekMode:null});
 assert.deepEqual(await configuredSources(account({signedIn:true}),cfg,creds,{deepseekBalance:false}),{opencodeGo:true,deepseek:false,deepseekMode:null});
 assert.deepEqual(await configuredSources(account(),cfg,creds,{opencodeGoQuota:false}),{opencodeGo:false,deepseek:true,deepseekMode:'api'});
});

test('invalid endpoint and failed responses do not silently become zero',async()=>{
 assert.equal(deepSeekApiCredentialName(settings({apiKeyEnv:'INVALID KEY'})),null);
 assert.equal(deepSeekApiCredentialName(settings({baseURL:'https://other.example/v1'})),null);
 assert.equal(deepSeekApiCredentialName(settings({baseURL:'http://api.deepseek.com/v1'})),null);
 assert.throws(()=>normalizeApiBalance({...api,balance_infos:[{currency:'CNY',total_balance:'NaN',granted_balance:'0',topped_up_balance:'0'}]}),{code:'invalid-response'});
 assert.throws(()=>normalizePlatformBalance({status:'failed'}),{code:'read-failed'});
 assert.equal(normalizePlatformBalance({status:'ready',value:[{currency:'CNY',balance:'11.380000000000001'}],bonusWallets:[]}).balances[0].normal,'11.380000000000001');
 const cfg=settings({apiKeyEnv:'DEEPSEEK_API_KEY'}),creds=credentials({DEEPSEEK_API_KEY:'TOKEN'});
 await assert.rejects(readDeepSeekBalance(account(),cfg,creds,{},new AbortController().signal,async()=>new Response(null,{status:302})),{code:'auth'});
 await assert.rejects(readDeepSeekBalance(account({signedIn:true,balance:{status:'failed'}}),cfg,creds,{},new AbortController().signal,async()=>{throw Error('unexpected fallback')}),{code:'read-failed'});
 await assert.rejects(readDeepSeekBalance(account(),settings(),credentials({}),{},new AbortController().signal),{code:'unconfigured'});
});
