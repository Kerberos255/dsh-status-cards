import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { ProviderCache } from './provider-cache.js';
import { readQuota, QUOTA_REFS } from './quota.js';

const good = data => ({ state: 'ok', data });
const missing = () => ({ state: 'unavailable', code: 'service-unavailable', data: null });
const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const label = value => typeof value === 'string' && /^[\p{L}\p{N}@_.:/ +()-]{1,100}$/u.test(value) && !/^[a-z]:|\\|https?:\/\//i.test(value) ? value : null;
const phase = value => ['pending', 'loading', 'active', 'failed', 'unloading'].includes(value) ? value : null;
const grouped = rows => { const result = {}; for (const row of rows) result[row.state ?? row.status] = (result[row.state ?? row.status] ?? 0) + 1; return result; };
function runtimeVersion() {
  try { return JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-settings/package.json'), 'utf8')).version; }
  catch { return null; }
}

/** One read-only source for the official settings page, quota card and channels. */
export class StatusCenter extends TypertRemoteService {
  constructor(ctx, settings, options = {}) {
    super(ctx, 'statusCenter'); this.settings = settings; this.services = new Map(); this.cache = new ProviderCache(options.cache);
    this.version = runtimeVersion(); this.closed = false; this.timeout = options.timeout ?? 700; this.quotaTimeout = options.quotaTimeout ?? 7000;
    ctx.inject(['profileContext'],scope=>{try{const manifest=JSON.parse(readFileSync(scope.profileContext.installAnchor,'utf8'));if(typeof manifest.version==='string'&&/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(manifest.version))this.version=manifest.version;}catch{this.version=null;}});
    for (const initialize of initializers) initialize.call(this);
    for (const name of ['credentials', 'pluginInventory', 'pluginManager', 'sessionQuery', 'sessions', 'agents', 'jobs', 'schedule', 'tokenMeter', 'channelCore', 'discordChannelSettings', 'feishuChannelSettings', 'memoryDreaming', 'skillWorkshop', 'losslessContext']) {
      ctx.inject([name], scope => {
        const service = scope.get(name); this.services.set(name, service); this.cache.invalidate();
        scope.effect(() => () => { if (this.services.get(name) === service) { this.services.delete(name); this.cache.invalidate(); } });
      });
    }
    ctx.on('credentials/reference-updated', ref => { if (QUOTA_REFS.has(ref)) this.cache.invalidate('quota'); });
    ctx.effect(() => settings.configFile.subscribe(() => this.cache.invalidate()));
    ctx.inject(['tools'],scope=>scope.tools.register({
      name:'status_health_check',description:'只读检查当前会话的渠道、作业、自动任务、上下文、LCM、记忆和技能健康状态；不会调用模型、修改设置或自动修复。',parameters:{type:'object',properties:{},additionalProperties:false},
      output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
      execute:async(_args,exec)=>{exec.signal.throwIfAborted();const sessionId=exec.agent?.session.id;if(!sessionId)throw new Error('缺少当前会话');const value=await this.snapshot(sessionId,{scopeOnly:true});exec.signal.throwIfAborted();return value;},
    }));
    ctx.effect(() => () => { this.closed = true; this.cache.close(); this.services.clear(); });
  }
  ready() { if (this.closed) throw new RemoteError('status/unavailable', '状态中心已停用', {}); }
  validateSession(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length > 200 || /[\x00-\x1f]/.test(sessionId)) throw new RemoteError('status/invalid-session', '会话 ID 无效', {});
  }
  provider(key, read) { return this.cache.read(key, read, { timeout: this.timeout }); }
  async getQuota() {
    this.ready(); if (!this.settings.configFile.value.opencodeGoQuota) return { state: 'disabled', data: null, stale: false, updatedAt: null };
    return this.cache.read('quota', async signal => good(await readQuota(this.services.get('credentials'), signal)), { ttl: 45000, timeout: this.quotaTimeout });
  }
  async session(sessionId, signal) {
    if (!sessionId) return { state: 'not-selected', data: null };
    const query = this.services.get('sessionQuery'); if (!query) return missing();
    const observation = await query.observeSession(sessionId, { signal });
    try {
      signal.throwIfAborted(); if (observation.header.id !== sessionId) throw new Error('Native session mismatch');
      const values = observation.projections?.values ?? {}, agent = this.services.get('agents')?.get(sessionId);
      const live = this.services.get('sessions')?.get(sessionId);
      let tokens = null;
      if (live) { try { tokens = count(this.services.get('tokenMeter')?.measure(live)?.totalTokens); } catch {} }
      const selected = values.modelSelection?.next ?? values.modelSelection?.lastUsed;
      const children = Array.isArray(values.subagentCatalog) ? values.subagentCatalog : null;
      return good({ scope: { cwd: observation.header.cwd ?? null, agentPreset: values.agentPreset ?? observation.header.agentPreset ?? null, sessionId },
        view: { id: sessionId, preset: label(values.agentPreset ?? observation.header.agentPreset),
          state: agent ? agent.status === 'running' ? 'running' : 'idle' : 'cold',
          model: selected ? { provider: label(selected.provider), model: label(selected.model), reasoningEffort: label(selected.reasoningEffort) } : null,
          permission: label(values.permissions?.currentValue), contextTokens: tokens,
          subagents: children ? { total: children.length, running: children.filter(child => this.services.get('agents')?.get(child.id)?.status === 'running').length } : null,
        } });
    } finally { observation[Symbol.dispose](); }
  }
  plugins() {
    return this.provider('plugins', async () => {
      const inventory = this.services.get('pluginInventory'); if (!inventory) return missing();
      const value = await inventory.list(), rows = [...(value.entries ?? []), ...(value.agentPresets ?? []).flatMap(preset => preset.rows ?? [])];
      return good({ active: rows.filter(row => row.fiberPhase === 'active').length, failed: rows.filter(row => row.fiberPhase === 'failed').length,
        waiting: rows.filter(row => ['pending', 'loading'].includes(row.fiberPhase)).length,
        entries: rows.slice(0,300).map(row => ({ name: label(row.moduleName) ?? '本地插件', enabled: !!row.enabled, phase: phase(row.fiberPhase) })), truncated: rows.length > 300 });
    });
  }
  channels(viewer) {
    const names = viewer?.provider ? [viewer.provider] : ['discord', 'feishu'];
    return this.provider('channels:' + (viewer?.provider ? viewer.provider + ':' + viewer.accountId : 'local'), async () => {
      const channels = [];
      for (const name of names) {
        const service = this.services.get(name === 'discord' ? 'discordChannelSettings' : 'feishuChannelSettings');
        if (!service) { channels.push({ provider: name, state: 'unavailable', connected: null }); continue; }
        const snapshot = service.getConfig();
        if (viewer?.provider && snapshot.value.accountId !== viewer.accountId) { channels.push({ provider: name, state: 'unavailable', connected: null }); continue; }
        const details = snapshot.details ?? {};
        channels.push({ provider: name, state: !snapshot.value.enabled ? 'disabled' : details.connected ? 'connected' : 'disconnected', connected: snapshot.value.enabled ? !!details.connected : false,
          configValid: !snapshot.error, reconnects: count(details.reconnects), connectedAt: count(details.connectedAt), lastEventAt: count(details.lastEventAt), lastDisconnectAt: count(details.lastDisconnectAt), rateLimit: null });
      }
      return good(channels);
    });
  }
  async snapshot(sessionId = '', viewer = null) {
    this.ready(); this.validateSession(sessionId);
    const session = await this.provider('session:' + sessionId, signal => this.session(sessionId, signal));
    const observed = session.state === 'ok' && !session.stale ? session.data.scope : null;
    const scope = observed && typeof observed.cwd === 'string' && typeof observed.agentPreset === 'string' && observed.cwd && observed.agentPreset ? observed : null;
    const suffix = sessionId || 'local';
    const [plugins, channels, jobs, schedule, coordination, memory, workshop, lcm] = await Promise.all([
      this.plugins(), this.channels(viewer),
      this.provider('jobs:' + suffix, async () => {
        const registry = this.services.get('jobs'); if (!registry || viewer && !scope) return missing();
        const rows = registry.list(sessionId || undefined).filter(row => !sessionId || row.owner === sessionId);
        return good({ total: rows.length, running: rows.filter(row => ['running','stopping'].includes(row.status)).length, states: grouped(rows) });
      }),
      this.provider('schedule:' + suffix, async () => {
        const service = this.services.get('schedule'); if (!service || viewer && !scope) return missing();
        const rows = sessionId ? await service.list({ sessionId }) : await service.catalog();
        const active = rows.filter(row => !row.status || row.status === 'active');
        return good({ total: rows.length, active: active.length, nextAt: active.map(row => row.scheduledAt).filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value))).sort()[0] ?? null });
      }),
      this.provider('coordination:' + suffix + ':' + (viewer?.provider ?? 'local'), async () => {
        const service = this.services.get('channelCore'); if (!service || viewer && !scope) return missing(); return good(service.health({ sessionId, ...viewer }));
      }),
      ...['memoryDreaming','skillWorkshop','losslessContext'].map(name => this.provider(name + ':' + suffix, async () => {
        const service = this.services.get(name); if (!service?.health || sessionId && !scope) return missing();
        const data = service.health(scope ?? {}); return { state: data.enabled === false ? 'disabled' : data.applicable === false ? 'not-applicable' : data.available === false ? 'unavailable' : 'ok', data, ...data.available === false ? {code:'plugin-error'} : {} };
      })),
    ]);
    const selected = session.state === 'ok' ? { ...session, data: { ...session.data.view, ...!viewer ? { workspace: session.data.scope.cwd } : {} } } : session;
    const snapshot = { generatedAt: Date.now(), runtime: { version: this.version, node: process.version, uptimeSeconds: Math.floor(process.uptime()) }, session: selected,
      plugins: viewer && plugins.data ? { ...plugins, data: { active: plugins.data.active, failed: plugins.data.failed, waiting: plugins.data.waiting } } : plugins,
      channels, jobs, schedule, coordination, memory, workshop, lcm,
      quota: viewer ? { state: 'restricted', data: null, stale: false, updatedAt: null } : this.settings.configFile.value.opencodeGoQuota ? this.cache.peek('quota') : { state: 'disabled', data: null, stale: false, updatedAt: null } };
    snapshot.health = findings(snapshot); return snapshot;
  }
  getSnapshot(sessionId) { return this.snapshot(sessionId ?? ''); }
  healthCheck(sessionId) { return this.snapshot(sessionId ?? ''); }
  sessionOptions() {
    this.ready();return this.provider('session-options',async signal=>{
      const query=this.services.get('sessionQuery');if(!query)return missing();const rows=await query.listSessions(signal);
      return good(rows.filter(row=>!row.header.parentSession&&row.header.cwd).slice(0,100).map(row=>({id:row.header.id,createdAt:row.header.createdAt,preset:label(row.header.agentPreset)})));
    });
  }
  channelSnapshot(sessionId, viewer) {
    if (!viewer || !['discord','feishu'].includes(viewer.provider) || typeof viewer.accountId !== 'string') throw new RemoteError('status/invalid-channel', '渠道范围无效', {});
    return this.snapshot(sessionId, viewer);
  }
  async channelStatus(sessionId, viewer, mode) { return formatChannelStatus(await this.channelSnapshot(sessionId, viewer), mode); }
}
function findings(snapshot) {
  const items = [];
  for (const key of ['session','plugins','channels','jobs','schedule','coordination','memory','workshop','lcm']) {
    const value = snapshot[key]; if (value.state === 'unavailable') items.push({ item: key, severity: 'unknown', code: value.code ?? 'unavailable' });
    else if (value.stale) items.push({ item: key, severity: 'warning', code: 'stale' });
  }
  if (snapshot.plugins.data?.failed) items.push({ item: 'plugins', severity: 'error', code: 'plugin-failed' });
  for (const channel of snapshot.channels.data ?? []) {
    if (channel.state === 'disconnected') items.push({ item: channel.provider, severity: 'warning', code: 'disconnected' });
    if (channel.configValid === false) items.push({ item: channel.provider, severity: 'warning', code: 'invalid-config' });
  }
  if (snapshot.coordination.data?.uncertainInputs) items.push({ item: 'coordination', severity: 'warning', code: 'uncertain-input' });
  if (snapshot.memory.data?.scheduleError) items.push({ item: 'memory', severity: 'error', code: 'schedule-error' });
  if (snapshot.memory.data?.workflowError || snapshot.memory.data?.workflows?.['needs-review'] || snapshot.memory.data?.workflows?.interrupted) items.push({ item: 'memory', severity: 'warning', code: 'workflow-needs-review' });
  if (snapshot.memory.data?.templates?.['needs-review']) items.push({ item: 'memory', severity: 'warning', code: 'template-needs-review' });
  if (snapshot.memory.data?.recovery?.['needs-review']) items.push({ item: 'memory', severity: 'warning', code: 'memory-needs-review' });
  if (snapshot.memory.data?.vectorCleanup) items.push({ item: 'memory', severity: 'warning', code: 'vector-cleanup-pending' });
  if (snapshot.workshop.data?.recovery?.['needs-review']) items.push({ item: 'workshop', severity: 'warning', code: 'publication-needs-review' });
  return { state: items.some(item => item.severity === 'error') ? 'error' : items.some(item => item.severity === 'warning') ? 'warning' : items.length ? 'unknown' : 'ok', findings: items };
}
const initializers = [];
for (const name of ['getSnapshot','healthCheck','getQuota','sessionOptions']) Remote(StatusCenter.prototype[name], { kind:'method', name, static:false, private:false, addInitializer:fn => initializers.push(fn) });

