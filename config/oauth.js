'use strict';
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GithubStrategy = require('passport-github2').Strategy;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

function baseUrl(req) {
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

async function ensureUser({ provider, providerId, name, email, avatarUrl }) {
  if (!email) return { error: 'Email not provided by provider.' };

  // 1) Existing OAuth link
  const byOauth = db.prepare(
    `SELECT * FROM users WHERE oauth_provider=? AND oauth_id=? AND is_active=1`
  ).get(provider, providerId);
  if (byOauth) return { user: byOauth };

  // 2) Existing local account by email → link it
  const byEmail = db.prepare(`SELECT * FROM users WHERE email=? AND is_active=1`).get(email);
  if (byEmail) {
    db.prepare(
      `UPDATE users SET oauth_provider=?, oauth_id=?, avatar_url=COALESCE(avatar_url,?), updated_at=datetime('now') WHERE id=?`
    ).run(provider, providerId, avatarUrl || null, byEmail.id);
    return { user: { ...byEmail, oauth_provider: provider, oauth_id: providerId } };
  }

  // 3) Create new account
  const randomPw = crypto.randomBytes(32).toString('hex');
  const hash = await bcrypt.hash(randomPw, 12);
  const uuid = uuidv4();
  const info = db.prepare(
    `INSERT INTO users (uuid,name,email,password_hash,role,avatar_url,oauth_provider,oauth_id)
     VALUES (?,?,?,?, 'researcher', ?, ?, ?)`
  ).run(uuid, name || 'Researcher', email, hash, avatarUrl || null, provider, providerId);

  const created = db.prepare(`SELECT * FROM users WHERE id=?`).get(info.lastInsertRowid);
  return { user: created };
}

function setupStrategies(app) {
  // Google
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/oauth/google/callback',
      passReqToCallback: true,
    }, async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile?.emails?.[0]?.value || null;
        const avatarUrl = profile?.photos?.[0]?.value || null;
        const r = await ensureUser({
          provider: 'google',
          providerId: profile.id,
          name: profile.displayName,
          email,
          avatarUrl
        });
        if (r.error) return done(null, false, { message: r.error });
        return done(null, r.user);
      } catch (e) { return done(e); }
    }));
  }

  // GitHub
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GithubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: '/api/auth/oauth/github/callback',
      scope: ['user:email'],
      passReqToCallback: true,
    }, async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile?.emails?.find(e => e.verified)?.value || profile?.emails?.[0]?.value || null;
        const avatarUrl = profile?.photos?.[0]?.value || null;
        const r = await ensureUser({
          provider: 'github',
          providerId: profile.id,
          name: profile.displayName || profile.username,
          email,
          avatarUrl
        });
        if (r.error) return done(null, false, { message: r.error });
        return done(null, r.user);
      } catch (e) { return done(e); }
    }));
  }

  // LinkedIn
  if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    passport.use(new LinkedInStrategy({
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL: '/api/auth/oauth/linkedin/callback',
      scope: ['r_liteprofile', 'r_emailaddress'],
      state: true,
      passReqToCallback: true,
    }, async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile?.emails?.[0]?.value || null;
        const avatarUrl = profile?.photos?.[0]?.value || null;
        const r = await ensureUser({
          provider: 'linkedin',
          providerId: profile.id,
          name: profile.displayName,
          email,
          avatarUrl
        });
        if (r.error) return done(null, false, { message: r.error });
        return done(null, r.user);
      } catch (e) { return done(e); }
    }));
  }

  // Let passport resolve relative callback URLs properly behind proxies
  app.use((req, res, next) => {
    // Patch strategy callback URL at request time to absolute URL
    const b = baseUrl(req);
    const fix = (name, path) => {
      const s = passport._strategy(name);
      if (s && s._callbackURL && s._callbackURL.startsWith('/')) s._callbackURL = b + path;
    };
    fix('google', '/api/auth/oauth/google/callback');
    fix('github', '/api/auth/oauth/github/callback');
    fix('linkedin', '/api/auth/oauth/linkedin/callback');
    next();
  });
}

module.exports = { setupStrategies };

