'use strict';
const express = require('express');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validate');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../config/mailer');
const router = express.Router();

router.use(requireAdmin);

router.get('/stats', (req, res) => {
  res.json({
    totalPapers: db.prepare(`SELECT COUNT(*) c FROM papers`).get().c,
    pendingPapers: db.prepare(`SELECT COUNT(*) c FROM papers WHERE status='pending'`).get().c,
    reviewPapers: db.prepare(`SELECT COUNT(*) c FROM papers WHERE status='review'`).get().c,
    approvedPapers: db.prepare(`SELECT COUNT(*) c FROM papers WHERE status='approved'`).get().c,
    totalUsers: db.prepare(`SELECT COUNT(*) c FROM users WHERE role='researcher'`).get().c,
    activeUsers: db.prepare(`SELECT COUNT(*) c FROM users WHERE is_active=1`).get().c,
    totalNews: db.prepare(`SELECT COUNT(*) c FROM news`).get().c,
    publishedNews: db.prepare(`SELECT COUNT(*) c FROM news WHERE published=1`).get().c,
    badgesAwarded: db.prepare(`SELECT COUNT(*) c FROM user_badges`).get().c,
    endorsements: db.prepare(`SELECT COUNT(*) c FROM endorsements`).get().c,
  });
});

router.get('/submissions', (req, res) => {
  const { status = 'all', page = 1 } = req.query;
  const limit = 20, offset = (Number(page) - 1) * limit;
  const params = [];
  let where = '';
  if (status !== 'all') { where = 'WHERE p.status=?'; params.push(status); }
  const rows = db.prepare(
    `SELECT p.id,p.uuid,p.title,p.domain,p.status,p.views,p.downloads,
            p.file_name,p.created_at,
            u.name AS author_name,u.email AS author_email,u.reputation AS author_rep
     FROM papers p JOIN users u ON p.user_id=u.id
     ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) c FROM papers p ${where}`).get(...params).c;
  res.json({ rows, total, page: Number(page), pages: Math.ceil(total / limit) });
});

router.patch('/submissions/:uuid', [
  body('status').isIn(['approved', 'rejected', 'review', 'pending']).withMessage('Invalid status')
], validateRequest, (req, res) => {
  const { status } = req.body;

  const before = db.prepare(
    `SELECT p.uuid,p.title,p.status,u.email AS author_email,u.name AS author_name,
            COALESCE(us.notify_paper_status, 1) AS notify_paper_status
     FROM papers p
     JOIN users u ON p.user_id=u.id
     LEFT JOIN user_settings us ON us.user_id=u.id
     WHERE p.uuid=?`
  ).get(req.params.uuid);
  if (!before) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE papers SET status=?,updated_at=datetime('now') WHERE uuid=?`).run(status, req.params.uuid);
  db.prepare(`INSERT INTO audit_log (user_id,action,target,ip) VALUES (?,?,?,?)`)
    .run(req.session.userId, `paper_${status}`, req.params.uuid, req.ip);

  // Email notification (approve/reject)
  if (before.author_email && before.notify_paper_status && (status === 'approved' || status === 'rejected') && before.status !== status) {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const paperLink = `${baseUrl}/?paper=${encodeURIComponent(before.uuid)}`;
    const subject = status === 'approved'
      ? 'Your Data Voyage paper was approved'
      : 'Your Data Voyage paper was rejected';
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a2040">
        <h2 style="margin:0 0 10px">${status === 'approved' ? 'Paper approved' : 'Paper rejected'}</h2>
        <p>Hello ${before.author_name || 'Researcher'},</p>
        <p>Your submission <strong>${before.title}</strong> has been <strong>${status}</strong>.</p>
        <p><a href="${paperLink}" style="display:inline-block;background:#0901FA;color:white;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:700">View paper</a></p>
        <p style="font-size:12px;color:#8892b0">Link: ${paperLink}</p>
      </div>
    `;
    (async () => {
      try { await sendEmail({ to: before.author_email, subject, html, text: `${subject}\n${paperLink}` }); }
      catch { }
    })();
  }

  res.json({ ok: true });
});

router.get('/users', (req, res) => {
  const users = db.prepare(
    `SELECT u.id,u.uuid,u.name,u.email,u.role,u.department,
            u.is_active,u.reputation,u.xp,u.level,u.created_at,
            (SELECT COUNT(*) FROM papers WHERE user_id=u.id) AS paper_count,
            (SELECT COUNT(*) FROM user_badges WHERE user_id=u.id) AS badge_count
     FROM users u ORDER BY u.created_at DESC`
  ).all();
  res.json(users);
});

router.patch('/users/:id', [
  body('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
  body('role').optional().isIn(['researcher', 'admin']).withMessage('Invalid role')
], validateRequest, (req, res) => {
  const { is_active, role } = req.body;
  if (Number(req.params.id) === req.session.userId)
    return res.status(400).json({ error: "You cannot modify your own account." });
  if (is_active !== undefined)
    db.prepare('UPDATE users SET is_active=? WHERE id=?').run(is_active === true || is_active === 'true' ? 1 : 0, req.params.id);
  if (role)
    db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
  db.prepare(`INSERT INTO audit_log (user_id,action,target,ip) VALUES (?,?,?,?)`)
    .run(req.session.userId, 'user_update', req.params.id, req.ip);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  if (userId === req.session.userId)
    return res.status(400).json({ error: "You cannot delete your own account." });

  try {
    const tx = db.transaction(() => {
      // Cleanup dependent tables that might lack CASCADE in existing DBs
      db.prepare('DELETE FROM news WHERE user_id=?').run(userId);
      db.prepare('DELETE FROM audit_log WHERE user_id=?').run(userId);
      db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(userId);
      db.prepare('DELETE FROM user_settings WHERE user_id=?').run(userId);
      db.prepare('DELETE FROM email_change_requests WHERE user_id=?').run(userId);
      db.prepare('DELETE FROM password_resets WHERE user_id=?').run(userId);

      // Finally delete the user
      db.prepare('DELETE FROM users WHERE id=?').run(userId);
    });
    tx();
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user. They may have active dependencies.' });
  }
});

router.get('/audit', (req, res) => {
  const logs = db.prepare(
    `SELECT a.*,u.name AS user_name,u.email AS user_email
     FROM audit_log a LEFT JOIN users u ON a.user_id=u.id
     ORDER BY a.created_at DESC LIMIT 100`
  ).all();
  res.json(logs);
});

module.exports = router;
