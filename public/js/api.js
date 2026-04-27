/* ============================================================
   DATA VOYAGE — api.js   v2
   All fetch calls to the backend REST API
   ============================================================ */
'use strict';

const API = {
  _csrfToken: null,
  async _ensureCsrfToken() {
    if (this._csrfToken) return this._csrfToken;
    const r = await fetch('/api/auth/csrf', { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.token) this._csrfToken = j.token;
    return this._csrfToken;
  },
  clearCsrfToken() {
    this._csrfToken = null;
  },

  async _fetch(url, opts = {}, _isRetry = false) {
    const method = (opts.method || 'GET').toUpperCase();
    const headers = { ...(opts.headers || {}) };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && url.startsWith('/api/')) {
      const t = await this._ensureCsrfToken();
      if (t) headers['X-CSRF-Token'] = t;
    }
    const res = await fetch(url, { credentials: 'include', ...opts, headers });
    // If server rejects CSRF (403), clear it. 
    // If it was the first attempt, try once more with a fresh token.
    if (res.status === 403 && !_isRetry && !['GET', 'HEAD', 'OPTIONS'].includes(method) && url.startsWith('/api/')) {
      this._csrfToken = null;
      return this._fetch(url, opts, true);
    }
    return res;
  },

  // ── PUBLIC STATS (no auth needed) ───────────────────────
  async getPublicStats() {
    const r = await this._fetch('/api/stats');
    return r.ok ? r.json() : {};
  },
  async getPapers(opts = {}) {
    const p = new URLSearchParams();
    if (opts.domain && opts.domain !== 'all') p.set('domain', opts.domain);
    if (opts.q)                p.set('q',    opts.q);
    if (opts.page)             p.set('page', opts.page);
    if (opts.sort)             p.set('sort', opts.sort);
    if (opts.year)             p.set('year', opts.year);
    if (opts.has_file === '1') p.set('has_file', '1');
    if (opts.min_endorsements && Number(opts.min_endorsements) > 0)
      p.set('min_endorsements', opts.min_endorsements);
    const r = await this._fetch('/api/research?' + p);
    return r.json();
  },
  async getPaper(uuid) {
    const r = await this._fetch(`/api/research/${uuid}`);
    return r.ok ? r.json() : null;
  },
  async getFileContent(uuid, fileId) {
    const r = await this._fetch(`/api/research/${uuid}/files/${fileId}/content`);
    return r.ok ? r.json() : { error: 'Could not load content' };
  },
  async uploadPaper(formData) {
    const r = await this._fetch('/api/research', { method: 'POST', body: formData });
    return r.json();
  },

  // ── SETTINGS ────────────────────────────────────────────
  async getMySettings() {
    const r = await this._fetch('/api/settings/me');
    return r.ok ? r.json() : null;
  },
  async updateMySettings(data) {
    const r = await this._fetch('/api/settings/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ok: false, error: j.error || 'Failed to save settings' };
  },

  // ── ACCOUNT SECURITY ───────────────────────────────────
  async getSessions() {
    const r = await this._fetch('/api/auth/sessions');
    return r.ok ? r.json() : [];
  },
  async revokeSession(sessionId) {
    const r = await this._fetch(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    return r.json();
  },
  async logoutAllSessions() {
    const r = await this._fetch('/api/auth/sessions/logout-all', { method: 'POST' });
    return r.json();
  },
  async changeEmail(newEmail, password) {
    const r = await this._fetch('/api/auth/change-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newEmail, password })
    });
    return r.json();
  },
  async changePassword(data) {
    const r = await this._fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },

  // ── PRIVACY ────────────────────────────────────────────
  async exportMyData() {
    const r = await this._fetch('/api/privacy/export');
    return r.ok ? r.json() : null;
  },
  async deleteMyAccount(password) {
    const r = await this._fetch('/api/privacy/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    return r.json();
  },
  async getMyPapers() {
    const r = await this._fetch('/api/research/mine');
    return r.ok ? r.json() : [];
  },
  async updatePaperStatus(uuid, status) {
    const r = await this._fetch(`/api/research/${uuid}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    return r.json();
  },
  async deletePaper(uuid) {
    const r = await this._fetch(`/api/research/${uuid}`, { method: 'DELETE' });
    return r.json();
  },

  // ── USERS ───────────────────────────────────────────────
  async getUsers() {
    const r = await this._fetch('/api/users');
    return r.ok ? r.json() : [];
  },
  async getResearchers(opts = {}) {
    const p = new URLSearchParams();
    if (opts.search)     p.set('search', opts.search);
    if (opts.department) p.set('department', opts.department);
    if (opts.domain)     p.set('domain', opts.domain);
    const r = await this._fetch('/api/researchers?' + p);
    return r.ok ? r.json() : [];
  },
  async getUser(uuid) {
    const r = await this._fetch(`/api/users/${uuid}`);
    return r.ok ? r.json() : null;
  },
  async updateProfile(data) {
    const r = await this._fetch('/api/users/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async uploadAvatar(formData) {
    const r = await this._fetch('/api/users/avatar', { method: 'POST', body: formData });
    return r.json();
  },
  async removeAvatar() {
    const r = await this._fetch('/api/users/avatar', { method: 'DELETE' });
    return r.json();
  },

  // ── REPUTATION ──────────────────────────────────────────
  async getLeaderboard() {
    const r = await this._fetch('/api/reputation/leaderboard');
    return r.ok ? r.json() : [];
  },
  async getMyRepStats() {
    const r = await this._fetch('/api/reputation/me/stats');
    return r.ok ? r.json() : null;
  },
  async getUserRepStats(uuid) {
    const r = await this._fetch(`/api/reputation/${uuid}`);
    return r.ok ? r.json() : null;
  },
  async endorsePaper(paperUuid) {
    const r = await this._fetch(`/api/reputation/endorse/${paperUuid}`, { method: 'POST' });
    return r.json();
  },

  // ── NEWS ────────────────────────────────────────────────
  async getNews(opts = {}) {
    const p = new URLSearchParams();
    if (opts.page)  p.set('page', opts.page);
    if (opts.limit) p.set('limit', opts.limit);
    if (opts.category) p.set('category', opts.category);
    const r = await this._fetch('/api/news' + (p.toString() ? '?' + p.toString() : ''));
    return r.ok ? r.json() : { items: [], total: 0, page: 1, pages: 1, limit: opts.limit || 9 };
  },
  async getNewsItem(uuid) {
    const r = await this._fetch(`/api/news/${uuid}`);
    return r.ok ? r.json() : null;
  },
  async getAllNews() {
    const r = await this._fetch('/api/news/all');
    return r.ok ? r.json() : [];
  },
  async createNews(data) {
    const r = await this._fetch('/api/news', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async deleteNews(uuid) {
    const r = await this._fetch(`/api/news/${uuid}`, { method: 'DELETE' });
    return r.json();
  },

  // ── ADMIN ───────────────────────────────────────────────
  async getAdminStats() {
    const r = await this._fetch('/api/admin/stats');
    return r.ok ? r.json() : {};
  },
  async getDashboardCharts() {
    const r = await this._fetch('/api/analytics/dashboard');
    return r.ok ? r.json() : null;
  },
  async submitContact(data) {
    const r = await this._fetch('/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async getAdminSubmissions(opts = {}) {
    const p = new URLSearchParams();
    if (opts.status) p.set('status', opts.status);
    if (opts.page)   p.set('page',   opts.page);
    const r = await this._fetch('/api/admin/submissions?' + p);
    return r.ok ? r.json() : { rows: [], total: 0 };
  },
  async updateSubmissionStatus(uuid, status) {
    const r = await this._fetch(`/api/admin/submissions/${uuid}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    return r.json();
  },
  async getAdminUsers() {
    const r = await this._fetch('/api/admin/users');
    return r.ok ? r.json() : [];
  },
  async updateAdminUser(id, data) {
    const r = await this._fetch(`/api/admin/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async deleteAdminUser(id) {
    const r = await this._fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    return r.json();
  },
  async getAuditLog() {
    const r = await this._fetch('/api/admin/audit');
    return r.ok ? r.json() : [];
  }
};

window.API = API;
