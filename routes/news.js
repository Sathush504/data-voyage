'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validate');
const db      = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const router  = express.Router();

// GET /api/news — public published news (optional category filter)
router.get('/', (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 9)));
  const offset = (page - 1) * limit;
  const category = (req.query.category || '').trim();

  const params = [];
  let where = 'WHERE n.published = 1';
  if (category) {
    where += ' AND n.category = ?';
    params.push(category);
  }

  const items = db.prepare(
    `SELECT n.uuid, n.title, n.summary, n.body, n.category, n.created_at,
            u.name AS author_name
     FROM news n JOIN users u ON n.user_id = u.id
     ${where}
     ORDER BY n.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const total = db.prepare(
    `SELECT COUNT(*) c FROM news n
     ${where}`
  ).get(...params).c;

  res.json({ items, total, page, pages: Math.ceil(total / limit), limit, category: category || null });
});

// GET /api/news/:uuid — public full article
router.get('/:uuid', (req, res) => {
  const n = db.prepare(
    `SELECT n.uuid, n.title, n.summary, n.body, n.category, n.created_at,
            u.name AS author_name
     FROM news n JOIN users u ON n.user_id = u.id
     WHERE n.uuid=? AND n.published=1`
  ).get(req.params.uuid);
  if (!n) return res.status(404).json({ error: 'Not found' });
  res.json(n);
});

// GET /api/news/all — admin sees all including drafts
router.get('/all', requireAdmin, (req, res) => {
  const items = db.prepare(
    `SELECT n.*, u.name AS author_name
     FROM news n JOIN users u ON n.user_id = u.id
     ORDER BY n.created_at DESC`
  ).all();
  res.json(items);
});

// POST /api/news — admin create
router.post('/', requireAdmin, [
  body('title').trim().isLength({ min: 3, max: 250 }).withMessage('Title required (3–250 chars)'),
  body('summary').trim().isLength({ min: 10 }).withMessage('Summary required'),
  body('category').optional().trim(),
  body('body').optional().trim(),
  body('published').optional().isBoolean()
], validateRequest, (req, res) => {

  const { title, summary, body: bodyText, category, published } = req.body;
  const uuid = uuidv4();
  db.prepare(
    `INSERT INTO news (uuid, user_id, title, summary, body, category, published)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid, req.session.userId, title, summary, bodyText || null,
        category || 'Announcement', published ? 1 : 0);

  res.status(201).json({ ok: true, uuid });
});

// PUT /api/news/:uuid — admin update
router.put('/:uuid', requireAdmin, [
  body('title').trim().isLength({ min: 3, max: 250 }),
  body('summary').trim().isLength({ min: 10 }),
], validateRequest, (req, res) => {

  const { title, summary, body: bodyText, category, published } = req.body;
  db.prepare(
    `UPDATE news SET title=?, summary=?, body=?, category=?, published=?,
     updated_at=datetime('now') WHERE uuid=?`
  ).run(title, summary, bodyText || null, category || 'Announcement',
        published ? 1 : 0, req.params.uuid);

  res.json({ ok: true });
});

// DELETE /api/news/:uuid — admin delete
router.delete('/:uuid', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM news WHERE uuid = ?').run(req.params.uuid);
  res.json({ ok: true });
});

module.exports = router;
