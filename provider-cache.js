/** Demand-driven reads: one attempt per key, bounded waits, no idle timer. */
export class ProviderCache {
  constructor({ capacity = 128, staleMs = 300000, clock = Date.now } = {}) {
    this.capacity = capacity; this.staleMs = staleMs; this.clock = clock;
    this.entries = new Map(); this.closed = false;
  }
  invalidate(prefix = '') {
    for (const [key, entry] of this.entries) if (key.startsWith(prefix)) {
      entry.abort?.abort(); this.entries.delete(key);
    }
  }
  peek(key, ttl = 45000) {
    const result = this.entries.get(key)?.result;
    return result ? { ...structuredClone(result), stale: result.stale || result.updatedAt !== null && this.clock() - result.updatedAt > ttl }
      : { state: 'not-read', data: null, stale: false, updatedAt: null };
  }
  async read(key, load, { ttl = 2000, timeout = 700 } = {}) {
    if (this.closed) return { state: 'unavailable', code: 'closed', data: null, stale: false, updatedAt: null };
    let entry = this.entries.get(key);
    if (entry) { this.entries.delete(key); this.entries.set(key, entry); }
    if (entry?.result && (this.clock() - entry.at < ttl || entry.pending)) return structuredClone(entry.result);
    if (entry?.attempt) return structuredClone(await entry.attempt);
    if (!entry) {
      if (this.entries.size >= this.capacity) {
        const oldest = [...this.entries].find(([, value]) => !value.pending);
        if (!oldest) return { state: 'unavailable', code: 'busy', data: null, stale: false, updatedAt: null };
        this.entries.delete(oldest[0]);
      }
      entry = {}; this.entries.set(key, entry);
    }
    const abort = new AbortController(); entry.abort = abort; entry.pending = true;
    let timer, onAbort;
    const raw = Promise.resolve().then(() => load(abort.signal));
    raw.finally(() => { entry.pending = false; }).catch(() => {});
    const cancelled = new Promise((_, reject) => {
      onAbort = () => reject(Object.assign(new Error('Provider cancelled'), { code: this.closed ? 'closed' : 'cancelled' }));
      abort.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => { reject(Object.assign(new Error('Provider timed out'), { code: 'timeout' })); abort.abort(); }, timeout);
    });
    entry.attempt = (async () => {
      let result;
      try {
        const value = await Promise.race([raw, cancelled]); abort.signal.throwIfAborted();
        result = { ...value, stale: false, updatedAt: this.clock() };
        if (result.state === 'ok') entry.good = structuredClone(result);
      } catch (error) {
        const code = ['timeout', 'closed', 'auth', 'unconfigured', 'invalid-response'].includes(error?.code) ? error.code : 'read-failed';
        if (code === 'auth' || code === 'unconfigured') entry.good = null;
        const old = entry.good;
        result = old && !this.closed && code !== 'auth' && this.clock() - old.updatedAt <= this.staleMs
          ? { ...old, stale: true, code }
          : { state: code === 'unconfigured' ? 'not-configured' : 'unavailable', code, data: null, stale: false, updatedAt: null };
      } finally { clearTimeout(timer); abort.signal.removeEventListener('abort', onAbort); }
      if (this.entries.get(key) === entry && !this.closed) { entry.result = result; entry.at = this.clock(); }
      return result;
    })();
    try { return structuredClone(await entry.attempt); } finally { entry.attempt = null; }
  }
  close() { if (this.closed) return; this.closed = true; this.invalidate(); }
}
