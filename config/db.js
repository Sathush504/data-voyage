'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/datavoyage.db';
const dataDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid            TEXT    NOT NULL UNIQUE,
    name            TEXT    NOT NULL,
    email           TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'researcher',
    department      TEXT,
    bio             TEXT,
    website         TEXT,
    twitter         TEXT,
    avatar_url      TEXT,
    reputation      INTEGER NOT NULL DEFAULT 0,
    xp              INTEGER NOT NULL DEFAULT 0,
    level           INTEGER NOT NULL DEFAULT 1,
    streak_days     INTEGER NOT NULL DEFAULT 0,
    last_active     TEXT    NOT NULL DEFAULT (datetime('now')),
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS papers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid         TEXT    NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,
    abstract     TEXT    NOT NULL,
    domain       TEXT    NOT NULL,
    keywords     TEXT,
    co_authors   TEXT,
    file_path    TEXT,
    file_name    TEXT,
    status       TEXT    NOT NULL DEFAULT 'pending',
    views        INTEGER NOT NULL DEFAULT 0,
    downloads    INTEGER NOT NULL DEFAULT 0,
    ai_summary   TEXT,
    ai_tags      TEXT,
    ai_keywords  TEXT,
    ai_score     INTEGER DEFAULT 0,
    ai_is_detected INTEGER DEFAULT 0,
    ai_processing_status TEXT NOT NULL DEFAULT 'idle',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS paper_files (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id   INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    file_path  TEXT    NOT NULL,
    file_name  TEXT    NOT NULL,
    file_type  TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS news (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid       TEXT    NOT NULL UNIQUE,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    title      TEXT    NOT NULL,
    summary    TEXT    NOT NULL,
    body       TEXT,
    category   TEXT    NOT NULL DEFAULT 'Announcement',
    published  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid       TEXT    NOT NULL UNIQUE,
    name       TEXT,
    email      TEXT,
    subject    TEXT,
    message    TEXT    NOT NULL,
    ip         TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS badges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL,
    icon        TEXT    NOT NULL,
    color       TEXT    NOT NULL DEFAULT '#0901FA',
    xp_reward   INTEGER NOT NULL DEFAULT 0,
    tier        TEXT    NOT NULL DEFAULT 'bronze'
  );

  CREATE TABLE IF NOT EXISTS user_badges (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id   INTEGER NOT NULL REFERENCES badges(id),
    earned_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, badge_id)
  );

  CREATE TABLE IF NOT EXISTS reputation_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     TEXT    NOT NULL,
    points     INTEGER NOT NULL,
    xp         INTEGER NOT NULL DEFAULT 0,
    ref_id     TEXT,
    note       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS endorsements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paper_id   INTEGER REFERENCES papers(id) ON DELETE SET NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(from_user, paper_id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id),
    action     TEXT    NOT NULL,
    target     TEXT,
    ip         TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_papers_user      ON papers(user_id);
  CREATE INDEX IF NOT EXISTS idx_papers_status    ON papers(status);
  CREATE INDEX IF NOT EXISTS idx_papers_domain    ON papers(domain);
  CREATE INDEX IF NOT EXISTS idx_news_pub         ON news(published);
  CREATE INDEX IF NOT EXISTS idx_rep_user         ON reputation_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
  CREATE INDEX IF NOT EXISTS idx_endorse_to       ON endorsements(to_user);
`);

// Password reset tokens (store only hashed tokens)
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL UNIQUE,
    expires_at  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_password_resets_user    ON password_resets(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);
`);

// User settings (industrial: explicit columns, easy to query)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id                INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    notify_paper_status    INTEGER NOT NULL DEFAULT 1,
    notify_platform        INTEGER NOT NULL DEFAULT 1,
    default_research_domain TEXT,
    saved_repo_query       TEXT,
    saved_repo_domain      TEXT,
    ui_theme               TEXT    NOT NULL DEFAULT 'system',
    ui_density             TEXT    NOT NULL DEFAULT 'comfortable',
    ui_reduced_motion      INTEGER NOT NULL DEFAULT 0,
    updated_at             TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_user_settings_theme   ON user_settings(ui_theme);
  CREATE INDEX IF NOT EXISTS idx_user_settings_density ON user_settings(ui_density);
`);

// Session registry (visibility + revocation)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT    NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip           TEXT,
    user_agent   TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_seen ON user_sessions(last_seen_at);
`);

