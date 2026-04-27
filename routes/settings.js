'use strict';
const express = require('express');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validate');
const db = require('../config/db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

function ensureSettingsRow(userId) {
  const existing = db.prepare('SELECT user_id FROM user_settings WHERE user_id=?').get(userId);
  if (existing) return;
  db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId);
}

// GET /api/settings/me
router.get('/me', requireLogin, (req, res) => {
  ensureSettingsRow(req.session.userId);
  const s = db.prepare(
    `SELECT notify_paper_status, notify_platform,
            notify_email, notify_sms, notify_push, notify_digest,
            default_research_domain, saved_repo_query, saved_repo_domain,
            ui_theme, ui_density, ui_reduced_motion, font_scale,
            language, time_zone,
            profile_public, data_sharing, usage_tracking,
            two_factor_enabled,
            updated_at
     FROM user_settings WHERE user_id=?`
  ).get(req.session.userId);
  res.json(s || {});
});

// PUT /api/settings/me
router.put('/me', requireLogin, [
  body('notify_paper_status').optional().isBoolean(),
  body('notify_platform').optional().isBoolean(),
  body('notify_email').optional().isBoolean(),
  body('notify_sms').optional().isBoolean(),
  body('notify_push').optional().isBoolean(),
  body('notify_digest').optional().isIn(['realtime', 'daily', 'weekly']),
  body('default_research_domain').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('saved_repo_query').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('saved_repo_domain').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('ui_theme').optional().isIn(['system', 'light', 'dark']),
  body('ui_density').optional().isIn(['comfortable', 'compact']),
  body('ui_reduced_motion').optional().isBoolean(),
  body('font_scale').optional().isIn(['sm', 'md', 'lg', 'xl']),
  body('language').optional({ nullable: true }).isString().isLength({ max: 20 }),
  body('time_zone').optional({ nullable: true }).isString().isLength({ max: 60 }),
  body('profile_public').optional().isBoolean(),
  body('data_sharing').optional().isBoolean(),
  body('usage_tracking').optional().isBoolean(),
  body('two_factor_enabled').optional().isBoolean(),
], validateRequest, (req, res) => {

  ensureSettingsRow(req.session.userId);
  const cur = db.prepare('SELECT * FROM user_settings WHERE user_id=?').get(req.session.userId) || {};

  const next = {
    notify_paper_status: req.body.notify_paper_status !== undefined ? (req.body.notify_paper_status ? 1 : 0) : cur.notify_paper_status,
    notify_platform: req.body.notify_platform !== undefined ? (req.body.notify_platform ? 1 : 0) : cur.notify_platform,
    notify_email: req.body.notify_email !== undefined ? (req.body.notify_email ? 1 : 0) : (cur.notify_email ?? 1),
    notify_sms: req.body.notify_sms !== undefined ? (req.body.notify_sms ? 1 : 0) : (cur.notify_sms ?? 0),
    notify_push: req.body.notify_push !== undefined ? (req.body.notify_push ? 1 : 0) : (cur.notify_push ?? 0),
    notify_digest: req.body.notify_digest !== undefined ? req.body.notify_digest : (cur.notify_digest || 'realtime'),
    default_research_domain: req.body.default_research_domain !== undefined ? (req.body.default_research_domain || null) : cur.default_research_domain,
    saved_repo_query: req.body.saved_repo_query !== undefined ? (req.body.saved_repo_query || null) : cur.saved_repo_query,
    saved_repo_domain: req.body.saved_repo_domain !== undefined ? (req.body.saved_repo_domain || null) : cur.saved_repo_domain,
    ui_theme: req.body.ui_theme !== undefined ? req.body.ui_theme : cur.ui_theme,
    ui_density: req.body.ui_density !== undefined ? req.body.ui_density : cur.ui_density,
    ui_reduced_motion: req.body.ui_reduced_motion !== undefined ? (req.body.ui_reduced_motion ? 1 : 0) : cur.ui_reduced_motion,
    font_scale: req.body.font_scale !== undefined ? req.body.font_scale : (cur.font_scale || 'md'),
    language: req.body.language !== undefined ? (req.body.language || null) : (cur.language || null),
    time_zone: req.body.time_zone !== undefined ? (req.body.time_zone || null) : (cur.time_zone || null),
    profile_public: req.body.profile_public !== undefined ? (req.body.profile_public ? 1 : 0) : (cur.profile_public ?? 1),
    data_sharing: req.body.data_sharing !== undefined ? (req.body.data_sharing ? 1 : 0) : (cur.data_sharing ?? 0),
    usage_tracking: req.body.usage_tracking !== undefined ? (req.body.usage_tracking ? 1 : 0) : (cur.usage_tracking ?? 0),
    two_factor_enabled: req.body.two_factor_enabled !== undefined ? (req.body.two_factor_enabled ? 1 : 0) : (cur.two_factor_enabled ?? 0),
  };

  db.prepare(
    `UPDATE user_settings
     SET notify_paper_status=?, notify_platform=?,
         notify_email=?, notify_sms=?, notify_push=?, notify_digest=?,
         default_research_domain=?, saved_repo_query=?, saved_repo_domain=?,
         ui_theme=?, ui_density=?, ui_reduced_motion=?, font_scale=?,
         language=?, time_zone=?,
         profile_public=?, data_sharing=?, usage_tracking=?,
         two_factor_enabled=?,
         updated_at=datetime('now')
     WHERE user_id=?`
  ).run(
    next.notify_paper_status, next.notify_platform,
    next.notify_email, next.notify_sms, next.notify_push, next.notify_digest,
    next.default_research_domain, next.saved_repo_query, next.saved_repo_domain,
    next.ui_theme, next.ui_density, next.ui_reduced_motion, next.font_scale,
    next.language, next.time_zone,
    next.profile_public, next.data_sharing, next.usage_tracking,
    next.two_factor_enabled,
    req.session.userId
  );

  db.prepare(`INSERT INTO audit_log (user_id, action, target, ip) VALUES (?,?,?,?)`)
    .run(req.session.userId, 'settings_update', 'user_settings', req.ip);

  res.json({ ok: true, settings: next });
});

module.exports = router;

