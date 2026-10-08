import { PluginConfig } from './plugin-settings/remote-config.js';
import { schema } from './config.js';
import { StatusCenter } from './status-center.js';

export const inject = ['webServer', 'credentials', 'connection', 'dshHomePath'];
const messages = { auth: '账户认证已失效，请在 DSH 账户或凭证设置中更新。', unconfigured: '尚未配置对应账户。', 'invalid-response': '账户接口返回了无法识别的数据。', timeout: '查询超时，请稍后再试。', disabled: '额度查询已关闭。' };
export function apply(ctx, legacy = {}) {
  const settings = new PluginConfig(ctx, { service: 'statusCardsSettings', packageName: 'dsh-status-cards', schema }, legacy);
  const status = new StatusCenter(ctx, settings);
  // Provider secrets are resolved only on the host. Browser receives sanitized values.
  ctx.effect(() => {
    const routes = [
      { path: '/api/dsh-status-cards/opencode-go', read: () => status.getQuota() },
      { path: '/api/dsh-status-cards/deepseek', read: () => status.getDeepSeekBalance() },
    ];
    const stops = routes.map(route => ctx.webServer.register({
      kind: 'exact', path: route.path,
      handler: async (req, res) => {
        const admission = ctx.connection.admit(req);
        if ('rejection' in admission) { res.writeHead(admission.rejection); res.end(); return; }
        const result = await route.read().catch(() => ({ state: 'unavailable', code: 'closed', data: null }));
        const ok = result.state === 'ok';
        const code = ok ? 200 : result.code === 'auth' ? 401 : result.state === 'not-configured' || result.state === 'disabled' ? 503 : 502;
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(ok ? { ...result.data, stale: result.stale, updatedAt: result.updatedAt } : { error: messages[result.code] ?? messages[result.state] ?? '额度暂不可用，请稍后再试。' }));
      },
    }));
    return () => { for (const stop of stops) stop(); };
  });
}