// Pending email change verification tokens
db.exec(`
  CREATE TABLE IF NOT EXISTS email_change_requests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email  TEXT    NOT NULL,
    token_hash TEXT    NOT NULL,
    expires_at TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    used_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_email_change_user ON email_change_requests(user_id);
  CREATE INDEX IF NOT EXISTS idx_email_change_token ON email_change_requests(token_hash);
`);

// ── LIGHTWEIGHT MIGRATIONS ─────────────────────────────────────
function addColumnIfMissing(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  if (cols.includes(col)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}

addColumnIfMissing('users', 'oauth_provider', 'TEXT');
addColumnIfMissing('users', 'oauth_id', 'TEXT');
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;`);

// AI Enrichment migrations
addColumnIfMissing('papers', 'ai_summary', 'TEXT');
addColumnIfMissing('papers', 'ai_tags', 'TEXT');
addColumnIfMissing('papers', 'ai_keywords', 'TEXT');
addColumnIfMissing('papers', 'ai_score', 'INTEGER DEFAULT 0');
addColumnIfMissing('papers', 'ai_is_detected', 'INTEGER DEFAULT 0');
addColumnIfMissing('papers', 'ai_processing_status', "TEXT NOT NULL DEFAULT 'idle'");

// Settings migrations
addColumnIfMissing('users', 'phone', 'TEXT');

addColumnIfMissing('user_settings', 'language', 'TEXT');
addColumnIfMissing('user_settings', 'time_zone', 'TEXT');
addColumnIfMissing('user_settings', 'font_scale', "TEXT NOT NULL DEFAULT 'md'");
addColumnIfMissing('user_settings', 'profile_public', 'INTEGER NOT NULL DEFAULT 1');
addColumnIfMissing('user_settings', 'data_sharing', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('user_settings', 'usage_tracking', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('user_settings', 'notify_email', 'INTEGER NOT NULL DEFAULT 1');
addColumnIfMissing('user_settings', 'notify_sms', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('user_settings', 'notify_push', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('user_settings', 'notify_digest', "TEXT NOT NULL DEFAULT 'realtime'");
addColumnIfMissing('user_settings', 'two_factor_enabled', 'INTEGER NOT NULL DEFAULT 0');

/* ── SEED BADGES ─────────────────────────────────────── */
const ins = db.prepare(
  `INSERT OR IGNORE INTO badges (slug,name,description,icon,color,xp_reward,tier)
   VALUES (?,?,?,?,?,?,?)`
);
db.transaction(() => {
  [
    ['welcome',          'Welcome Aboard',    'Created your Data Voyage account',                  '⬡',  '#0901FA', 50,   'bronze'  ],
    ['first_upload',     'First Upload',      'Submitted your first research paper',               '📄', '#3d35fb', 100,  'bronze'  ],
    ['profile_complete', 'Full Profile',      'Completed bio, department, and avatar',             '✨', '#7c3aed', 75,   'bronze'  ],
    ['papers_3',         'Rising Researcher', 'Had 3 papers approved',                             '🔬', '#0600c0', 200,  'silver'  ],
    ['papers_10',        'Prolific Author',   'Had 10 papers approved',                            '📚', '#0901FA', 500,  'gold'    ],
    ['papers_25',        'Research Legend',   'Had 25 papers approved',                            '🏆', '#f59e0b', 1500, 'platinum'],
    ['views_100',        'Notable Work',      'Your papers reached 100 total views',               '👁', '#00d4ff', 150,  'silver'  ],
    ['views_1000',       'Viral Research',    'Your papers reached 1,000 total views',             '🚀', '#06b6d4', 600,  'gold'    ],
    ['endorsed_5',       'Peer Recognised',   'Received 5 endorsements from colleagues',           '🤝', '#10b981', 250,  'silver'  ],
    ['endorsed_20',      'Community Pillar',  'Received 20 endorsements from colleagues',          '🌟', '#f59e0b', 800,  'gold'    ],
    ['multi_domain',     'Polymath',          'Published research in 3 or more different domains', '🧠', '#8b5cf6', 300,  'gold'    ],
    ['streak_7',         'Weekly Streak',     'Active on the platform 7 days in a row',            '🔥', '#ef4444', 100,  'bronze'  ],
    ['streak_30',        'Monthly Devotee',   'Active on the platform 30 days in a row',           '💎', '#06b6d4', 400,  'platinum'],
    ['early_adopter',    'Early Adopter',     'One of the first 20 members to join',               '🌊', '#0901FA', 200,  'gold'    ],
  ].forEach(r => ins.run(...r));
})();

module.exports = db;
