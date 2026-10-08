import { defineConfig } from './plugin-settings/remote-config.js';
export const schema = defineConfig({ opencodeGoQuota: true, deepseekBalance: true, quotaDisplayMode: 'auto-hide' }, {
  quotaDisplayMode: value => ['auto-hide', 'always'].includes(value),
});
