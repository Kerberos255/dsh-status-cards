import { PluginConfig } from './plugin-settings/remote-config.js';
import { schema } from './config.js';
import { StatusCenter } from './status-center.js';

export const inject = ['webServer', 'credentials', 'connection', 'dshHomePath'];
const messages = { auth: 'OpenCode Go 凭证已失效，请在凭证设置中更新。', unconfigured: '请先在 DSH 凭证设置中配置 OpenCode Go。', 'invalid-response': '额度服务返回了无法识别的数据。', timeout: '额度查询超时，请稍后再试。', disabled: '额度查询已关闭。' };
export function apply(ctx, legacy = {}) {
  const settings = new PluginConfig(ctx, { service: 'statusCardsSettings', packageName: 'dsh-status-cards', schema }, legacy);
  const status = new StatusCenter(ctx, settings);
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/api/dsh-status-cards/opencode-go',
    handler: async (req, res) => {
      const admission = ctx.connection.admit(req);
      if ('rejection' in admission) { res.writeHead(admission.rejection); res.end(); return; }
      const result = await status.getQuota().catch(() => ({ state: 'unavailable', code: 'closed' }));
      const ok = result.state === 'ok';
      const code = ok ? 200 : result.code === 'auth' ? 401 : result.state === 'not-configured' || result.state === 'disabled' ? 503 : 502;
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(ok ? { ...result.data, stale: result.stale, updatedAt: result.updatedAt } : { error: messages[result.code] ?? messages[result.state] ?? '额度暂不可用，请稍后再试。' }));
    },
  }));
}
