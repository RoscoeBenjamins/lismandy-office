import core from '../core/core.mjs';
import crypto from 'node:crypto';
export function memStore() {
  const t = {}; Object.keys(core.SCHEMA).forEach(k => t[k] = []);
  const c = o => JSON.parse(JSON.stringify(o));
  return {
    all: n => c(t[n]),
    insert: (n, r) => { t[n].push(c(r)); },
    update: (n, id, p) => { const r = t[n].find(x => x.id === id); if (!r) throw new Error('nf ' + id); Object.assign(r, c(p)); },
    remove: (n, id) => { t[n] = t[n].filter(x => x.id !== id); },
    _t: t,
  };
}
export function nodeEnv(clock) {
  const cache = new Map();
  const env = {
    now: () => new Date(clock.t),
    uuid: () => crypto.randomUUID(),
    randomBytes: n => Array.from(crypto.randomBytes(n)),
    sha256Hex: s => crypto.createHash('sha256').update(s, 'utf8').digest('hex'),
    hmacSha1: (k, m) => Array.from(crypto.createHmac('sha1', Buffer.from(k)).update(Buffer.from(m)).digest()),
    cacheGet: k => { const v = cache.get(k); if (!v || v.exp < clock.t) return null; return v.v; },
    cachePut: (k, v, ttl) => cache.set(k, { v, exp: clock.t + ttl * 1000 }),
    cacheRemove: k => cache.delete(k),
    sent: [],
    sendMail: m => { if (m.to.includes('fail@')) throw new Error('mailbox down'); env.sent.push(m); },
  };
  return env;
}
