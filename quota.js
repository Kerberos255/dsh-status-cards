const refs = ['OPENCODE_GO_WORKSPACE_ID', 'OPENCODE_GO_AUTH_COOKIE', 'OPENCODE_GO_API_KEY'];
export const QUOTA_REFS = new Set(refs);
const failure = code => Object.assign(new Error('额度查询不可用'), { code });
const reset = value => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '';
  return new Date(Date.parse(value)).toISOString();
};
export function normalizeUsage(raw) {
  const usage = {};
  for (const key of ['rolling', 'weekly', 'monthly']) {
    const entry = raw?.usage?.[key], percent = entry?.percent;
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) throw failure('invalid-response');
    usage[key] = { status: 'ok', percent: Math.round(percent), resetsAt: reset(entry.resetsAt) };
  }
  return { usage };
}
export function parseWorkspaceUsage(html, now = Date.now()) {
  const rendered = [...html.matchAll(/data-slot=["']usage-value["'][^>]*>\s*([0-9]+(?:\.[0-9]+)?)%\s*</gi)].map(match => Number(match[1]));
  const usage = {};
  for (const [index, label] of ['rolling', 'weekly', 'monthly'].entries()) {
    const serialized = [...html.matchAll(new RegExp(`${label}Usage[\\s\\S]{0,2000}?["']?usagePercent["']?\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, 'gi'))];
    const percent = rendered.length >= 3 ? rendered[index] : Number(serialized.at(-1)?.[1]);
    const resets = [...html.matchAll(new RegExp(`${label}Usage[\\s\\S]{0,2000}?["']?resetInSec["']?\\s*:\\s*([0-9]+)`, 'gi'))], seconds = Number(resets.at(-1)?.[1]);
    usage[label] = { percent, resetsAt: Number.isFinite(seconds) && seconds <= 315360000 ? new Date(now + seconds * 1000).toISOString() : '' };
  }
  return normalizeUsage({ usage });
}
export async function readBody(response, signal, limit = 1048576) {
  const declared = Number(response.headers?.get('content-length'));
  if (declared > limit) { await response.body?.cancel().catch(() => {}); throw failure('invalid-response'); }
  if (!response.body?.getReader) {
    const value = await response.text(); signal.throwIfAborted();
    if (Buffer.byteLength(value) > limit) throw failure('invalid-response'); return value;
  }
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { for (;;) { signal.throwIfAborted(); const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw failure('invalid-response'); chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function readQuota(credentials, signal, fetcher = fetch) {
  if (!credentials) throw failure('unconfigured');
  const values = await Promise.all(refs.map(ref => credentials.resolve(ref))); signal.throwIfAborted();
  const [workspace, cookie, key] = values.map(value => value?.value?.trim());
  const browser = workspace && cookie;
  if (!browser && !key) throw failure('unconfigured');
  if (browser && !/^wrk_[A-Za-z0-9]+$/.test(workspace)) throw failure('invalid-response');
  const response = await fetcher(browser ? `https://opencode.ai/workspace/${encodeURIComponent(workspace)}/go` : 'https://opencode.ai/zen/go/v1/usage', {
    redirect: 'manual', signal, headers: browser
      ? { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0', Cookie: cookie.includes('=') ? cookie : `auth=${cookie}` }
      : { Authorization: `Bearer ${key}` },
  });
  if ([401, 403].includes(response.status) || response.status >= 300 && response.status < 400) { await response.body?.cancel().catch(() => {}); throw failure('auth'); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw failure('read-failed'); }
  const body = await readBody(response, signal, browser ? 1048576 : 262144); signal.throwIfAborted();
  if (browser) return parseWorkspaceUsage(body);
  try { return normalizeUsage(JSON.parse(body)); } catch { throw failure('invalid-response'); }
}
