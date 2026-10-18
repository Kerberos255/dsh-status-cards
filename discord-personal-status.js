import {ago,renderQuota,renderBalance,renderWeather} from './feishu-personal-status.js';

// A single compact Embed with deliberate breathing room; no interactive controls.
// Run /status again for fresh quota and balance data.
export function discordStatusPanel({recentAt=null,quota,balance,weather,now=Date.now()}={}){
 const main=weather?.locations?.[weather?.defaultLocation]??weather?.locations?.home;
 const generated=Date.parse(weather?.generatedAt);
 const updated=Number.isFinite(generated)?generated:now;
 const timestamp=new Date(updated).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false})+' (+08:00)';
 const clean=value=>String(value??'').replace(/[\r\n\x00-\x1f<>]/g,' ').slice(0,35);
 const section=lines=>lines.join('\n').slice(0,1000);
 const divider='──────────────';
 const description=[
  '最近响应：'+ago(recentAt,now),
  '',
  '**⚡ OpenCode Go 额度**',
  section(renderQuota(quota,now)),
  '',
  divider,
  '',
  '**💰 DeepSeek 余额**',
  section(renderBalance(balance)),
  '',
  divider,
  '',
  '**🌤 天气'+(main?.name?' · '+clean(main.name):'')+'**',
  section(renderWeather(weather,now))
 ].join('\n');
 return {
  embeds:[{
   title:'📊 DSH 状态',
   description,
   color:0x409EFF,
   footer:{text:'🕒 数据更新 '+timestamp}
  }],
  allowedMentions:{parse:[]}
 };
}
