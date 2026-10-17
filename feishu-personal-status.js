import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const clean=(value,max=100)=>String(value??'').replace(/[\r\n\x00-\x1f<>]/g,' ').trim().slice(0,max);
const zhTime=(date,zone='Asia/Shanghai',withDate=true)=>{
 const ms=Date.parse(date);
 if(!Number.isFinite(ms))return '';
 try{
  const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:zone,year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ms);
  const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return (withDate?Number(p.month)+'月'+Number(p.day)+'日 ':'')+p.hour+':'+p.minute;
 }catch{return '';}
};
export function ago(at,now=Date.now()){
 const age=now-Number(at);if(at===null||at===undefined||!Number.isFinite(age)||age<0)return '暂无记录';
 if(age<60000)return Math.floor(age/1000)+'秒前';
 if(age<3600000)return Math.floor(age/60000)+'分钟前';
 if(age<86400000)return Math.floor(age/3600000)+'小时前';
 return Math.floor(age/86400000)+'天前';
}
export function renderQuota(result,now=Date.now()){
 if(result?.state!=='ok'||!result.data?.usage)return ['⚪ 额度暂不可用'];
 const names={rolling:'5小时额度',weekly:'本周额度',monthly:'本月额度'};
 return Object.entries(names).map(([key,label])=>{
  const item=result.data.usage[key],used=item?.percent;
  if(!Number.isFinite(used))return '⚪ '+label+'：暂不可用';
  const remaining=Math.max(0,Math.min(100,100-used)),icon=remaining<=10?'🔴':remaining<=25?'🟡':'🟢';
  const today=new Date(now).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
  const resetDay=Number.isFinite(Date.parse(item.resetsAt))?new Date(item.resetsAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):'';
  const reset=zhTime(item.resetsAt,'Asia/Shanghai',!(key==='rolling'&&today===resetDay));
  return icon+' '+label+'：剩余 '+remaining+'%'+(reset?' · '+reset+' 重置':'');
 }).concat(result.stale?['⚠️ 额度为缓存，刷新失败']:[]);
}
function money(value){
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
}
export function renderBalance(result){
 if(result?.state!=='ok'||!Array.isArray(result.data?.balances))return ['⚪ 余额暂不可用'];
 const rows=result.data.balances, preferred=rows.find(x=>x.currency==='CNY')??rows.find(x=>x.currency==='USD');
 if(!preferred)return ['⚪ 余额暂不可用'];
 const isAccount=result.data.source==='account';
 const value=isAccount?money(preferred.normal):money(preferred.total);
 const gift=isAccount?money(preferred.bonus):null;
 if(value===null&&gift===null)return ['⚪ 余额暂不可用'];
 const symbol=preferred.currency==='CNY'?'¥':String.fromCharCode(36);
 const lines=[value!==null?'🟢 余额 '+symbol+value.toFixed(2):'🟢 赠送钱包 '+symbol+gift.toFixed(2)];
 if(value!==null&&gift!==null&&gift!==0)lines.push('🎁 赠送钱包 '+symbol+gift.toFixed(2));
 if(result.stale)lines.push('⚠️ 余额为缓存，刷新失败');
 return lines;
}

