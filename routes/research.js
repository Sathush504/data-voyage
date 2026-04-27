'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validate');
const db      = require('../config/db');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { awardPoints, checkAndAwardBadges } = require('./reputation');
const aiService = require('../services/ai_service');
const router  = express.Router();

// Ensure uploads directory exists on fresh deploys
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads')),
  filename:    (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname).toLowerCase())
});

const ALLOWED = ['.pdf','.doc','.docx','.csv','.zip','.ipynb','.r','.py','.txt','.xlsx'];
const upload  = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(ALLOWED.includes(ext) ? null : new Error('File type not allowed'), ALLOWED.includes(ext));
  }
});

// GET /api/research — public approved list
router.get('/', (req, res) => {
  const { domain, q, page = 1, sort = 'newest', year, has_file, min_endorsements } = req.query;
  const limit = 12, offset = (Number(page) - 1) * limit;
  const params = [];
  let where = `WHERE p.status='approved'`;

  if (domain && domain !== 'all') { where += ' AND p.domain=?'; params.push(domain); }
  if (q) {
    where += ' AND (p.title LIKE ? OR p.abstract LIKE ? OR p.keywords LIKE ? OR u.name LIKE ?)';
    const like = `%${q}%`; params.push(like, like, like, like);
  }
  if (year) {
    where += ` AND strftime('%Y', p.created_at) = ?`;
    params.push(String(year));
  }
  if (has_file === '1') {
    where += ` AND p.file_path IS NOT NULL AND p.file_path != ''`;
  }
  if (min_endorsements && Number(min_endorsements) > 0) {
    where += ` AND (SELECT COUNT(*) FROM endorsements WHERE paper_id=p.id) >= ?`;
    params.push(Number(min_endorsements));
  }

  const ORDER_MAP = {
    newest:        'p.created_at DESC',
    oldest:        'p.created_at ASC',
    most_viewed:   'p.views DESC',
    most_downloaded: 'p.downloads DESC',
    most_endorsed: '(SELECT COUNT(*) FROM endorsements WHERE paper_id=p.id) DESC',
  };
  const orderBy = ORDER_MAP[sort] || ORDER_MAP.newest;

  const papers = db.prepare(
    `SELECT p.uuid,p.title,p.abstract,p.domain,p.keywords,p.co_authors,
            p.file_path,p.file_name,p.views,p.downloads,p.created_at,p.status,
            p.ai_processing_status,
            u.name AS author_name,u.department AS author_dept,
            u.uuid AS author_uuid,u.avatar_url AS author_avatar,
            (SELECT COUNT(*) FROM endorsements WHERE paper_id=p.id) AS endorsements
     FROM papers p JOIN users u ON p.user_id=u.id ${where}
     ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const total = db.prepare(
    `SELECT COUNT(*) c FROM papers p JOIN users u ON p.user_id=u.id ${where}`
  ).get(...params).c;

  // Return year range for filter UI
  const yearRange = db.prepare(
    `SELECT strftime('%Y', MIN(created_at)) AS min_year, strftime('%Y', MAX(created_at)) AS max_year
     FROM papers WHERE status='approved'`
  ).get();

  res.json({ papers, total, page: Number(page), pages: Math.ceil(total / limit), yearRange });
});

// GET /api/research/mine
router.get('/mine', requireLogin, (req, res) => {
  const papers = db.prepare(
    `SELECT uuid,title,domain,status,views,downloads,created_at FROM papers
     WHERE user_id=? ORDER BY created_at DESC`
  ).all(req.session.userId);
  res.json(papers);
});

// GET /api/research/:uuid
router.get('/:uuid', (req, res) => {
  let sql = `SELECT p.*,u.name AS author_name,u.department,u.uuid AS author_uuid,
            u.avatar_url AS author_avatar,u.reputation AS author_rep,u.level AS author_level,
            (SELECT COUNT(*) FROM endorsements WHERE paper_id=p.id) AS endorsements
     FROM papers p JOIN users u ON p.user_id=u.id
     WHERE p.uuid=?`;
  
  const params = [req.params.uuid];
  if (req.session.role !== 'admin') {
    sql += ` AND p.status='approved'`;
  }

  const p = db.prepare(sql).get(...params);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE papers SET views=views+1 WHERE uuid=?').run(req.params.uuid);
  const files = db.prepare('SELECT id,file_name,file_path,file_type FROM paper_files WHERE paper_id=?').all(p.id);
  res.json({ ...p, files });
});

// GET /api/research/:uuid/download — secure primary file download (tracks downloads)
router.get('/:uuid/download', (req, res) => {
  const p = db.prepare(
    `SELECT id, uuid, user_id, title, file_path, file_name
     FROM papers WHERE uuid=? AND status='approved'`
  ).get(req.params.uuid);
  if (!p || !p.file_path) return res.status(404).json({ error: 'File not found' });

  if (!String(p.file_path).startsWith('/uploads/'))
    return res.status(400).json({ error: 'Invalid file path' });

  // file_path is stored like "/uploads/filename.ext" (leading slash),
  // so strip leading slashes to avoid path.join treating it as absolute.
  const rel = String(p.file_path).replace(/^\/+/, '');
  const abs = path.join(__dirname, '..', 'public', rel);
  const publicRoot = path.join(__dirname, '..', 'public') + path.sep;
  if (!abs.startsWith(publicRoot)) return res.status(400).json({ error: 'Invalid file path' });
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing on server' });

  db.prepare('UPDATE papers SET downloads=downloads+1 WHERE uuid=?').run(req.params.uuid);
  awardPoints(p.user_id, 'paper_downloaded', 2, 5, req.params.uuid, `Downloaded: ${p.title}`);
  checkAndAwardBadges(p.user_id);

  res.download(abs, p.file_name || path.basename(abs));
});

// GET /api/research/:uuid/view — view primary file in browser
router.get('/:uuid/view', (req, res) => {
  const p = db.prepare(
    `SELECT file_path, file_name, status FROM papers WHERE uuid=?`
  ).get(req.params.uuid);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.status !== 'approved' && req.session.role !== 'admin')
    return res.status(403).json({ error: 'Unauthorized' });

  const rel = String(p.file_path).replace(/^\/+/, '');
  const abs = path.join(__dirname, '..', 'public', rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });

  res.sendFile(abs);
});

// GET /api/research/:uuid/files/:fileId/download — secure supporting file download
router.get('/:uuid/files/:fileId/download', (req, res) => {
  const paper = db.prepare(`SELECT id, status FROM papers WHERE uuid=?`).get(req.params.uuid);
  if (!paper) return res.status(404).json({ error: 'Not found' });
  if (paper.status !== 'approved' && req.session.role !== 'admin')
    return res.status(403).json({ error: 'Unauthorized' });

  const f = db.prepare(
    `SELECT file_path, file_name
     FROM paper_files
     WHERE id=? AND paper_id=?`
  ).get(Number(req.params.fileId), paper.id);
  if (!f) return res.status(404).json({ error: 'File not found' });

  const rel = String(f.file_path).replace(/^\/+/, '');
  const abs = path.join(__dirname, '..', 'public', rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });

  res.download(abs, f.file_name);
});

// GET /api/research/:uuid/files/:fileId/content — get raw text content (for code viewer)
router.get('/:uuid/files/:fileId/content', (req, res) => {
  const paper = db.prepare(`SELECT id, status FROM papers WHERE uuid=?`).get(req.params.uuid);
  if (!paper) return res.status(404).json({ error: 'Not found' });
  if (paper.status !== 'approved' && req.session.role !== 'admin')
    return res.status(403).json({ error: 'Unauthorized' });

  const f = db.prepare(
    `SELECT file_path
     FROM paper_files
     WHERE id=? AND paper_id=?`
  ).get(Number(req.params.fileId), paper.id);
  if (!f) return res.status(404).json({ error: 'File not found' });

  const rel = String(f.file_path).replace(/^\/+/, '');
  const abs = path.join(__dirname, '..', 'public', rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });

  const stats = fs.statSync(abs);
  if (stats.size > 1024 * 1024) return res.status(400).json({ error: 'File too large for viewer' });

  const content = fs.readFileSync(abs, 'utf8');
  res.json({ content });
});

// POST /api/research — submit paper
router.post('/', requireLogin,
  upload.fields([{ name:'paper', maxCount:1 }, { name:'support', maxCount:5 }]),
  [
    body('title').trim().isLength({ min:5, max:250 }).withMessage('Title must be 5–250 characters'),
    body('abstract').trim().isLength({ min:20 }).withMessage('Abstract must be at least 20 characters'),
    body('domain').trim().notEmpty().withMessage('Domain is required'),
  ], validateRequest,
  (req, res) => {

    const { title, abstract, domain, keywords, co_authors, uuid: clientUuid } = req.body;
    const paperFile = req.files?.paper?.[0];
    const uuid = clientUuid || uuidv4();

    let info;
    try {
      info = db.prepare(
        `INSERT INTO papers
           (uuid,user_id,title,abstract,domain,keywords,co_authors,file_path,file_name,status)
         VALUES (?,?,?,?,?,?,?,?,?,'pending')`
      ).run(uuid, req.session.userId, title, abstract, domain,
            keywords || null, co_authors || null,
            paperFile ? '/uploads/'+paperFile.filename : null,
            paperFile ? paperFile.originalname : null);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed: papers.uuid')) {
        // Already processed (idempotent)
        return res.status(201).json({ ok: true, uuid, message: 'Paper already submitted.' });
      }
      throw err;
    }

    (req.files?.support || []).forEach(f => {
      db.prepare(
        `INSERT INTO paper_files (paper_id,file_path,file_name,file_type) VALUES (?,?,?,?)`
      ).run(info.lastInsertRowid, '/uploads/'+f.filename, f.originalname,
            path.extname(f.originalname).slice(1).toLowerCase());
    });

    // Award XP for submitting
    awardPoints(req.session.userId, 'paper_submit', 5, 20, uuid, `Submitted: ${title}`);

    // Trigger AI Enrichment (Automation)
    aiService.processPaper(info.lastInsertRowid);

    res.status(201).json({ ok: true, uuid, message: 'Paper submitted for review.' });
  }
);

// PATCH /api/research/:uuid/status — admin approve/reject
router.patch('/:uuid/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['approved','rejected','review','pending'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  const paper = db.prepare('SELECT * FROM papers WHERE uuid=?').get(req.params.uuid);
  if (!paper) return res.status(404).json({ error: 'Not found' });

  const wasApproved = paper.status === 'approved';
  db.prepare(`UPDATE papers SET status=?,updated_at=datetime('now') WHERE uuid=?`)
    .run(status, req.params.uuid);

  // Award big XP when paper is approved
  if (status === 'approved' && !wasApproved) {
    awardPoints(paper.user_id, 'paper_approved', 50, 150, req.params.uuid, `Paper approved: ${paper.title}`);
    checkAndAwardBadges(paper.user_id);
  }

  res.json({ ok: true });
});

// DELETE /api/research/:uuid
router.delete('/:uuid', requireLogin, (req, res) => {
  const p = db.prepare('SELECT * FROM papers WHERE uuid=?').get(req.params.uuid);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.user_id !== req.session.userId && req.session.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM papers WHERE uuid=?').run(req.params.uuid);
  res.json({ ok: true });
});

router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 50MB.' });
  res.status(400).json({ error: err.message });
});

module.exports = router;
