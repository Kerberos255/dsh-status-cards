window.__ModuleLoader__.load({
  id: 'dsh-status-cards',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
// BEGIN GENERATED PLUGIN SETTINGS
// Embedded by build.mjs. React and the official Connection are provided by DSH.
const { Switch: DshSwitch, Button: DshButton } = require('@deepseek-ai/dsh-client-ui-primitives');
function createConfigScope(connection, endpoint) {
  let state = { status: 'loading', writable: connection.isLoopback !== false }, closed = false, serial = 0, saving = false;
  const listeners = new Set(), requests = new Set();
  const publish = next => { if (!closed) { state = next; for (const fn of listeners) fn(); } };
  const call = async (method, args) => {
    if (closed) throw new Error('插件已停用');
    const abort = new AbortController(); requests.add(abort);
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const result = await connection.rpc.call('/api', endpoint + '/' + method, { args }, abort.signal);
      if (!result.ok) throw Object.assign(new Error(result.error?.message || result.error?.code || '请求失败'), { code: result.error?.code });
      return result.value;
    } finally { clearTimeout(timeout); requests.delete(abort); }
  };
  const accept = value => publish({ ...value, status: 'ready', writable: connection.isLoopback !== false, requestError: '' });
  const scope = {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async reload() {
      const sequence = ++serial;
      try { const value = await call('getConfig', {}); if (sequence === serial) accept(value); return value; }
      catch (error) { if (sequence === serial) publish({ ...state, requestError: error.message }); throw error; }
    },
    async update(value, revision = state.revision) {
      if (saving) throw new Error('正在保存，请稍候');
      saving = true; ++serial;
      try { const result = await call('setConfig', { value, revision }); accept(result); return result; }
      finally { saving = false; }
    },
    set(key, value) { return scope.update({ ...state.value, [key]: value }); },
    call,
    async runAction() { const result = await call('runAction', {}); accept(result); return result; },
    close() { closed = true; ++serial; for (const abort of requests) abort.abort(); listeners.clear(); },
  };
  return scope;
}
function useFileConfig(scope) {
  return React.useSyncExternalStore(scope.subscribe, scope.getSnapshot, scope.getSnapshot);
}
const configValue=(value,key)=>key.split('.').reduce((current,part)=>current?.[part],value);
const configChange=(value,key,next)=>{
  const [head,...tail]=key.split('.');
  return {...value,[head]:tail.length?configChange(value[head],tail.join('.'),next):next};
};
function ModelPicker({ scope, kind='chat', provider, model, disabled, label, onChange }) {
  const e=React.createElement, [catalog,setCatalog]=React.useState({groups:[]}), [error,setError]=React.useState('');
  React.useEffect(()=>{
    let active=true,sequence=0;
    const load=()=>{const current=++sequence;scope.call('modelCatalog',{kind}).then(value=>{if(active&&current===sequence){setCatalog(value);setError('');}}).catch(failure=>{if(active&&current===sequence)setError(failure.message);});};
    load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load);};
  },[scope,kind]);
  const encode=(provider,model)=>JSON.stringify([provider,model]),value=encode(provider||'',model||'');
  const known=catalog.groups.some(group=>group.models.some(entry=>group.id===provider&&entry.id===model));
  return e('div',null,e('select',{'aria-label':label,value,disabled,onChange:event=>{const [provider,model]=JSON.parse(event.target.value);onChange({provider,model});}},
    e('option',{value:encode('','')},kind==='embedding'?'词语检索（不使用向量模型）':'继承 DSH 默认模型'),
    provider&&model&&!known?e('option',{value},`${provider} / ${model}（当前配置）`):null,
    catalog.groups.map(group=>e('optgroup',{key:group.id,label:group.name||group.id},group.models.map(entry=>e('option',{key:entry.id,value:encode(group.id,entry.id)},entry.name||entry.id))))),
    error?e('small',{role:'status'},'模型目录暂不可用：'+error):kind==='embedding'&&!catalog.groups.length?e('small',null,'尚未注册向量模型。'):null);
}
function FileConfigPage({ scope, title, description, fields, actionLabel, credentialApi, credentials, credentialTitle='凭证', credentialsFirst=false }) {
  const e = React.createElement, snapshot = useFileConfig(scope);
  const [editor, setEditor] = React.useState({ base: null, draft: null, error: '', saved: false });
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false), alive = React.useRef(false);
  const dirty = !!editor.base && JSON.stringify(editor.draft) !== JSON.stringify(editor.base.value);
  const external = !!editor.base && snapshot.revision !== editor.base.revision;
  React.useEffect(() => {
    if (snapshot.status !== 'ready') return;
    setEditor(previous => !previous.base || (!busyRef.current && JSON.stringify(previous.draft) === JSON.stringify(previous.base.value))
      ? { base: snapshot, draft: structuredClone(snapshot.value), error: '', saved: previous.saved } : previous);
  }, [snapshot]);
  React.useEffect(() => {
    alive.current = true;
    let reloading = false;
    const reload = () => {
      if (busyRef.current || reloading) return;
      reloading = true;
      void scope.reload().catch(() => {}).finally(() => { reloading = false; });
    };
    reload(); window.addEventListener('focus', reload);
    const interval = actionLabel ? setInterval(() => { if (document.visibilityState !== 'hidden') reload(); }, 2000) : null;
    return () => { alive.current = false; window.removeEventListener('focus', reload); if (interval) clearInterval(interval); };
  }, [scope, actionLabel]);
  const work = async operation => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await operation(); }
    catch (error) { if (alive.current) setEditor(previous => ({ ...previous, error: error.message, errorCode: error.code, saved: false })); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const replace = result => { if (alive.current) setEditor({ base: result, draft: structuredClone(result.value), error: '', saved: false }); };
  const change = (key, value) => setEditor(previous => ({ ...previous, draft: configChange(previous.draft,key,value), error: '', errorCode: '', saved: false }));
  const disabled = busy || !snapshot.writable || !editor.draft;
  const field = spec => {
    const value = configValue(editor.draft,spec.key), id = 'dsh-config-' + spec.key;
    const common = { id, disabled: disabled || spec.disabled, 'aria-label': spec.label };
    let input;
    if (spec.type === 'readonly') input = e('input', { ...common, type: 'text', readOnly: true, value: snapshot.details?.[spec.detail] ?? '', placeholder: spec.placeholder });
    else if (spec.type === 'boolean') input = e(DshSwitch, { label: spec.label, disabled: common.disabled, checked: value, onChange: next => change(spec.key, next) });
    else if (spec.type === 'multiline') input = e('textarea', {...common,rows:5,value,onChange:event=>change(spec.key,event.target.value)});
    else if (spec.type === 'list') input = e('textarea', {...common, rows: Math.max(3,Math.min(8,value.length+1)), value:editor.listText?.[spec.key]??value.join('\n'),
      onChange:event=>{const text=event.target.value;setEditor(previous=>({...previous,draft:configChange(previous.draft,spec.key,text.split(/[\n,]/).map(item=>item.trim()).filter(Boolean)),listText:{...previous.listText,[spec.key]:text},error:'',errorCode:'',saved:false}));} });
    else if (spec.type === 'model') input = e(ModelPicker,{scope,kind:spec.kind,provider:configValue(editor.draft,spec.providerKey),model:value,disabled:common.disabled,label:spec.label,onChange:selection=>setEditor(previous=>({...previous,draft:configChange(configChange(previous.draft,spec.providerKey,selection.provider),spec.key,selection.model),error:'',errorCode:'',saved:false}))});
    else if (spec.type === 'select') input = e('select', { ...common, value, onChange: event => change(spec.key, spec.numeric ? Number(event.target.value) : event.target.value) }, spec.options.map(([key, label]) => e('option', { key, value: key }, label)));
    else if (spec.type === 'order' || spec.type === 'providers') input = e('ol', { className: 'dpc-order' }, value.map((key, index) => e('li', { key },
      e('span', { className: 'dpc-rank', 'aria-hidden': true }, index + 1), e('span', { className: 'dpc-provider-name' }, spec.labels[key] || key),
      spec.type === 'providers' ? e(DshSwitch, { label: '启用 ' + (spec.labels[key] || key), checked: editor.draft.enabledProviders.includes(key), disabled,
        onChange: next => change('enabledProviders', next ? [...editor.draft.enabledProviders, key] : editor.draft.enabledProviders.filter(item => item !== key)) }) : null,
      e('div', { className: 'dpc-order-actions' }, ...[-1, 1].map(delta => e(DshButton, {
        key: delta, type: 'button', disabled: disabled || index + delta < 0 || index + delta >= value.length,
        variant: 'ghost', size: 'sm', className: 'dpc-arrow', title: delta < 0 ? '上移' : '下移',
        'aria-label': (delta < 0 ? '上移 ' : '下移 ') + (spec.labels[key] || key),
        onClick: () => { const next = [...value]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; change(spec.key, next); },
      }, e('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true },
        e('path', { d: delta < 0 ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6' }))))))));
    else if (spec.type === 'choices') input = e('div', null, Object.entries(spec.labels).map(([key, label]) => e('label', { className: 'dpc-choice', key }, e('input', {
      type: 'checkbox', checked: value.includes(key), disabled, onChange: event => change(spec.key, event.target.checked ? [...value, key] : value.filter(x => x !== key)),
    }), ' ', label)));
    else input = e('input', { ...common, type: spec.type === 'number' ? 'number' : 'text', value,
      min: spec.min, max: spec.max, step: spec.step ?? 1,
      onChange: event => change(spec.key, spec.type === 'number' ? Number(event.target.value) : event.target.value),
    });
    return e('div', { className: 'dpc-field dpc-' + spec.type, key: spec.key },
      e('div', { className: 'dpc-label' }, e('label', { htmlFor: spec.type === 'boolean' ? undefined : id }, spec.label), spec.help ? e('small', null, spec.help) : null, spec.emptyHelp&&Array.isArray(value)&&!value.length?e('small',null,spec.emptyHelp):null),
      e('div', { className: 'dpc-control' }, input));
  };
  const visible=spec=>!spec.when||(Array.isArray(spec.when)?spec.when:[spec.when]).some(condition=>Object.entries(condition).every(([key,value])=>configValue(editor.draft,key)===value));
  const grouped=advanced=>{
    const groups=[];
    for(const spec of fields.filter(spec=>!!spec.advanced===advanced&&visible(spec))){
      if(!groups.length||groups.at(-1).title!==(spec.group||''))groups.push({title:spec.group||'',fields:[]});
      groups.at(-1).fields.push(spec);
    }
    return groups.map((group,index)=>e('section',{className:'dpc-group',key:index},group.title?e('h4',null,group.title):null,group.fields.map(field)));
  };
  const credentialView=credentialApi&&credentials&&snapshot.value?e(CredentialsPage,{api:credentialApi,refs:credentials(snapshot.value),writable:snapshot.writable,title:credentialTitle,expanded:credentialsFirst}):null;
  const reloadNeeded = external || snapshot.requestError || editor.errorCode?.includes('conflict');
  return e('form', { className: 'dpc-page', 'aria-label': title, onSubmit: event => { event.preventDefault(); if (disabled || external || (!dirty && !snapshot.error)) return;
    void work(async () => { const result = await scope.update(editor.draft, editor.base.revision); replace(result); if (alive.current) setEditor(previous => ({ ...previous, saved: true })); });
  } },credentialsFirst?credentialView:null,editor.draft?grouped(false):e('p',null,'正在读取配置…'),
    editor.draft&&fields.some(spec=>spec.advanced&&visible(spec))?e('details',{className:'dpc-advanced'},e('summary',null,'高级设置'),grouped(true)):null,
    snapshot.error ? e('p', { role: 'alert' }, '文件有误，运行时保留上一次有效设置。', snapshot.error.message, '；保存可修复文件。') : null,
    external ? e('p', { role: 'alert' }, '配置已被其他页面或文件编辑修改。重新载入后再保存，可避免覆盖外部修改。') : null,
    editor.error || snapshot.requestError ? e('p', { role: 'alert' }, editor.error || snapshot.requestError) : null,
    e('div', { className: 'dpc-actions' }, e(DshButton, { type: 'submit', variant: 'primary', disabled: disabled || external || (!dirty && !snapshot.error) }, busy ? '处理中…' : '保存'),
      reloadNeeded ? e(DshButton, { type: 'button', variant: 'outline', disabled: busy, onClick: () => void work(async () => replace(await scope.reload())) }, dirty ? '放弃草稿并重新载入' : '重新载入') : null,
      actionLabel ? e(DshButton, { type: 'button', variant: 'outline', disabled: busy || !snapshot.writable, onClick: () => void work(async () => { await scope.runAction(); }) }, actionLabel) : null,
      e('span', { role: 'status' }, editor.saved ? '已保存并生效' : dirty ? '尚未保存' : '')),
    snapshot.details ? e('p', { role: 'status' }, snapshot.details.message) : null,
    e('p', { className: 'dpc-note' }, '保存后自动应用，后续操作使用新配置。'),
    snapshot.configFile ? e('details', { className: 'dpc-path' }, e('summary', null, '配置文件'), e('code', null, snapshot.configFile)) : null,
    credentialsFirst?null:credentialView,
  );
}
function CredentialsPage({ api, refs, writable, title, expanded=false }) {
  const e = React.createElement;
  const [status, setStatus] = React.useState({}), [drafts, setDrafts] = React.useState({}), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const alive = React.useRef(false), running = React.useRef(false);
  const identity = JSON.stringify(refs);
  React.useEffect(() => {
    let active = true;
    alive.current = true;
    void api.describe(Object.keys(refs)).then(result => {
      if (!active) return;
      if (!result.ok) throw new Error(result.error?.message || '读取凭证状态失败');
      setStatus(result.value);
    }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; alive.current = false; };
  }, [api, identity]);
  const save = async (ref, clear) => {
    if (running.current || !writable) return; running.current = true; setBusy(true); setError('');
    try {
      const result = clear ? await api.unset(ref) : await api.set(ref, drafts[ref]);
      if (!result.ok) throw new Error(result.error?.message || '保存凭证失败');
      if (!alive.current) return;
      setDrafts(previous => ({ ...previous, [ref]: '' }));
      setStatus(previous => ({ ...previous, [ref]: { configured: !clear } }));
    } catch (reason) { if (alive.current) setError(reason.message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  return e(expanded?'section':'details', { className: 'dpc-credentials' }, e(expanded?'h4':'summary', null, title), e('fieldset', { disabled: busy || !writable },
    e('p', null, '密钥单独保存到 DSH 凭证管理；已有密钥只显示配置状态。'),
    Object.entries(refs).map(([ref, label]) => e('div', { className: 'dpc-field', key: ref }, e('label', null, label, ' · ', ref),
      e('input', { type: 'password', autoComplete: 'new-password', 'aria-label': label + ' 密钥', value: drafts[ref] || '', placeholder: status[ref]?.configured ? '已配置；留空保持' : '未配置',
        onChange: event => setDrafts(previous => ({ ...previous, [ref]: event.target.value })) }),
      e('div', { className: 'dpc-actions' }, e(DshButton, { type: 'button', variant: 'outline', disabled: !drafts[ref], onClick: () => void save(ref, false) }, '保存密钥'),
        e(DshButton, { type: 'button', variant: 'ghost', disabled: !status[ref]?.configured, onClick: () => void save(ref, true) }, '清除密钥')))),
    error ? e('p', { role: 'alert' }, error) : null));
}
function installConfigPage(ctx, options) {
  const scope = createConfigScope(ctx.connection, options.endpoint);
  ctx.effect(() => {
    const refresh = () => { void scope.reload().catch(() => {}); };
    refresh(); window.addEventListener?.('focus', refresh);
    if (typeof document === 'undefined') return () => { window.removeEventListener?.('focus', refresh); scope.close(); };
    const style = document.createElement('style'); style.dataset.pluginConfig = options.packageName;
    style.textContent = `
      .dpc-page{max-width:760px;color:var(--dsw-alias-label-primary);font-size:14px}
      .dpc-page p,.dpc-page small{line-height:1.65;color:var(--dsw-alias-label-secondary)}
      .dpc-page [role=alert]{color:var(--dsw-alias-state-error-primary,#d64545)}
      .dpc-group+.dpc-group{margin-top:28px}.dpc-group h4{margin:0 0 8px;font-size:14px;font-weight:600}
      .dpc-field{display:grid;grid-template-columns:minmax(180px,1fr) minmax(160px,280px);gap:24px;padding:18px 0;border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center}
      .dpc-label label{line-height:22px;font-weight:500}.dpc-label small{display:block;margin-top:4px;font-size:12px}
      .dpc-control{min-width:0}.dpc-boolean .dpc-control{justify-self:end}
      .dpc-field input:not([type=checkbox]),.dpc-field select,.dpc-field textarea{box-sizing:border-box;width:100%;padding:9px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit}.dpc-field textarea{resize:vertical;line-height:1.6}
      .dpc-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:24px}
      .dpc-order{margin:0;padding:0;list-style:none;display:grid;gap:4px}.dpc-order li{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
      .dpc-rank{font-size:12px;color:var(--dsw-alias-label-tertiary);width:20px;text-align:center;font-variant-numeric:tabular-nums}.dpc-provider-name{flex:1}.dpc-order-actions{display:flex;gap:2px}.dpc-arrow{min-width:28px;padding:0!important}
      .dpc-providers,.dpc-order{grid-template-columns:1fr;gap:12px}.dpc-choice{display:inline-flex;gap:4px;margin:4px 12px 4px 0}
      .dpc-note{font-size:12px}.dpc-path{overflow-wrap:anywhere;margin-top:16px;color:var(--dsw-alias-label-tertiary);font-size:12px}.dpc-path code{display:block;margin-top:8px;user-select:text}
      .dpc-credentials{border-top:1px solid var(--dsw-alias-border-l2);margin-top:24px;padding-top:18px}.dpc-credentials fieldset{border:0;padding:0;min-width:0}.dpc-page summary{cursor:pointer;line-height:22px}
      .dpc-credentials:first-child{border-top:0;margin-top:0;padding-top:0;margin-bottom:28px}.dpc-credentials h4{margin:0;font-size:14px;font-weight:600}
      .dpc-advanced{margin-top:28px;padding:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px}.dpc-advanced>summary{font-weight:500}.dpc-advanced[open]>summary{margin-bottom:20px}
      .dpc-credentials .dpc-field{grid-template-columns:140px minmax(0,1fr) auto;gap:14px}.dpc-credentials .dpc-actions{margin:0}
      .dpc-page :is(select,input,textarea):focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:3px}
      [data-plugin-detail="${options.packageName}"] [data-plugin-rows]:has(>ul>[data-plugin-row]:only-child):not(:has([data-state=failed],[data-state=off])){display:none}
      @media(max-width:620px){.dpc-field,.dpc-credentials .dpc-field{grid-template-columns:1fr;gap:10px}.dpc-boolean{grid-template-columns:1fr auto;gap:20px}}
    `;
    document.head.appendChild(style);
    return () => { window.removeEventListener?.('focus', refresh); scope.close(); style.remove(); };
  });
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: options.packageName },
    ({ view }) => view === 'summary' ? options.description : React.createElement(React.Fragment, null,
      options.panel ? React.createElement(options.panel, { scope, connection: ctx.connection }) : null,
      React.createElement(FileConfigPage, { ...options, scope }))));
  return scope;
}

// END GENERATED PLUGIN SETTINGS
// BEGIN GENERATED PLUGIN PANEL
function PluginPanel({ scope, connection }) {
  const e = React.createElement, [snapshot, setSnapshot] = React.useState(null), [options, setOptions] = React.useState([]), [sessionId, setSession] = React.useState(''),
    [quota, setQuota] = React.useState(null), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false);
  const epoch = React.useRef(0), serial = React.useRef(0), controller = React.useRef(null), selection = React.useRef('');
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
    if(config.value?.opencodeGoQuota!==false)void call('getQuota',{},signal).then(value=>{if(current())setQuota(value);},()=>{if(active())setQuota({state:'unavailable',data:null});});
    return ()=>abort.abort();
  },[call,config.value?.opencodeGoQuota]);
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
    config.value?.opencodeGoQuota!==false?e('section',{className:'dsc-status-group'},e('h4',null,'OpenCode Go 额度'),quota?.data?.usage?e('dl',null,...[['rolling','5 小时'],['weekly','每周'],['monthly','每月']].map(([key,name])=>row(name,'剩余 '+(100-quota.data.usage[key].percent)+'%')),quota.stale?e('p',null,'刷新失败，显示最近缓存。'):null):e('p',null,quota?.state==='not-configured'?'尚未配置凭证':quota?.state==='unavailable'?'额度暂不可用':'读取中…')):null);
}

// END GENERATED PLUGIN PANEL

    const inject = ['slots', 'connection']
    const RAIL_WIDTH = 360
    const REFRESH_MS = 60 * 1000
    const USAGE_ROUTE = '/api/dsh-status-cards/opencode-go'


    const css = `
      .dsc-rail {
        position: fixed;
        right: var(--dsh-sidebar-width, 0px);
        display: flex;
        align-items: flex-start;
        max-width: calc(100vw - 16px);
        box-sizing: border-box;
        pointer-events: none;
        z-index: 20;
        background: transparent;
        transition: none !important;
      }
      .dsc-panel {
        position: absolute;
        right: 100%;
        top: 0;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transform: translateX(8px) scale(.985);
        transform-origin: top right;
        transition: opacity .16s ease, transform .16s ease, visibility .16s;
        box-sizing: border-box;
        width: min(${RAIL_WIDTH}px, calc(100vw - 48px));
        max-height: calc(100vh - 104px);
        padding: 0 8px 12px 8px;
        overflow-y: auto;
      }
      .dsc-rail[data-expanded=true] .dsc-panel { pointer-events: auto; opacity: 1; visibility: visible; transform: none; }
      .dsc-tab {
        pointer-events: auto;
        display: grid;
        place-items: center;
        width: 44px;
        height: 42px;
        padding: 8px 10px;
        font: inherit;
        color: var(--dsw-alias-brand-primary, #4d6bfe);
        background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 14px 0 0 14px;
        box-shadow: var(--dsw-shadow-lv1);
        cursor: pointer;
        transform: translateX(6px);
        transition: transform .16s ease, background-color .16s ease;
      }
      .dsc-rail[data-expanded=true] .dsc-tab,.dsc-tab:focus-visible { transform: none; }
      .dsc-tab svg { width: 26px; height: 26px; }
      .dsc-tab:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
      .dsc-tab[aria-pressed=true] { background: color-mix(in srgb, var(--dsw-alias-brand-primary,#4d6bfe) 12%, var(--dsw-alias-bg-layer-1)); }
      .dsc-rail[data-auto-hide=false] { width: ${RAIL_WIDTH}px; }
      .dsc-rail[data-auto-hide=false] .dsc-panel { position: relative; right: auto; }
      @media(prefers-reduced-motion:reduce) { .dsc-panel,.dsc-tab { transition: none; } }
      .dsc-stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        transition: none !important;
      }
      .dsc-card {
        pointer-events: auto;
        box-sizing: border-box;
        width: 100%;
        padding: 18px;
        border-radius: 14px;
        border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, var(--dsw-alias-border-l2));
        background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
        box-shadow: var(--dsw-shadow-lv1);
        color: var(--dsw-alias-label-primary);
        transform: none !important;
        transition: none !important;
      }
      .dsc-card, .dsc-card * {
        animation: none !important;
        transition: none !important;
      }
      .dsc-title {
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary);
        margin-bottom: 16px;
      }
      .dsc-row {
        display: grid;
        grid-template-columns: 72px 1fr auto;
        column-gap: 10px;
        row-gap: 6px;
        align-items: center;
        padding: 10px 0;
        border-top: 1px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-l2));
      }
      .dsc-row:first-of-type {
        border-top: 0;
        padding-top: 0;
      }
      .dsc-label {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary);
        white-space: nowrap;
      }
      .dsc-percent {
        font-size: 12px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        text-align: right;
        white-space: nowrap;
      }
      .dsc-bar {
        height: 6px;
        border-radius: 999px;
        background: var(--dsw-alias-interactive-bg-hover);
        overflow: hidden;
      }
      .dsc-fill {
        height: 100%;
        border-radius: 999px;
      }
      .dsc-reset {
        grid-column: 2 / 4;
        font-size: 10px;
        line-height: 15px;
        color: var(--dsw-alias-label-tertiary);
        text-align: right;
        white-space: nowrap;
      }
      .dsc-success { color: var(--dsw-alias-state-success-primary, #2f9e44); }
      .dsc-warn { color: var(--dsw-alias-state-warn-primary, #d98e04); }
      .dsc-danger { color: var(--dsw-alias-state-error-primary, #d64545); }
      .dsc-fill.dsc-success { background: var(--dsw-alias-state-success-primary, #2f9e44); }
      .dsc-fill.dsc-warn { background: var(--dsw-alias-state-warn-primary, #d98e04); }
      .dsc-fill.dsc-danger { background: var(--dsw-alias-state-error-primary, #d64545); }
      .dsc-muted {
        padding: 4px 0 2px;
        font-size: 12px;
        line-height: 18px;
        color: var(--dsw-alias-label-tertiary);
      }
      .dsc-error { color: var(--dsw-alias-state-error-primary, #d64545); }
      body.dsc-active [data-conversation-scroll] {
        padding-right: ${RAIL_WIDTH}px !important;
        transition: none !important;
      }
      body.dsc-active [data-conversation-scroll]:has([data-conversation-composer-overlay]) > [data-composer-seat] {
        right: calc(var(--dsh-scrollbar-width) + ${RAIL_WIDTH}px) !important;
        transition: none !important;
      }
    `

    function remainingPercent(usedPercent) {
      return Math.max(0, Math.min(100, Math.round(100 - Number(usedPercent || 0))))
    }

    function toneFor(remaining) {
      if (remaining <= 20) return 'dsc-danger'
      if (remaining <= 50) return 'dsc-warn'
      return 'dsc-success'
    }

    function formatResetAt(value) {
      if (!value) return '重置时间未知'
      const date = new Date(value)
      if (!Number.isFinite(date.getTime())) return '重置时间未知'
      const parts = new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date)
      const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
      return `${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')} 重置`
    }

    // DeepSeek whale path from the bundled official favicon.svg (DSH MIT source).
    function QuotaIcon() {
      return React.createElement('svg', { viewBox: '0 0 50 50', fill: 'currentColor', 'aria-hidden': true },
        React.createElement('path', { d: "M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z" }))
    }

    function QuotaRow({ label, item }) {
      const remaining = remainingPercent(item?.percent)
      const tone = toneFor(remaining)
      return React.createElement('div', { className: 'dsc-row' },
        React.createElement('span', { className: 'dsc-label' }, label),
        React.createElement('div', { className: 'dsc-bar' },
          React.createElement('div', {
            className: `dsc-fill ${tone}`,
            style: { width: `${remaining}%` },
          }),
        ),
        React.createElement('span', { className: `dsc-percent ${tone}` }, `剩余 ${remaining}%`),
        React.createElement('span', { className: 'dsc-reset' }, formatResetAt(item?.resetsAt)),
      )
    }

    function QuotaCard({ usage, loading, error, stale }) {
      const body = usage
        ? [
            React.createElement(QuotaRow, { key: 'rolling', label: '5小时额度', item: usage.rolling }),
            React.createElement(QuotaRow, { key: 'weekly', label: '周额度', item: usage.weekly }),
            React.createElement(QuotaRow, { key: 'monthly', label: '月额度', item: usage.monthly }),
          ]
        : [React.createElement('div', { key: 'state', className: `dsc-muted${error ? ' dsc-error' : ''}` }, error || (loading ? '正在读取额度…' : '暂无额度数据'))]

      return React.createElement('section', { className: 'dsc-card' },
        React.createElement('div', { className: 'dsc-title' }, 'OpenCode Go 额度'),
        stale ? React.createElement('p', { className: 'dsc-muted' }, '刷新失败，显示最近缓存。') : null,
        body,
      )
    }

    function apply(ctx) {
// BEGIN GENERATED CONFIG INSTALL
      const scope = installConfigPage(ctx, { ...{"rowId":"status-cards","endpoint":"statusCardsSettings","title":"状态卡片","description":"统一查看渠道、会话、后台任务与记忆健康状态，并在边缘卡片查看 OpenCode Go 额度。","fields":[{"key":"opencodeGoQuota","label":"显示 OpenCode Go 额度","type":"boolean","help":"额度凭证在 DSH 的凭证设置中配置。"},{"key":"quotaDisplayMode","label":"额度卡片显示方式","type":"select","options":[["auto-hide","边缘收起，悬停展开"],["always","始终显示"]],"help":"默认收在右边缘；可点击固定展开，按 Esc 收起。"}],"packageName":"dsh-status-cards"}, panel: PluginPanel })
// END GENERATED CONFIG INSTALL

















      ctx.effect(() => { const style = document.createElement('style'); style.dataset.pluginCss = 'dsh-status-cards'; style.textContent = css; document.head.appendChild(style); return () => style.remove() })
      let state = { hasSession: false, usage: null, quotaStale: false, loading: false, error: null, settings: { opencodeGoQuota: true, quotaDisplayMode: 'auto-hide' } }
      const listeners = new Set()

      function emit() { for (const listener of listeners) listener() }
      function subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
      function setState(patch) {
        state = { ...state, ...patch }
        emit()
      }
      function useBridge() {
        return React.useSyncExternalStore(subscribe, () => state, () => state)
      }

      ctx.effect(() => scope.subscribe(() => { const snapshot = scope.getSnapshot(); if (snapshot.status === 'ready') setState({ settings: snapshot.value }) }))

      ctx.effect(() => () => {
        listeners.clear()
        document.body.classList.remove('dsc-active')
      })

      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
        { name: 'conversation.composer.dock', id: 'status-cards-session-sentinel', order: 9998 },
        () => {
          React.useEffect(() => {
            setState({ hasSession: true })
            return () => setState({ hasSession: false })
          }, [])
          return null
        },
      ))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'status-cards-rail', order: 990 },
        () => {
          const snapshot = useBridge()
          const [top, setTop] = React.useState(0)
          const [hovered, setHovered] = React.useState(false)
          const [focused, setFocused] = React.useState(false)
          const [pinned, setPinned] = React.useState(false)
          const [dismissed, setDismissed] = React.useState(false)
          const lastFetch = React.useRef(0)
          const panelId = 'dsc-quota-' + React.useId()
          const autoHide = snapshot.settings.quotaDisplayMode !== 'always'
          const expanded = !autoHide || (!dismissed && (hovered || focused || pinned))

          React.useEffect(() => {
            if (!snapshot.hasSession || snapshot.settings.opencodeGoQuota === false) {
              setHovered(false); setFocused(false); setPinned(false); setDismissed(false)
            }
          }, [snapshot.hasSession, snapshot.settings.opencodeGoQuota])

          React.useEffect(() => {
            document.body.classList.toggle('dsc-active', snapshot.hasSession && snapshot.settings.opencodeGoQuota !== false && !autoHide)
            return () => document.body.classList.remove('dsc-active')
          }, [snapshot.hasSession, snapshot.settings.opencodeGoQuota, autoHide])

          React.useEffect(() => {
            if (!snapshot.hasSession || snapshot.settings.opencodeGoQuota === false || !expanded) return undefined
            const lifetime = new AbortController()
            let inFlight = false
            const refresh = async () => {
              if (inFlight || lifetime.signal.aborted || Date.now() - lastFetch.current < REFRESH_MS) return
              inFlight = true; setState({ loading: true })
              try {
                const response = await fetch(USAGE_ROUTE, { cache: 'no-store', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]) })
                const data = await response.json()
                if (lifetime.signal.aborted) return
                if (!response.ok || !data?.usage) throw new Error(data?.error || `HTTP ${response.status}`)
                setState({ usage: data.usage, quotaStale: !!data.stale, loading: false, error: null })
              } catch (error) {
                if (!lifetime.signal.aborted) setState({ usage: null, quotaStale: false, loading: false, error: error instanceof Error ? error.message : String(error) })
              } finally {
                if (!lifetime.signal.aborted) lastFetch.current = Date.now()
                inFlight = false
              }
            }
            void refresh()
            const timer = window.setInterval(() => void refresh(), REFRESH_MS)
            return () => { window.clearInterval(timer); lifetime.abort(); setState({ loading: false }) }
          }, [snapshot.hasSession, snapshot.settings.opencodeGoQuota, expanded])

          React.useEffect(() => {
            if (!snapshot.hasSession) return undefined
            const measure = () => {
              const scroll = document.querySelector('[data-conversation-scroll]')
              setTop(scroll ? Math.max(0, scroll.getBoundingClientRect().top) : 0)
            }
            measure()
            window.addEventListener('resize', measure)
            const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
            const scroll = document.querySelector('[data-conversation-scroll]')
            const header = document.querySelector('[data-slot="conversation.session.header"]')
            if (scroll && observer) observer.observe(scroll)
            if (header && observer) observer.observe(header)
            return () => {
              window.removeEventListener('resize', measure)
              observer?.disconnect()
            }
          }, [snapshot.hasSession])

          if (!snapshot.hasSession || snapshot.settings.opencodeGoQuota === false) return null

          const cards = [
            React.createElement(QuotaCard, {
              key: 'opencode-go-quota',
              usage: snapshot.usage,
              loading: snapshot.loading,
              error: snapshot.error,
              stale: snapshot.quotaStale,
            }),
          ]

          return React.createElement('aside', {
            className: 'dsc-rail',
            style: { top: `${Math.max(16, top + 24)}px` },
            'aria-label': '状态卡片',
            'data-expanded': expanded,
            'data-auto-hide': autoHide,
            onPointerEnter: () => { setHovered(true); setDismissed(false) },
            onPointerLeave: () => setHovered(false),
            onFocusCapture: () => { setFocused(true); setDismissed(false) },
            onBlurCapture: event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) },
            onKeyDown: event => {
              if (autoHide && event.key === 'Escape') { event.preventDefault(); setPinned(false); setDismissed(true) }
            },
          }, autoHide ? React.createElement('button', {
            type: 'button', className: 'dsc-tab', title: 'OpenCode Go 额度', 'aria-label': pinned ? '取消固定额度卡片' : '固定额度卡片',
            'aria-expanded': expanded, 'aria-controls': panelId, 'aria-pressed': pinned,
            onClick: () => { setPinned(value => !value); setDismissed(false) },
          }, React.createElement(QuotaIcon)) : null,
          React.createElement('div', { className: 'dsc-panel', id: panelId, 'aria-hidden': !expanded, inert: expanded ? undefined : '' }, React.createElement('div', { className: 'dsc-stack' }, cards)))
        },
      ))

    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
