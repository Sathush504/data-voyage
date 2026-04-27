'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validate');
const passport = require('passport');
const db       = require('../config/db');
const { sendEmail, isEmailConfigured } = require('../config/mailer');
const { requireLogin } = require('../middleware/auth');
const { awardPoints } = require('./reputation');
const router   = express.Router();

// POST /api/auth/register
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number'),
  body('department').optional().trim().isLength({ max: 100 })
], validateRequest, async (req, res) => {

  const { name, email, password, department } = req.body;
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = await bcrypt.hash(password, 12);
  const uuid = uuidv4();
  const info = db.prepare(
    `INSERT INTO users (uuid, name, email, password_hash, role, department)
     VALUES (?, ?, ?, ?, 'researcher', ?)`
  ).run(uuid, name, email, hash, department || null);

  db.prepare(`INSERT INTO audit_log (user_id, action, ip) VALUES (?, 'register', ?)`)
    .run(info.lastInsertRowid, req.ip);

  // Welcome XP + badge
  awardPoints(info.lastInsertRowid, 'register', 10, 50, null, 'Welcome to Data Voyage!');
  const welcomeBadge = db.prepare("SELECT id FROM badges WHERE slug='welcome'").get();
  if (welcomeBadge) {
    db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?,?)')
      .run(info.lastInsertRowid, welcomeBadge.id);
  }

  req.session.userId = info.lastInsertRowid;
  req.session.role   = 'researcher';
  req.session.name   = name;
  req.session.email  = email;

  res.status(201).json({ ok: true, name, role: 'researcher' });
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], validateRequest, async (req, res) => {

  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Invalid email or password.' });

  // Update streak
  const lastActive = new Date(user.last_active);
  const now        = new Date();
  const daysDiff   = Math.floor((now - lastActive) / 864e5);
  const newStreak  = daysDiff === 1 ? user.streak_days + 1 : daysDiff === 0 ? user.streak_days : 1;
  db.prepare(`UPDATE users SET streak_days=?, last_active=datetime('now') WHERE id=?`)
    .run(newStreak, user.id);

  req.session.userId = user.id;
  req.session.role   = user.role;
  req.session.name   = user.name;
  req.session.email  = user.email;

  db.prepare(`INSERT INTO audit_log (user_id, action, ip) VALUES (?, 'login', ?)`)
    .run(user.id, req.ip);

  res.json({ ok: true, name: user.name, role: user.role });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const sid = req.sessionID;
  const uid = req.session?.userId;
  req.session.destroy(() => {
    try {
      if (sid) db.prepare('DELETE FROM user_sessions WHERE session_id=?').run(sid);
      if (uid) db.prepare(`INSERT INTO audit_log (user_id, action, ip) VALUES (?, 'logout', ?)`).run(uid, req.ip);
    } catch {}
    res.clearCookie('dv.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/csrf — issue CSRF token (session-bound)
router.get('/csrf', (req, res) => {
  if (!req.session) return res.status(500).json({ error: 'Session unavailable' });
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.json({ token: req.session.csrfToken });
});

// ── OAUTH ──────────────────────────────────────────────────────
router.get('/oauth/:provider', (req, res, next) => {
  const p = (req.params.provider || '').toLowerCase();
  const ok = ['google', 'github', 'linkedin'].includes(p);
  if (!ok) return res.status(404).send('Not found');

  const has = (name) => !!passport._strategy(name);
  if (!has(p)) return res.status(400).json({ error: `${p} login not configured` });

  const scopes = {
    google: ['profile', 'email'],
    github: ['user:email'],
    linkedin: ['r_liteprofile', 'r_emailaddress']
  };
  passport.authenticate(p, { scope: scopes[p] })(req, res, next);
});

router.get('/oauth/:provider/callback', (req, res, next) => {
  const p = (req.params.provider || '').toLowerCase();
  passport.authenticate(p, { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      const msg = (info && (info.message || info.error)) || 'OAuth login failed';
      return res.redirect('/?auth=error&msg=' + encodeURIComponent(msg));
    }

    req.session.userId = user.id;
    req.session.role   = user.role;
    req.session.name   = user.name;
    req.session.email  = user.email;

    db.prepare(`INSERT INTO audit_log (user_id, action, ip) VALUES (?, 'oauth_login', ?)`)
      .run(user.id, req.ip);

    res.redirect('/?auth=ok');
  })(req, res, next);
});

// GET /api/auth/me
router.get('/me', requireLogin, (req, res) => {
  const u = db.prepare(
    `SELECT id, uuid, name, email, role, department, bio, website, twitter,
            avatar_url, reputation, xp, level, streak_days, created_at
     FROM users WHERE id=?`
  ).get(req.session.userId);
  res.json(u || {});
});

// NOTE: routes below intentionally stay in this file for consistent auth API surface.

// POST /api/auth/change-password
router.post('/change-password', requireLogin, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('New password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('New password must contain a number'),
  body('confirmNewPassword').notEmpty().withMessage('Please confirm the new password')
], validateRequest, async (req, res) => {

  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  if (newPassword !== confirmNewPassword)
    return res.status(400).json({ error: 'New passwords do not match' });

  const u = db.prepare('SELECT id,password_hash,oauth_provider FROM users WHERE id=?').get(req.session.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.oauth_provider && !u.password_hash)
    return res.status(400).json({ error: 'OAuth accounts do not have a local password. Please use your provider (Google/LinkedIn/GitHub) to manage security.' });
  if (!u.password_hash || !(await bcrypt.compare(currentPassword, u.password_hash)))
    return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash=?, updated_at=datetime("now") WHERE id=?').run(hash, req.session.userId);
  db.prepare('INSERT INTO audit_log (user_id, action, ip) VALUES (?, "change_password", ?)').run(req.session.userId, req.ip);
  res.json({ ok: true });
});

// POST /api/auth/change-email
router.post('/change-email', requireLogin, [
  body('newEmail').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').optional().isString()
], validateRequest, async (req, res) => {

  const newEmail = req.body.newEmail;
  const u = db.prepare('SELECT id,email,password_hash,oauth_provider FROM users WHERE id=?').get(req.session.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.email === newEmail) return res.json({ ok: true });

  if (db.prepare('SELECT id FROM users WHERE email=?').get(newEmail))
    return res.status(409).json({ error: 'Email already in use' });

  // Local accounts must confirm password to change email
  if (!u.oauth_provider) {
    const pw = req.body.password || '';
    if (!pw) return res.status(400).json({ error: 'Password required' });
    if (!u.password_hash) {
      console.error(`User ${u.id} has no password_hash but oauth_provider is null`);
      return res.status(500).json({ error: 'Account configuration error' });
    }
    const ok = await bcrypt.compare(pw, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Password incorrect' });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO email_change_requests (user_id,new_email,token_hash,expires_at)
    VALUES (?,?,?,?)
  `).run(req.session.userId, newEmail, tokenHash, expiresAt);

  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const verifyUrl = `${baseUrl.replace(/\/+$/,'')}/auth/verify-email-change?token=${rawToken}`;

  try {
    await sendEmail({
      to: newEmail,
      subject: 'Confirm your new email for Data Voyage',
      html: `<p>You requested to change your Data Voyage email to <strong>${newEmail}</strong>.</p>
             <p>Click the button below to confirm this change:</p>
             <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 18px;
               background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">
               Confirm email change</a></p>
             <p>If you did not request this, you can ignore this email.</p>`
    });
  } catch (e) {
    return res.status(500).json({ error: 'Could not send verification email' });
  }

  db.prepare(`INSERT INTO audit_log (user_id, action, target, ip) VALUES (?,?,?,?)`)
    .run(req.session.userId, 'request_email_change', newEmail, req.ip);

  res.json({ ok: true });
});

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// GET /api/auth/verify-email-change
router.get('/verify-email-change', (req, res) => {
  const raw = String(req.query.token || '');
  if (!raw) return res.status(400).send('Invalid or missing token.');

  const tokenHash = sha256(raw);
  const row = db.prepare(`
    SELECT * FROM email_change_requests
    WHERE token_hash=? AND used_at IS NULL AND expires_at > datetime('now')
  `).get(tokenHash);

  if (!row) return res.status(400).send('This link is invalid or has expired.');

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET email=?, updated_at=datetime("now") WHERE id=?')
      .run(row.new_email, row.user_id);
    db.prepare('UPDATE email_change_requests SET used_at=datetime("now") WHERE id=?')
      .run(row.id);
  });
  tx();

  db.prepare(`INSERT INTO audit_log (user_id, action, target, ip) VALUES (?,?,?,?)`)
    .run(row.user_id, 'verify_email_change', row.new_email, req.ip);

  res.send('Your email address has been updated. You can close this tab.');
});

// POST /api/auth/forgot-password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
], validateRequest, (req, res) => {

  const { email } = req.body;
  const user = db.prepare('SELECT id,email FROM users WHERE email=? AND is_active=1').get(email);

  // Always return ok to avoid account enumeration.
  if (!user) return res.json({ ok: true });

  // Invalidate old tokens for this user
  db.prepare('DELETE FROM password_resets WHERE user_id=?').run(user.id);

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(token);
  const minutes = Number(process.env.RESET_TOKEN_TTL_MINUTES || 30);
  db.prepare(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES (?, ?, datetime('now', ?))`
  ).run(user.id, tokenHash, `+${minutes} minutes`);

  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const subject = 'Reset your Data Voyage password';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a2040">
      <h2 style="margin:0 0 10px">Password reset request</h2>
      <p>We received a request to reset your Data Voyage password.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#0901FA;color:white;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:700">Reset password</a></p>
      <p style="font-size:12px;color:#8892b0">If you didn’t request this, you can ignore this email.</p>
      <p style="font-size:12px;color:#8892b0">Link: ${resetUrl}</p>
    </div>
  `;

  // Send email if configured; never reveal whether the account exists.
  (async () => {
    try { await sendEmail({ to: user.email, subject, html, text: `Reset your password: ${resetUrl}` }); }
    catch {}
  })();

  // In dev (or if SMTP isn't configured), returning resetUrl helps testing.
  if (process.env.NODE_ENV !== 'production' || !isEmailConfigured()) {
    return res.json({ ok: true, resetUrl });
  }
  res.json({ ok: true });
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('New password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('New password must contain a number'),
  body('confirmNewPassword').notEmpty().withMessage('Please confirm the new password')
], validateRequest, async (req, res) => {

  const { token, newPassword, confirmNewPassword } = req.body;
  if (newPassword !== confirmNewPassword)
    return res.status(400).json({ error: 'New passwords do not match' });

  const tokenHash = sha256(token);
  const row = db.prepare(
    `SELECT pr.id, pr.user_id, pr.expires_at
     FROM password_resets pr
     WHERE pr.token_hash=?`
  ).get(tokenHash);
  if (!row) return res.status(400).json({ error: 'Invalid or expired token' });

  const exp = new Date(row.expires_at);
  if (Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
    db.prepare('DELETE FROM password_resets WHERE id=?').run(row.id);
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash=?, updated_at=datetime("now") WHERE id=?').run(hash, row.user_id);
  db.prepare('DELETE FROM password_resets WHERE id=?').run(row.id);
  db.prepare('INSERT INTO audit_log (user_id, action, ip) VALUES (?, "reset_password", ?)').run(row.user_id, req.ip);

  // Invalidate all active sessions for this user
  const sessions = db.prepare('SELECT session_id FROM user_sessions WHERE user_id=?').all(row.user_id);
  sessions.forEach(s => {
    req.sessionStore?.destroy?.(s.session_id, () => {});
  });
  db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(row.user_id);

  res.json({ ok: true });
});

// GET /api/auth/sessions — list active sessions
router.get('/sessions', requireLogin, (req, res) => {
  const rows = db.prepare(
    `SELECT session_id, ip, user_agent, created_at, last_seen_at
     FROM user_sessions
     WHERE user_id=?
     ORDER BY last_seen_at DESC`
  ).all(req.session.userId);
  res.json(rows);
});

// DELETE /api/auth/sessions/:sessionId — revoke a session (including current)
router.delete('/sessions/:sessionId', requireLogin, (req, res) => {
  const sessionId = String(req.params.sessionId || '');
  const row = db.prepare(
    `SELECT session_id FROM user_sessions WHERE session_id=? AND user_id=?`
  ).get(sessionId, req.session.userId);
  if (!row) return res.status(404).json({ error: 'Session not found' });

  // Remove from session store, then registry
  req.sessionStore?.destroy?.(sessionId, (err) => {
    try { db.prepare('DELETE FROM user_sessions WHERE session_id=?').run(sessionId); } catch {}
    db.prepare(`INSERT INTO audit_log (user_id, action, target, ip) VALUES (?,?,?,?)`)
      .run(req.session.userId, 'session_revoke', sessionId, req.ip);

    // If revoking current session, clear cookie
    if (sessionId === req.sessionID) res.clearCookie('dv.sid');
    if (err) return res.status(500).json({ error: 'Could not revoke session' });
    res.json({ ok: true });
  });
});

// POST /api/auth/sessions/logout-all — revoke all sessions for this user
router.post('/sessions/logout-all', requireLogin, (req, res) => {
  const rows = db.prepare('SELECT session_id FROM user_sessions WHERE user_id=?').all(req.session.userId);
  const ids = rows.map(r => r.session_id);

  let pending = ids.length;
  const done = () => {
    db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(req.session.userId);
    db.prepare(`INSERT INTO audit_log (user_id, action, target, ip) VALUES (?,?,?,?)`)
      .run(req.session.userId, 'logout_all_sessions', String(ids.length), req.ip);
    res.clearCookie('dv.sid');
    req.session.destroy(() => res.json({ ok: true }));
  };

  if (!pending) return done();
  ids.forEach(id => {
    req.sessionStore?.destroy?.(id, () => {
      pending--;
      if (pending === 0) done();
    });
  });
});

module.exports = router;
