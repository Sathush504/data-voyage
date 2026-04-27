'use strict';
require('dotenv').config();
const express     = require('express');
require('express-async-errors');
const session     = require('express-session');
const Database    = require('better-sqlite3');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const passport    = require('passport');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const fs          = require('fs');
const path        = require('path');
const bcrypt      = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db          = require('./config/db');
const { setupStrategies } = require('./config/oauth');

const app  = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || secret === 'dev-secret-please-change-in-production') {
    throw new Error('SESSION_SECRET must be set (32+ chars) in production.');
  }
}

// Fail fast in production so process managers (Hostinger/systemd/Docker) can restart us.
const EXIT_ON_FATAL = process.env.NODE_ENV === 'production';
process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'fatal',
    message: 'Unhandled promise rejection',
    reason: reason instanceof Error ? reason.message : String(reason)
  }));
  if (EXIT_ON_FATAL) setTimeout(() => process.exit(1), 100).unref();
});
process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'fatal',
    message: 'Uncaught exception',
    error: err?.message,
    stack: err?.stack
  }));
  if (EXIT_ON_FATAL) setTimeout(() => process.exit(1), 100).unref();
});

app.set('trust proxy', 1);

// Request IDs for tracing
app.use((req, res, next) => {
  const incoming = typeof req.headers['x-request-id'] === 'string'
    ? req.headers['x-request-id'].trim()
    : '';
  const reqId = incoming || uuidv4();
  req.reqId = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// Structured request logging
app.use((req, res, next) => {
  const start = Date.now();
  const { reqId } = req;
  res.on('finish', () => {
    const log = {
      ts: new Date().toISOString(),
      level: 'info',
      reqId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip,
      ua: (req.headers['user-agent'] || '').slice(0, 160)
    };
    console.log(JSON.stringify(log));
  });
  next();
});
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", 'https://code.iconify.design'],
      connectSrc: ["'self'"],
    }
  }
}));
app.use(rateLimit({ windowMs: 15*60*1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/login',          rateLimit({ windowMs: 15*60*1000, max: 20 }));
app.use('/api/auth/register',       rateLimit({ windowMs: 60*60*1000, max: 10 }));
app.use('/api/auth/forgot-password',rateLimit({ windowMs: 60*60*1000, max: 5 }));
app.use('/api/auth/reset-password', rateLimit({ windowMs: 60*60*1000, max: 15 }));
app.use('/api/auth/change-password',rateLimit({ windowMs: 30*60*1000, max: 10 }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const sessionsDir = path.join(__dirname, 'data');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
const sessionDb = new Database(path.join(sessionsDir, 'sessions.db'));

app.use(session({
  store: new SQLiteStore({
    client: sessionDb,
    expired: { clear: true, intervalMs: 15 * 60 * 1000 }
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-please-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'dv.sid',
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
setupStrategies(app);

// CSRF protection for state-changing API routes (session token in X-CSRF-Token)
app.use((req, res, next) => {
  const isApi = req.path.startsWith('/api/');
  if (!isApi) return next();
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (safe) return next();
  if (req.path === '/api/auth/csrf') return next();

  const token = req.session?.csrfToken;
  const header = req.headers['x-csrf-token'];
  if (!token || !header || String(header) !== String(token)) {
    return res.status(403).json({ error: 'CSRF token invalid' });
  }
  next();
});

// Session registry (for settings/security UI: list/revoke sessions)
app.use((req, res, next) => {
  try {
    if (req.session?.userId && req.sessionID) {
      const now = Date.now();
      const fiveMins = 5 * 60 * 1000;
      if (!req.session.lastSeenAt || (now - req.session.lastSeenAt > fiveMins)) {
        db.prepare(
          `INSERT INTO user_sessions (session_id,user_id,ip,user_agent)
           VALUES (?,?,?,?)
           ON CONFLICT(session_id) DO UPDATE SET
             user_id=excluded.user_id,
             ip=excluded.ip,
             user_agent=excluded.user_agent,
             last_seen_at=datetime('now')`
        ).run(
          req.sessionID,
          req.session.userId,
          req.ip,
          (req.headers['user-agent'] || '').slice(0, 300)
        );
        req.session.lastSeenAt = now;
      }
    }
  } catch {}
  next();
});

// Block direct access to paper uploads (must use API download routes).
// Avatars remain publicly accessible.
app.use('/uploads', (req, res, next) => {
  if (req.path.startsWith('/avatars/')) return next();
  return res.status(403).send('403 Forbidden');
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/research',   require('./routes/research'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/researchers',require('./routes/researchers'));
app.use('/api/news',       require('./routes/news'));
app.use('/api/settings',   require('./routes/settings'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/reputation', require('./routes/reputation').router);
app.use('/api/analytics',  require('./routes/analytics'));
app.use('/api/contact',    require('./routes/contact'));
app.use('/api/privacy',    require('./routes/privacy'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── PUBLIC PLATFORM STATS (no auth required) ──────────────────
app.get('/api/stats', (req, res) => {
  try {
    res.json({
      approvedPapers:  db.prepare(`SELECT COUNT(*) c FROM papers  WHERE status='approved'`).get().c,
      totalResearchers:db.prepare(`SELECT COUNT(*) c FROM users   WHERE is_active=1 AND role='researcher'`).get().c,
      badgesAwarded:   db.prepare(`SELECT COUNT(*) c FROM user_badges`).get().c,
      publishedNews:   db.prepare(`SELECT COUNT(*) c FROM news    WHERE published=1`).get().c,
      domains:         db.prepare(`SELECT COUNT(DISTINCT domain) c FROM papers WHERE status='approved'`).get().c,
      endorsements:    db.prepare(`SELECT COUNT(*) c FROM endorsements`).get().c,
      totalViews:      db.prepare(`SELECT COALESCE(SUM(views),0) c FROM papers WHERE status='approved'`).get().c,
    });
  } catch (e) {
    res.status(500).json({ error: 'Stats unavailable' });
  }
});

// Bootstrap admin
(async () => {
  try {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    if (db.prepare("SELECT id FROM users WHERE role='admin'").get()) return;
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    db.prepare(`INSERT INTO users(uuid,name,email,password_hash,role) VALUES(?,'Administrator',?,?,'admin')`)
      .run(uuidv4(), ADMIN_EMAIL, hash);
    console.log('Admin created:', ADMIN_EMAIL);
  } catch (e) { console.error('Bootstrap error:', e.message); }
})();

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'error',
    reqId: req.reqId,
    message: err.message,
    stack: err.stack
  }));
  res.status(500).json({ error: 'Internal server error', reqId: req.reqId });
});

const server = app.listen(PORT, () => {
  console.log(`Data Voyage on http://localhost:${PORT}`);
  console.log(`DB: ${process.env.DB_PATH || './data/datavoyage.db'}`);
});

function shutdown(signal) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    message: `Shutting down (${signal})`
  }));

  server.close(() => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      message: 'Shutdown complete'
    }));
    process.exit(0);
  });

  // If close() hangs, force exit.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
