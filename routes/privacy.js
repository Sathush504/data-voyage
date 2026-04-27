'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validate');
const db = require('../config/db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// GET /api/privacy/export — export my data (JSON)
router.get('/export', requireLogin, (req, res) => {
  const userId = req.session.userId;

  const profile = db.prepare(
    `SELECT uuid,name,email,role,department,bio,website,twitter,avatar_url,
            reputation,xp,level,streak_days,last_active,is_active,created_at,updated_at,
            oauth_provider
     FROM users WHERE id=?`
  ).get(userId);

  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id=?').get(userId) || null;

  const papers = db.prepare('SELECT * FROM papers WHERE user_id=? ORDER BY created_at DESC').all(userId);
  const paperIds = papers.map(p => p.id);
  const paperFiles = paperIds.length
    ? db.prepare(`SELECT * FROM paper_files WHERE paper_id IN (${paperIds.map(() => '?').join(',')})`).all(...paperIds)
    : [];

  const badges = db.prepare(
    `SELECT b.slug,b.name,b.description,b.icon,b.color,b.tier,ub.earned_at
     FROM user_badges ub JOIN badges b ON ub.badge_id=b.id
     WHERE ub.user_id=? ORDER BY ub.earned_at DESC`
  ).all(userId);

  const endorsementsReceived = db.prepare(
    `SELECT e.created_at, p.uuid AS paper_uuid, fu.uuid AS from_user_uuid, fu.name AS from_user_name
     FROM endorsements e
     LEFT JOIN papers p ON e.paper_id=p.id
     JOIN users fu ON e.from_user=fu.id
     WHERE e.to_user=? ORDER BY e.created_at DESC`
  ).all(userId);

  const audit = db.prepare(
    `SELECT action,target,ip,created_at FROM audit_log WHERE user_id=? ORDER BY created_at DESC LIMIT 500`
  ).all(userId);

  res.json({
    exported_at: new Date().toISOString(),
    profile,
    settings,
    papers,
    paper_files: paperFiles,
    badges,
    endorsements_received: endorsementsReceived,
    audit_log: audit
  });
});

// DELETE /api/privacy/account — delete my account (requires password for local accounts)
router.delete('/account', requireLogin, [
  body('password').optional().isString().isLength({ min: 1 }).withMessage('Password required')
], validateRequest, (req, res) => {

  const userId = req.session.userId;
  const u = db.prepare('SELECT id,email,oauth_provider,password_hash FROM users WHERE id=?').get(userId);
  if (!u) return res.status(404).json({ error: 'User not found' });

  // Local accounts must confirm password; OAuth accounts may delete without it
  if (!u.oauth_provider) {
    const pw = req.body.password || '';
    if (!pw) return res.status(400).json({ error: 'Password is required to delete your account' });
    bcrypt.compare(pw, u.password_hash).then(ok => {
      if (!ok) return res.status(401).json({ error: 'Password incorrect' });
      doDelete();
    }).catch(() => res.status(500).json({ error: 'Could not verify password' }));
    return;
  }

  doDelete();

  function doDelete() {
    const sid = req.sessionID;

    try {
      db.prepare(`INSERT INTO audit_log (user_id,action,target,ip) VALUES (?,?,?,?)`)
        .run(userId, 'account_delete', u.email, req.ip);
    } catch {}

    // Remove sessions registry rows
    try { db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(userId); } catch {}

    // Delete user (cascades to papers/settings/badges via FK)
    db.prepare('DELETE FROM users WHERE id=?').run(userId);

    req.session.destroy(() => {
      if (sid) req.sessionStore?.destroy?.(sid, () => {});
      res.clearCookie('dv.sid');
      res.json({ ok: true });
    });
  }
});

module.exports = router;