const icon=now=>{
 const n=Number(now?.icon);
 if(n===100)return '☀️';if(n===150)return '🌙';
 if(n>=101&&n<=103)return '⛅';if(n===104||n>=151&&n<=154)return '☁️';
 if(n>=300&&n<400)return '🌧️';if(n>=400&&n<500)return '❄️';
 if(n>=500&&n<520)return '🌫️';return '🌤';
};
const value=(x,alt='--')=>x===undefined||x===null||x===''?alt:clean(x,50);
export function readWeatherCache(filename){
 if(typeof filename!=='string'||!filename||!path.isAbsolute(filename))return null;
 try{
  if(statSync(filename).size>1024*1024)return null;
  const data=JSON.parse(readFileSync(filename,'utf8'));
  if(data.schemaVersion!==3||data.provider!=='qweather'||!data.locations||typeof data.locations!=='object')return null;
  return data;
 }catch{return null;}
}
export function renderWeather(cache,now=Date.now()){
 if(!cache)return ['⚪ 天气缓存暂不可用'];
 const sites=Object.entries(cache.locations).filter(([,v])=>v&&typeof v==='object'&&v.now?.now);
 const primary=cache.locations[cache.defaultLocation]??cache.locations.home??sites[0]?.[1];
 if(!primary?.now?.now)return ['⚪ 天气缓存暂无有效数据'];
 const current=primary.now.now,today=primary.daily?.daily?.[0]??{};
 const aqi=primary.airQuality?.indexes?.find(x=>x.code==='cn-mee')??primary.airQuality?.indexes?.[0]??{};
 const lines=[
  icon(current)+' '+value(current.text)+' '+value(current.temp)+'°C 体感'+value(current.feelsLike)+'°C',
  '🌡 今日 '+value(today.tempMin)+'~'+value(today.tempMax)+'°C  💧湿度'+value(current.humidity)+'%',
  '🍃 '+value(current.windDir)+' '+value(current.windScale)+'级  🌈 空气'+value(aqi.category)+' (AQI '+value(aqi.aqi)+')',
  '',
 ];
 const selected=[['home','🏠'],['work','🏢']].filter(([key])=>cache.locations[key]);
 if(!selected.length)selected.push([cache.defaultLocation??sites[0]?.[0],'📍']);
 for(const [key,emoji] of selected){
  const loc=cache.locations[key];
  if(loc)lines.push(emoji+' '+value(loc.minutely?.summary,'暂无分钟降水数据'));
 }
 const alerts=selected.flatMap(([key])=>cache.locations[key]?.alerts?.alerts??[]);
 const distinct=[...new Map(alerts.map(a=>[a.id??a.title??JSON.stringify(a),a])).values()];
 lines.push(distinct.length?'⚠️ '+distinct.slice(0,3).map(a=>value(a.title??a.eventType?.name??a.typeName,'天气预警')).join('、'):'✅ 当前无天气预警');
 const age=now-Date.parse(cache.generatedAt);
 if(Number.isFinite(age)&&age>2*3600000)lines.push('⚠️ 天气缓存已超过2小时');
 return lines;
}
export function statusCard({recentAt=null,quota,balance,weather,now=Date.now()}={}){
 const main=weather?.locations?.[weather.defaultLocation]??weather?.locations?.home;
 // Private Feishu card: the footer reflects the weather cache, not the time the menu was clicked.
 const cacheUpdatedAt=Date.parse(weather?.generatedAt);
 const displayAt=Number.isFinite(cacheUpdatedAt)?cacheUpdatedAt:now;
 const chunks=[
  ['最近响应：'+ago(recentAt,now)],
  ['⚡ OpenCode Go 额度',...renderQuota(quota,now)],
  ['💰 DeepSeek 余额',...renderBalance(balance)],
  ['🌤 天气'+(main?.name?' · '+clean(main.name,35):''),...renderWeather(weather,now)],
  ['🕒 数据更新 '+new Date(displayAt).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false})+' (+08:00)']
 ];
 const elements=[];
 chunks.forEach((lines,i)=>{
  if(i)elements.push({tag:'hr'});
  elements.push({tag:'markdown',content:lines.join('\n')});
 });
 const card={
  schema:'2.0',config:{wide_screen_mode:true,enable_forward:false,summary:{content:'白泽状态 · 额度、余额与天气'}},
  header:{template:'blue',title:{tag:'plain_text',content:'🐾 白泽状态'}},
  body:{elements}
 };
 if(Buffer.byteLength(JSON.stringify(card),'utf8')>20000)throw new Error('personal-status-card-oversize');
 return {card,text:'🐾 白泽状态\n'+chunks.map(x=>x.join('\n')).join('\n\n')};
}
