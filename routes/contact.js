'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validate');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/contact — public contact form submission
router.post('/', [
  body('name').optional().trim().isLength({ max: 120 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('subject').optional().trim().isLength({ max: 200 }),
  body('message').trim().isLength({ min: 10, max: 5000 }).withMessage('Message must be 10–5000 characters'),
], validateRequest, (req, res) => {

  const { name, email, subject, message } = req.body;
  const uuid = uuidv4();
  db.prepare(
    `INSERT INTO contact_messages (uuid,name,email,subject,message,ip)
     VALUES (?,?,?,?,?,?)`
  ).run(
    uuid,
    (name || '').trim() || null,
    (email || '').trim() || null,
    (subject || '').trim() || null,
    message.trim(),
    req.ip
  );
  res.status(201).json({ ok: true, uuid });
});

// GET /api/contact — admin list recent messages
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT uuid,name,email,subject,message,ip,created_at
     FROM contact_messages
     ORDER BY created_at DESC
     LIMIT 200`
  ).all();
  res.json(rows);
});

module.exports = router;

