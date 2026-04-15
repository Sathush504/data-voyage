# Data Voyage

University Data Science Research Platform for publishing research papers, showcasing analytics dashboards, sharing news, and connecting researchers.

## Highlights

- Research repository with approvals, downloads, and domain filtering
- Researcher profiles, reputation, badges, and endorsements
- News and announcements with categories and publishing controls
- Admin analytics dashboard and platform statistics
- Secure auth with sessions, CSRF protection, and optional OAuth
- Email notifications for password resets and account changes (optional)

## Tech Stack

- Node.js + Express
- SQLite (better-sqlite3)
- Passport (Google, GitHub, LinkedIn OAuth)
- HTML/CSS/JS frontend

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Git (optional, for cloning)

### Local Setup

1) Clone the repository (or download and extract it)

```bash
git clone https://github.com/Sathush504/data-voyage.git
cd data-voyage
```

2) Install dependencies

```bash
npm install
```

3) Create environment file

```bash
copy .env.example .env
```

4) Update .env values

- Set `SESSION_SECRET` to a 32+ character random string.
- Optional: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to auto-create the first admin account.
- Optional: set `DB_PATH` if you want the database in a different location.

5) Start the server

```bash
npm run dev
```

Open http://localhost:3000

Notes:

- The SQLite database and session store are created automatically on first run.
- Uploaded files go to `public/uploads`.

### Docker

```bash
docker compose up --build
```

The container uses these volumes:

- ./data for SQLite data
- ./public/uploads for uploaded files

## Configuration

All settings are in .env. Use .env.example as a template.

Required in production:

- SESSION_SECRET (32+ characters)

Optional:

- ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap the first admin user
- DB_PATH for SQLite file path
- MAX_FILE_SIZE for paper uploads
- PUBLIC_BASE_URL, BASE_URL, APP_BASE_URL for absolute links
- SMTP_* for email delivery
- GOOGLE_CLIENT_ID/SECRET, GITHUB_CLIENT_ID/SECRET, LINKEDIN_CLIENT_ID/SECRET

## Scripts

- npm run dev - start with nodemon
- npm start - start server
- npm run start:prod - production start

## API Overview

- GET /api/health - health check
- GET /api/stats - public platform stats
- /api/auth - login, register, password reset, OAuth
- /api/research - research list and submissions
- /api/researchers - researcher profiles
- /api/news - news and announcements
- /api/analytics - dashboards and metrics
- /api/admin - admin-only endpoints
- /api/reputation - badges, endorsements, reputation
- /api/settings - user settings
- /api/contact - contact form
- /api/privacy - privacy content

## Project Structure

- config - database, mailer, and OAuth setup
- data - SQLite database and session store
- middleware - auth and guards
- public - frontend assets
- routes - API routes
- uploads - user-uploaded files (avatars)

## Tests

Manual test scenarios are tracked in test-cases.md.

## License

All Rights Reserved. See LICENSE.
