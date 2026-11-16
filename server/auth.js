const crypto = require('crypto');

const COOKIE_NAME = 'vtt_dm';
const COOKIE_MAX_AGE = 2592000; // 30 giorni, in secondi
const PUBLIC_PREFIXES = ['/party', '/display', '/handout', '/shared', '/storage', '/home', '/login', '/api/login', '/api/webproxy'];
const PUBLIC_SOCKET_EVENTS = new Set(['hello', 'display:viewport', 'audio:status', 'audio:oneshotEnded']);
const MAX_FAILS = 5;
const LOCK_MS = 60000;

function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string' || header === '') return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name) continue;
    out[name] = part.slice(i + 1).trim();
  }
  return out;
}

function isPublicPath(p) {
  if (typeof p !== 'string') return false;
  if (p.includes('/..')) return false;
  if (p === '/') return true;
  return PUBLIC_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
}

function isPublicSocketEvent(event) {
  if (typeof event !== 'string') return false;
  return PUBLIC_SOCKET_EVENTS.has(event) || event.startsWith('aoe:');
}

function createAuth({ pin, now = Date.now } = {}) {
  const enabled = typeof pin === 'string' && pin.trim() !== '';
  const usedPin = enabled ? pin.trim() : null;
  const token = enabled
    ? crypto.createHash('sha256').update('anime-vtt-dm:' + usedPin).digest('hex')
    : null;
  const attempts = new Map(); // ip -> { fails, lockedUntil }

  function isDm(cookieHeader) {
    if (!enabled) return true;
    const value = parseCookies(cookieHeader)[COOKIE_NAME];
    if (typeof value !== 'string' || value.length !== token.length) return false;
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(token));
  }

  function httpGuard(req, res, next) {
    if (!enabled || isPublicPath(req.path) || isDm(req.headers.cookie)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'PIN del DM richiesto' });
    return res.redirect(302, '/login/?next=' + encodeURIComponent(req.originalUrl));
  }

  function registerRoutes(app) {
    app.post('/api/login', (req, res) => {
      if (!enabled) return res.json({ ok: true });
      const key = req.ip;
      const entry = attempts.get(key) || { fails: 0, lockedUntil: 0 };
      if (entry.lockedUntil > now()) {
        return res.status(429).json({ error: 'Troppi tentativi, riprova tra un minuto' });
      }
      if (entry.lockedUntil && entry.lockedUntil <= now()) {
        entry.fails = 0;
        entry.lockedUntil = 0;
      }
      const given = req.body && typeof req.body.pin === 'string' ? req.body.pin.trim() : null;
      if (given !== null && given === usedPin) {
        attempts.delete(key);
        res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`);
        return res.json({ ok: true });
      }
      entry.fails += 1;
      if (entry.fails >= MAX_FAILS) entry.lockedUntil = now() + LOCK_MS;
      attempts.set(key, entry);
      return res.status(401).json({ error: 'PIN errato' });
    });

    app.post('/api/logout', (req, res) => {
      res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      res.json({ ok: true });
    });
  }

  function socketGuard(socket) {
    socket.data.dm = isDm(socket.handshake.headers.cookie);
    socket.use(([event], next) => {
      if (socket.data.dm || isPublicSocketEvent(event)) next();
    });
  }

  return { enabled, token, isDm, httpGuard, registerRoutes, socketGuard };
}

module.exports = { createAuth, parseCookies, isPublicPath, isPublicSocketEvent, COOKIE_NAME };