const statusText = value => value.state === 'disabled' ? '已停用' : value.state === 'not-applicable' ? '不适用于当前预设' : value.state === 'ok' ? (value.stale ? '缓存，刷新失败' : '正常') : '不可用';
export function formatChannelStatus(snapshot, mode) {
  const session = snapshot.session.data, jobs = snapshot.jobs.data, schedules = snapshot.schedule.data;
  const lines = ['DSH 状态 · ' + ({ok:'正常',warning:'需留意',error:'有异常',unknown:'部分状态不可用'}[snapshot.health.state]),
    '版本：' + (snapshot.runtime.version ?? '未知') + ' · 已运行 ' + Math.floor(snapshot.runtime.uptimeSeconds / 60) + ' 分钟',
    '当前会话：' + (session?.id ?? '尚未创建') + ' · ' + ({running:'运行中',idle:'空闲',cold:'未激活'}[session?.state] ?? '状态不可用'),
    '输入方式：' + mode];
  if (session?.preset) lines.push('预设：' + session.preset + (session.permission ? ' · 权限：' + session.permission : ''));
  if (session?.model?.model) lines.push('模型：' + (session.model.provider ?? '') + '/' + session.model.model);
  lines.push('后台作业：' + (jobs ? jobs.running + ' 个运行中' : statusText(snapshot.jobs)), '子任务：' + (session?.subagents ? session.subagents.running + ' 个运行中' : '状态不可用'), '自动任务：' + (schedules ? schedules.active + ' 个已启用' : statusText(snapshot.schedule)));
  for (const channel of snapshot.channels.data ?? []) lines.push((channel.provider === 'discord' ? 'Discord' : '飞书') + '：' + ({connected:'已连接',disconnected:'未连接',disabled:'已停用',unavailable:'状态不可用'}[channel.state]));
  lines.push('LCM：' + statusText(snapshot.lcm), '长期记忆：' + (snapshot.memory.data?.recovery?.['needs-review'] ? '写入恢复需审阅' : snapshot.memory.data?.templates?.['needs-review'] ? '自动计划需核对' : snapshot.memory.data?.workflowError || snapshot.memory.data?.workflows?.['needs-review'] || snapshot.memory.data?.workflows?.interrupted ? '自动任务需核对' : snapshot.memory.data?.vectorCleanup ? '向量清理待完成' : statusText(snapshot.memory)), '技能工坊：' + (snapshot.workshop.data?.recovery?.['needs-review'] ? '发布恢复需审阅' : statusText(snapshot.workshop)));
  return lines.join('\n');
}
