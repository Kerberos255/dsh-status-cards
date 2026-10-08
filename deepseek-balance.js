import { readBody } from './quota.js';

const fail=code=>Object.assign(new Error('DeepSeek 余额不可用'),{code});
const money=value=>{
  const s=typeof value==='number'?String(value):value;
  if(typeof s!=='string'||s.length>80||!/^[+-]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(s))throw fail('invalid-response');
  return s;
};

/** Native DSH account wallet: original decimal strings, no fabricated totals. */
export function normalizePlatformBalance(result){
 if(!result||result.status!=='ready'||!Array.isArray(result.value)||!Array.isArray(result.bonusWallets))
   throw fail(result?.status==='failed'?'read-failed':'invalid-response');
 const paid=new Map(),bonus=new Map();
 for(const [values,target] of [[result.value,paid],[result.bonusWallets,bonus]]){
  if(values.length>4)throw fail('invalid-response');
  for(const wallet of values){
    if(!wallet||!['CNY','USD'].includes(wallet.currency)||target.has(wallet.currency))throw fail('invalid-response');
    target.set(wallet.currency,money(wallet.balance));
  }
 }
 const balances=[...new Set([...paid.keys(),...bonus.keys()])].map(currency=>({
   currency,normal:paid.get(currency)??null,bonus:bonus.get(currency)??null
 }));
 if(!balances.length)throw fail('invalid-response');
 return {source:'account',balances};
}

export function deepSeekApiCredentialName(settings){
 const config=settings?.describe?.().find(row=>row.ns==='llm-deepseek')?.value;
 if(!config)return null;
 if(config.baseURL){
   let url;
   try{url=new URL(config.baseURL);}catch{return null;}
   if(url.protocol!=='https:'||url.hostname!=='api.deepseek.com'||url.port)return null;
 }
 const ref=config.apiKeyEnv||'DEEPSEEK_API_KEY';
 return typeof ref==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(ref)?ref:null;
}
async function apiKey(settings,credentials){
 const ref=deepSeekApiCredentialName(settings);
 if(!ref||!credentials?.resolve)return null;
 const result=await credentials.resolve(ref).catch(()=>null);
 return typeof result?.value==='string'&&result.value.trim()?result.value.trim():null;
}

/** Prefer native signed-in account; API source only if account not configured. */
export async function configuredSources(account,settings,credentials,flags={}){
 let opencodeGo=false,mode=null;
 if(flags.opencodeGoQuota!==false&&credentials?.resolve){
  const refs=['OPENCODE_GO_WORKSPACE_ID','OPENCODE_GO_AUTH_COOKIE','OPENCODE_GO_API_KEY'];
  const rows=await Promise.all(refs.map(key=>credentials.resolve(key).catch(()=>null)));
  const values=rows.map(x=>typeof x?.value==='string'&&!!x.value.trim());
  opencodeGo=!!(values[2]||(values[0]&&values[1]));
 }
 if(flags.deepseekBalance!==false){
  if(account?.getState){
   const state=await account.getState();
   if(state?.status==='credential-stored')mode='account';
  }
  if(!mode&&await apiKey(settings,credentials))mode='api';
 }
 return {opencodeGo,deepseek:!!mode,deepseekMode:mode};
}
export function normalizeApiBalance(raw){
 if(typeof raw?.is_available!=='boolean'||!Array.isArray(raw.balance_infos)||raw.balance_infos.length>4||!raw.balance_infos.length)
  throw fail('invalid-response');
 return {
   source:'api',available:raw.is_available,
   balances:raw.balance_infos.map(x=>{
     if(!x||!['CNY','USD'].includes(x.currency))throw fail('invalid-response');
     return {currency:x.currency,total:money(x.total_balance),granted:money(x.granted_balance),toppedUp:money(x.topped_up_balance)};
   }),
 };
}
async function readApiBalance(settings,credentials,signal,fetcher){
 const key=await apiKey(settings,credentials);
 if(!key)throw fail('unconfigured');
 signal?.throwIfAborted();
 const response=await fetcher('https://api.deepseek.com/user/balance',{
  method:'GET',redirect:'manual',signal,
  headers:{Authorization:'Bearer '+key,Accept:'application/json'}
 });
 if([401,403].includes(response.status)||(response.status>=300&&response.status<400)){
  await response.body?.cancel().catch(()=>{});throw fail('auth');
 }
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw fail('read-failed');}
 let value;
 try{value=JSON.parse(await readBody(response,signal,65536));}
 catch(e){if(e?.name==='AbortError')throw e;throw fail('invalid-response');}
 return normalizeApiBalance(value);
}
export async function readDeepSeekBalance(account,settings,credentials,client,signal,fetcher=fetch){
 const sources=await configuredSources(account,settings,credentials,{opencodeGoQuota:false});
 signal?.throwIfAborted();
 if(sources.deepseekMode==='account'){
   const data=await account.getBalance(client);
   signal?.throwIfAborted();
   if(data===null)throw fail('unconfigured');
   return normalizePlatformBalance(data);
 }
 if(sources.deepseekMode==='api')return readApiBalance(settings,credentials,signal,fetcher);
 throw fail('unconfigured');
}
