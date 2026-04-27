'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validate');
const db      = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { awardPoints, checkAndAwardBadges } = require('./reputation');
const router  = express.Router();

/* ── AVATAR UPLOAD ───────────────────────────────────── */
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, path.join(__dirname, '../public/uploads/avatars')),
  filename: (req, file, cb) =>
    cb(null, 'avatar-' + uuidv4() + path.extname(file.originalname).toLowerCase())
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg','.jpeg','.png','.webp','.gif'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  }
});

// Make sure avatars directory exists
const fs = require('fs');
const avatarDir = path.join(__dirname, '../public/uploads/avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

/* ── GET /api/users — public researcher list ─────────── */
router.get('/', (req, res) => {
  const users = db.prepare(
    `SELECT u.uuid, u.name, u.role, u.department, u.bio,
            u.avatar_url, u.reputation, u.xp, u.level,
            u.created_at,
            (SELECT COUNT(*) FROM papers WHERE user_id=u.id AND status='approved') AS paper_count,
            (SELECT COUNT(*) FROM user_badges WHERE user_id=u.id) AS badge_count,
            (SELECT COUNT(*) FROM endorsements WHERE to_user=u.id) AS endorse_count
     FROM users u
     WHERE u.is_active=1 AND u.role='researcher'
     ORDER BY u.reputation DESC, u.name`
  ).all();
  res.json(users);
});

/* ── GET /api/users/:uuid — single profile ───────────── */
router.get('/:uuid', (req, res) => {
  const allowAdmin = req.session?.role === 'admin';
  const u = db.prepare(
    `SELECT u.id, u.uuid, u.name, u.role, u.department, u.bio,
            u.website, u.twitter, u.avatar_url,
            u.reputation, u.xp, u.level, u.streak_days, u.created_at,
            (SELECT COUNT(*) FROM papers WHERE user_id=u.id AND status='approved') AS paper_count,
            (SELECT COUNT(*) FROM user_badges WHERE user_id=u.id) AS badge_count,
            (SELECT COUNT(*) FROM endorsements WHERE to_user=u.id) AS endorse_count,
            (SELECT COALESCE(SUM(views),0) FROM papers WHERE user_id=u.id) AS total_views
     FROM users u WHERE u.uuid=? AND u.is_active=1`
  ).get(req.params.uuid);

  if (!u || (!allowAdmin && u.role !== 'researcher'))
    return res.status(404).json({ error: 'Researcher not found' });

  const papers = db.prepare(
    `SELECT uuid, title, domain, keywords, status, views, downloads, created_at
     FROM papers WHERE user_id=? AND status='approved'
     ORDER BY created_at DESC`
  ).all(u.id);

  const badges = db.prepare(
    `SELECT b.slug, b.name, b.description, b.icon, b.color, b.tier, ub.earned_at
     FROM user_badges ub JOIN badges b ON ub.badge_id=b.id
     WHERE ub.user_id=? ORDER BY ub.earned_at DESC`
  ).all(u.id);

  res.json({ ...u, papers, badges });
});

/* ── PUT /api/users/profile — update own profile ──────── */
router.put('/profile', requireLogin, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be at least 2 characters'),
  body('bio').optional().trim().isLength({ max: 1000 }),
  body('department').optional().trim().isLength({ max: 100 })
], validateRequest, (req, res) => {
  const { name, department, bio, website, twitter } = req.body;

  const wasComplete = (() => {
    const u = db.prepare('SELECT bio, department, avatar_url FROM users WHERE id=?').get(req.session.userId);
    return u?.bio && u?.department && u?.avatar_url;
  })();

  db.prepare(
    `UPDATE users SET name=?, department=?, bio=?, website=?, twitter=?,
     updated_at=datetime('now') WHERE id=?`
  ).run(
    name.trim(), department || null, bio || null,
    website || null, twitter || null, req.session.userId
  );

  req.session.name = name.trim();

  // Check if profile is now complete for the first time
  if (!wasComplete) {
    const u = db.prepare('SELECT bio, department, avatar_url FROM users WHERE id=?').get(req.session.userId);
    if (u?.bio && u?.department && u?.avatar_url) {
      awardPoints(req.session.userId, 'profile_complete', 15, 75, null, 'Completed full profile');
    }
  }

  checkAndAwardBadges(req.session.userId);

  const updated = db.prepare(
    `SELECT id, uuid, name, email, role, department, bio, website,
            twitter, avatar_url, reputation, xp, level FROM users WHERE id=?`
  ).get(req.session.userId);
  res.json(updated);
});

/* ── POST /api/users/avatar — upload profile picture ──── */
router.post('/avatar', requireLogin, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });

  const url = '/uploads/avatars/' + req.file.filename;

  // Delete old avatar file if exists
  const old = db.prepare('SELECT avatar_url FROM users WHERE id=?').get(req.session.userId);
  if (old?.avatar_url && old.avatar_url.startsWith('/uploads/avatars/')) {
    // avatar_url is stored like "/uploads/avatars/filename.ext" (leading slash),
    // so strip leading slashes to keep joins inside public/.
    const oldRel = String(old.avatar_url).replace(/^\/+/, '');
    const oldPath = path.join(__dirname, '../public', oldRel);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  db.prepare(
    `UPDATE users SET avatar_url=?, updated_at=datetime('now') WHERE id=?`
  ).run(url, req.session.userId);

  // Check profile complete badge
  checkAndAwardBadges(req.session.userId);

  res.json({ ok: true, avatar_url: url });
});

/* ── DELETE /api/users/avatar — remove avatar ─────────── */
router.delete('/avatar', requireLogin, (req, res) => {
  const u = db.prepare('SELECT avatar_url FROM users WHERE id=?').get(req.session.userId);
  if (u?.avatar_url && u.avatar_url.startsWith('/uploads/avatars/')) {
    const rel = String(u.avatar_url).replace(/^\/+/, '');
    const p = path.join(__dirname, '../public', rel);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.prepare(`UPDATE users SET avatar_url=NULL, updated_at=datetime('now') WHERE id=?`)
    .run(req.session.userId);
  res.json({ ok: true });
});

module.exports = router;
