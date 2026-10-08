function PluginPanel({ scope, connection }) {
  const e = React.createElement, [snapshot, setSnapshot] = React.useState(null), [options, setOptions] = React.useState([]), [sessionId, setSession] = React.useState(''),
    [quota, setQuota] = React.useState(null), [balance, setBalance] = React.useState(null), [sources, setSources] = React.useState(null), [sourceIssue, setSourceIssue] = React.useState(''), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false);
  const epoch = React.useRef(0), serial = React.useRef(0), controller = React.useRef(null), selection = React.useRef('');
  const formatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (currency,value) => (currency === 'CNY' ? '¥' : String.fromCharCode(36)) + formatter.format(Number(value));
  const config = useFileConfig(scope);
  const call = React.useCallback(async (method, args, signal) => {
    const result = await connection.rpc.call('/api', 'statusCenter/'+method, { args }, signal);
    if (!result.ok) throw new Error(result.error.message); return result.value;
  }, [connection]);
  const refresh = React.useCallback(() => {
    const generation=epoch.current, request=++serial.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]), active=()=>epoch.current===generation&&serial.current===request&&!abort.signal.aborted, current=()=>active()&&!signal.aborted;
    setBusy(true);setError('');
    void Promise.all([call('getSnapshot',{sessionId:selection.current},signal),call('sessionOptions',{},signal)]).then(([value,rows])=>{
      if(current()){setSnapshot(value);setOptions(rows.data??[]);}
    },reason=>{if(active())setError(signal.aborted?'状态查询超时，请稍后刷新。':reason.message);}).finally(()=>{if(active())setBusy(false);});
    void call('getQuotaSources',{},signal).then(value=>{
      if(!current())return;
      if(value?.state!=='ok'||!value.data)throw new Error('无法检测额度来源');
      setSources(value.data);setSourceIssue('');
      if(value.data.opencodeGo)void call('getQuota',{},signal).then(v=>{if(current())setQuota(v);},()=>{if(active())setQuota({state:'unavailable',data:null});});
      else setQuota(null);
      if(value.data.deepseek)void call('getDeepSeekBalance',{},signal).then(v=>{if(current())setBalance(v);},()=>{if(active())setBalance({state:'unavailable',data:null});});
      else setBalance(null);
    }).catch(()=>{if(active()){setSources(null);setSourceIssue('暂时无法检查额度配置');}});
    return ()=>abort.abort();
  },[call,config.value?.opencodeGoQuota,config.value?.deepseekBalance]);
  React.useEffect(()=>{
    epoch.current++;const dispose=refresh(),focus=()=>refresh(),visible=()=>{if(document.visibilityState==='visible')refresh();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);
    return ()=>{epoch.current++;dispose();controller.current?.abort();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};
  },[refresh]);
  const stateText=value=>value?.state==='ok'?(value.stale?'缓存，刷新失败':'正常'):value?.state==='disabled'?'已停用':value?.state==='not-applicable'?'当前预设不适用':value?.state==='not-selected'?'请选择会话':'状态不可用';
  const metric=(value,key,suffix='')=>value?.data&&value.data[key]!==null&&value.data[key]!==undefined?value.data[key]+suffix:stateText(value);
  const row=(name,text)=>e('div',{className:'dsc-status-row',key:name},e('dt',null,name),e('dd',null,text));
  const findingNames={session:'当前会话',plugins:'插件',channels:'渠道',jobs:'后台作业',schedule:'自动任务',coordination:'输入协调',memory:'长期记忆',workshop:'技能工坊',lcm:'LCM',discord:'Discord',feishu:'飞书'};
  const findingReasons={'plugin-failed':'插件加载失败',disconnected:'连接已断开','invalid-config':'设置文件无效','uncertain-input':'有输入需要恢复核对','schedule-error':'自动任务配置异常','workflow-needs-review':'自动任务执行需要核对','template-needs-review':'自动任务计划需要核对','publication-needs-review':'技能发布恢复需要审阅','memory-needs-review':'记忆写入恢复需要审阅','vector-cleanup-pending':'外部向量清理待完成',stale:'刷新失败，使用缓存',unavailable:'状态不可用','service-unavailable':'服务尚未加载','plugin-error':'插件需要检查',timeout:'查询超时','read-failed':'查询失败'};
  return e('section',{className:'dsc-status-settings','aria-label':'统一状态中心'},
    e('style',null,'.dsc-status-settings{margin-bottom:28px}.dsc-status-settings h4{margin:0 0 12px;font-size:14px}.dsc-status-settings p{font-size:12px;line-height:1.65}.dsc-status-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.dsc-status-toolbar select{max-width:420px;min-width:180px;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit}.dsc-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:16px}.dsc-status-group{padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px}.dsc-status-group dl{margin:0}.dsc-status-row{display:flex;justify-content:space-between;gap:16px;margin:12px 0;font-size:13px}.dsc-status-row dt{color:var(--dsw-alias-label-secondary)}.dsc-status-row dd{margin:0;overflow-wrap:anywhere;text-align:right}.dsc-status-time{color:var(--dsw-alias-label-tertiary)}'),
    e('h4',null,'运行概况'),e('div',{className:'dsc-status-toolbar'},e('select',{'aria-label':'状态会话',value:sessionId,onChange:event=>{const id=event.target.value;selection.current=id;setSession(id);setSnapshot(null);refresh();}},e('option',{value:''},'整个客户端'),...options.map(item=>e('option',{value:item.id,key:item.id},(item.preset?item.preset+' · ':'')+item.id))),
      e(DshButton,{type:'button',variant:'outline',disabled:busy,onClick:()=>refresh()},busy?'读取中…':'刷新状态')),
    error?e('p',{role:'alert'},error):null,
    snapshot?e(React.Fragment,null,e('div',{className:'dsc-status-grid'},
      e('section',{className:'dsc-status-group'},e('h4',null,'运行环境'),e('dl',null,row('DSH',snapshot.runtime.version??'版本未知'),row('运行时间',Math.floor(snapshot.runtime.uptimeSeconds/60)+' 分钟'),row('插件',metric(snapshot.plugins,'active',' 个运行中')+(snapshot.plugins.data?.failed?' · '+snapshot.plugins.data.failed+' 个异常':'')),row('会话预设',snapshot.session.data?.preset??stateText(snapshot.session)),row('模型',snapshot.session.data?.model?.model??'尚未记录'),row('上下文',snapshot.session.data?.contextTokens!=null?snapshot.session.data.contextTokens+' token':'暂无测量'))),
      e('section',{className:'dsc-status-group'},e('h4',null,'渠道与任务'),e('dl',null,...(snapshot.channels.data??[]).map(channel=>row(channel.provider==='discord'?'Discord':'飞书',{connected:'已连接',disconnected:'未连接',disabled:'已停用',unavailable:'状态不可用'}[channel.state])),row('后台作业',metric(snapshot.jobs,'running',' 个运行中')),row('自动任务',metric(snapshot.schedule,'active',' 个已启用')),row('等待回答或审批',metric(snapshot.coordination,'pendingInteractions',' 项')))),
      e('section',{className:'dsc-status-group'},e('h4',null,'记忆与技能'),e('dl',null,row('LCM',stateText(snapshot.lcm)),row('已索引事件',metric(snapshot.lcm,'indexedEvents',' 个')),row('Dream',snapshot.memory.data?.busy?'整理中':stateText(snapshot.memory)),row('记忆候选',snapshot.memory.data?.candidates?(snapshot.memory.data.candidates.pending??0)+' 项待审':stateText(snapshot.memory)),row('技能提案',snapshot.workshop.data?.proposals?(snapshot.workshop.data.proposals.pending??0)+' 项待审':stateText(snapshot.workshop))))),
      snapshot.health.findings.length?e('ul',{'aria-label':'健康检查结果'},...snapshot.health.findings.map((item,index)=>e('li',{key:index},(findingNames[item.item]??item.item)+'：'+(findingReasons[item.code]??'状态不可用')))):e('p',{role:'status'},'当前检查项正常。'),
      e('p',{className:'dsc-status-time'},'更新于 '+new Date(snapshot.generatedAt).toLocaleTimeString('zh-CN')+'；页面空闲时不轮询。')):null,
    (sources || sourceIssue)
      ? e('section',{className:'dsc-status-group'},e('h4',null,'模型额度与余额'),
          sources?.opencodeGo ? e('div',null,e('h4',null,'OpenCode Go'),
            quota?.data?.usage ? e('dl',null,...[['rolling','5 小时'],['weekly','每周'],['monthly','每月']]
              .map(([key,name])=>row(name,'剩余 '+(100-quota.data.usage[key].percent)+'%')))
            :e('p',null,quota?.state==='unavailable'?'额度暂不可用':'正在读取额度…')):null,
          sources?.deepseek ? e('div',null,e('h4',null,'DeepSeek '+(sources.deepseekMode==='account'?'账号余额':'API 余额')),
            balance?.data?.balances ? e('dl',null,...balance.data.balances.flatMap(item=>{
              const currency=item.currency;
              return balance.data.source==='account'
                ? [item.normal!==null?row(item.currency+' 充值钱包',money(currency,item.normal)):null,
                   item.bonus!==null&&Number(item.bonus)!==0?row(item.currency+' 赠送钱包',money(currency,item.bonus)):null].filter(Boolean)
                : [row(item.currency+' 总余额',money(currency,item.total))];
            })) :e('p',null,balance?.state==='unavailable'?'余额暂不可用':'正在读取余额…')):null,
          !sources?.opencodeGo&&!sources?.deepseek ?
            e('p',null,sourceIssue||'尚未配置额度来源：配置 OpenCode Go 或 DeepSeek 后即可查看。'):null)
      :null);
}
