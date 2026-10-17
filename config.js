import { defineConfig } from './plugin-settings/remote-config.js';
export const schema = defineConfig({ opencodeGoQuota: true, deepseekBalance: true, quotaDisplayMode: 'auto-hide', weatherCachePath: '' }, {
  quotaDisplayMode: value => ['auto-hide', 'always'].includes(value),
  weatherCachePath: value => value.length<=4096 && !/[\r\n\x00]/.test(value),
});
