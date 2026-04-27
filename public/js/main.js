/* ============================================================
   DATA VOYAGE — main.js  v2
   Routing · Data Loading · Profile System · Leaderboard
   Reputation Rendering · Admin · Charts Init
   ============================================================ */
'use strict';

// ── PAGE ROUTING ──────────────────────────────────────────────
const navLinks = document.querySelectorAll('.nav-links a[data-page]');

function showPage(id, data = null, push = true) {
  const current = document.querySelector('.page.active');
  if (current && current.id === 'page-' + id && !data) return;

  if (push) {
    let path = '/' + (id === 'home' ? '' : id);
    if (id === 'viewprofile' && data) path = '/profile/' + data;
    if (id === 'resetpassword') path = '/reset-password' + (data ? '?token=' + data : '');
    window.history.pushState({ pageId: id, data }, '', path);
  }

  if (current) {
    current.classList.remove('page-enter');
    current.classList.add('page-exit');
    setTimeout(() => current.classList.remove('active', 'page-exit'), 220);
  }
  setTimeout(() => {
    const next = document.getElementById('page-' + id);
    if (!next) return;
    next.classList.add('active', 'page-enter');
    window.scrollTo({ top: 0, behavior: 'instant' });
    navLinks.forEach(a => a.classList.toggle('active', a.dataset.page === id));
    onPageEnter(id, data);
    observeReveals();
  }, current ? 230 : 0);
}

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.pageId) {
    showPage(e.state.pageId, e.state.data, false);
  } else {
    // Fallback for initial entry or if state is missing
    handleInitialRoute(false);
  }
});

function handleInitialRoute(push = true) {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  if (path === '/' || path === '/home') {
    showPage('home', null, push);
  } else if (path === '/repo') {
    showPage('repo', null, push);
  } else if (path === '/dashboards') {
    showPage('dashboards', null, push);
  } else if (path === '/news') {
    showPage('news', null, push);
  } else if (path === '/contact') {
    showPage('contact', null, push);
  } else if (path === '/profiles') {
    showPage('profiles', null, push);
  } else if (path.startsWith('/profile/')) {
    const uuid = path.split('/').pop();
    showPage('viewprofile', uuid, push);
  } else if (path === '/myprofile') {
    showPage('myprofile', null, push);
  } else if (path === '/leaderboard') {
    showPage('leaderboard', null, push);
  } else if (path === '/mypapers') {
    showPage('mypapers', null, push);
  } else if (path === '/upload') {
    showPage('upload', null, push);
  } else if (path === '/admin') {
    showPage('admin', null, push);
  } else if (path === '/settings') {
    showPage('settings', null, push);
  } else if (path === '/reset-password') {
    const token = params.get('token');
    showPage('resetpassword', token, push);
  } else {
    showPage('home', null, false);
  }
}

async function onPageEnter(id, data) {
  switch (id) {
    case 'home': charts.initHome(); loadFeaturedResearch(); loadHomeNews(); loadHomeStats(); break;
    case 'repo':
      // Apply saved/default repo preferences once per visit when state is still empty
      if (Auth.isLoggedIn() && userSettings) {
        const desiredDomain = userSettings.saved_repo_domain || userSettings.default_research_domain || 'all';
        const desiredQuery = userSettings.saved_repo_query || '';
        const shouldApply = (repoState.domain === 'all' && !repoState.q && repoState.page === 1);
        if (shouldApply) {
          repoState.domain = desiredDomain || 'all';
          repoState.q = desiredQuery || '';
          // sync UI
          const inp = document.getElementById('repo-search');
          if (inp) inp.value = repoState.q;
          document.querySelectorAll('#repo-filter-chips .filter-chip').forEach(ch => {
            ch.classList.toggle('active', (ch.dataset.domain || 'all') === repoState.domain);
          });
        }
      }
      loadResearchRepo();
      break;
    case 'dashboards': charts.initDash(); loadDashboardStats(); break;
    case 'news': loadNewsPage(); break;
    case 'contact': initContactPage(); break;
    case 'profiles': loadProfiles(); break;
    case 'viewprofile': loadViewProfile(data); break;
    case 'myprofile': loadMyProfile(); break;
    case 'leaderboard': loadLeaderboard(); break;
    case 'mypapers': loadMyPapers(); break;
    case 'upload': initUploadPage(); break;
    case 'admin': loadAdminDashboard(); break;
    case 'settings': loadSettingsPage(); break;
    case 'resetpassword':
      setTimeout(() => {
        const f = document.getElementById('reset-password-form');
        if (f && f.token) f.token.value = data || '';
      }, 50);
      break;
  }
}

// ── USER SETTINGS (client cache) ───────────────────────────────
let userSettings = null;
async function loadUserSettings() {
  if (!Auth.isLoggedIn()) { userSettings = null; return null; }
  try {
    userSettings = await API.getMySettings();
    applyUiSettings(userSettings);
    return userSettings;
  } catch { userSettings = null; return null; }
}

function applyUiSettings(s) {
  const root = document.documentElement;
  const body = document.body;

  // Always force light theme (remove data-theme attribute)
  root.removeAttribute('data-theme');

  if (!s) {
    body.removeAttribute('data-density');
    body.classList.remove('reduced-motion');
    root.style.fontSize = '';
    return;
  }

  body.setAttribute('data-density', s.ui_density || 'comfortable');
  body.classList.toggle('reduced-motion', !!s.ui_reduced_motion);

  const scale = s.font_scale || 'md';
  const map = { sm: '15px', md: '16px', lg: '17px', xl: '18px' };
  root.style.fontSize = map[scale] || '16px';
}

// OS theme changes listener removed as app is now light-mode only.

window.__dvApplyUiSettings = applyUiSettings;
window.__dvSetUserSettings = (s) => { userSettings = s; applyUiSettings(userSettings); };

navLinks.forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const page = a.dataset.page;
    if (page === 'upload' && !Auth.isLoggedIn()) { openModal('modal-login'); return; }
    if (page === 'admin' && !Auth.isAdmin()) { Toast.show('Admin access required.', 'error'); return; }
    if (page) showPage(page);
    mobileMenu.close();
  });
});

// Nav dropdown quick filters (Research / News) + active trail
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-go]');
  if (!btn || btn.classList.contains('nav-logo')) return; // Logo handled separately

  const page = btn.dataset.go;
  if (!page) return;

  // Research domain shortcut
  if (btn.dataset.repoDomain) {
    const domain = btn.dataset.repoDomain;
    showPage('repo');
    setTimeout(() => {
      loadResearchRepo({ domain, page: 1 });
      if (Auth.isLoggedIn()) {
        saveRepoPrefs({ saved_repo_domain: domain === 'all' ? null : domain });
      }
      updateNavDropdownState();
    }, 180);
    return;
  }

  // News category shortcut
  if (btn.dataset.newsCategory || btn.dataset.newsLatest) {
    if (btn.dataset.newsCategory) {
      newsState.page = 1;
      newsState.category = btn.dataset.newsCategory;
    } else {
      newsState.page = 1;
      newsState.category = null;
    }
    showPage('news');
    setTimeout(() => {
      loadNewsPage();
      updateNavDropdownState();
    }, 180);
    return;
  }

  // Default navigation
  showPage(page);
});

function updateNavDropdownState() {
  // Research active domain
  document.querySelectorAll('.nav-dd-link[data-repo-domain]').forEach(btn => {
    const dom = btn.dataset.repoDomain || 'all';
    btn.classList.toggle('active', dom === (repoState.domain || 'all'));
  });
  // News active category
  document.querySelectorAll('.nav-dd-link[data-news-category]').forEach(btn => {
    const cat = btn.dataset.newsCategory || '';
    btn.classList.toggle('active', !!newsState.category && cat === newsState.category);
  });
}

document.addEventListener('click', (e) => {
  const logo = e.target.closest('.nav-logo');
  if (logo && logo.dataset.go === 'home') {
    showPage('home');
  }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-news-clear-filter]')) {
    newsState.category = null;
    newsState.page = 1;
    loadNewsPage();
    updateNavDropdownState();
  }
});

// Mobile menu
const mobileMenu = {
  toggle: document.querySelector('.nav-mobile-toggle'),
  list: document.querySelector('.nav-links'),
  close() { this.list?.classList.remove('mobile-open'); this.toggle?.classList.remove('open'); },
  init() {
    this.toggle?.addEventListener('click', () => {
      const open = this.list.classList.contains('mobile-open');
      open ? this.close() : (this.list.classList.add('mobile-open'), this.toggle.classList.add('open'));
    });
  }
};
mobileMenu.init();

// ── USER DROPDOWN (nav) ────────────────────────────────────────
function toggleUserDropdown() {
  const dd = document.getElementById('nav-user-dropdown');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
}

function closeUserDropdown() {
  const dd = document.getElementById('nav-user-dropdown');
  if (dd) dd.style.display = 'none';
}

// Data-attribute wiring (no inline JS)
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-toggle-user-dropdown]');
  if (trigger) {
    e.preventDefault();
    e.stopPropagation();
    toggleUserDropdown();
    return;
  }

  const close = e.target.closest('[data-close-user-dropdown]');
  if (close) {
    closeUserDropdown();
  }

  const go = e.target.closest('[data-go]');
  if (go) {
    e.preventDefault();
    const page = go.dataset.go;
    if (page) showPage(page);
    closeUserDropdown();
    mobileMenu.close();
    return;
  }

  const logout = e.target.closest('[data-logout]');
  if (logout) {
    e.preventDefault();
    closeUserDropdown();
    Auth.logout();
  }
});

// Keyboard support for trigger
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const trigger = document.activeElement?.closest?.('[data-toggle-user-dropdown]');
  if (!trigger) return;
  e.preventDefault();
  toggleUserDropdown();
});

document.addEventListener('click', (e) => {
  const dd = document.getElementById('nav-user-dropdown');
  const trigger = document.getElementById('nav-user-trigger');
  if (!dd || dd.style.display === 'none') return;
  if (dd.contains(e.target) || trigger?.contains(e.target)) return;
  dd.style.display = 'none';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUserDropdown();
});

// Nav scroll + scroll-to-top
const nav = document.querySelector('nav');
const scrollTopBtn = document.querySelector('.scroll-top');
window.addEventListener('scroll', () => {
  nav?.classList.toggle('scrolled', window.scrollY > 20);
  scrollTopBtn?.classList.toggle('visible', window.scrollY > 400);
}, { passive: true });
scrollTopBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// Scroll reveal
function observeReveals() {
  const els = document.querySelectorAll('.reveal:not(.visible),.reveal-left:not(.visible),.reveal-right:not(.visible),.reveal-scale:not(.visible)');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => obs.observe(el));
}

// Ripple
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn-primary,.btn-ghost');
  if (!btn) return;
  const r = document.createElement('span'); r.className = 'btn-ripple';
  const rect = btn.getBoundingClientRect();
  r.style.left = (e.clientX - rect.left) + 'px';
  r.style.top = (e.clientY - rect.top) + 'px';
  btn.appendChild(r); r.addEventListener('animationend', () => r.remove());
});

// Filter chips
document.addEventListener('click', e => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  const group = chip.closest('.filter-chips');
  if (!group) return;
  group.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
});

// ── HELPERS ───────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, m => map[m]);
}
function initials(name) {
  return (escapeHtml(name) || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function relDate(s) {
  const d = new Date(s), now = new Date(), diff = Math.floor((now - d) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return diff + ' days ago';
  if (diff < 365) return Math.floor(diff / 30) + ' mo ago';
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
function fmtDate(s) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

const DCOLS = {
  'Machine Learning': 'linear-gradient(135deg,#0600c0,#0901FA)',
  'Statistics': 'linear-gradient(135deg,#0600c0,#7c3aed)',
  'NLP': 'linear-gradient(135deg,#1a2040,#0901FA)',
  'Computer Vision': 'linear-gradient(135deg,#0901FA,#3d35fb)',
  'Graph ML': 'linear-gradient(135deg,#0901FA,#00d4ff)',
  'Bioinformatics': 'linear-gradient(135deg,#065f46,#0901FA)',
  'Robotics': 'linear-gradient(135deg,#7c3aed,#0901FA)',
  'Time Series': 'linear-gradient(135deg,#7c3aed,#3d35fb)',
};
function dcol(d) { return DCOLS[d] || 'linear-gradient(135deg,#0901FA,#3d35fb)'; }

const TIER_COLORS = { bronze: '#92400e', silver: '#475569', gold: '#a16207', platinum: '#5b21b6' };
const TIER_BG = { bronze: '#fef3c7', silver: '#f1f5f9', gold: '#fef9c3', platinum: '#ede9fe' };

function animateNumber(el, target) {
  if (!el) return;
  const start = performance.now(), dur = 1200;
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(p * target).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function levelLabel(level) {
  const labels = ['Newcomer', 'Junior Researcher', 'Researcher', 'Senior Researcher', 'Lead Researcher', 'Principal Investigator', 'Distinguished Scholar', 'Research Fellow', 'Eminent Professor', 'Research Legend'];
  return labels[Math.min(level - 1, labels.length - 1)];
}

function xpForNextLevel(xp) {
  const LEVELS = [0, 200, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000];
  const level = LEVELS.findIndex((v, i) => xp < (LEVELS[i + 1] ?? Infinity));
  const curr = LEVELS[level] ?? 0;
  const next = LEVELS[level + 1] ?? null;
  if (!next) return { percent: 100, remaining: 0 };
  return {
    percent: Math.floor(((xp - curr) / (next - curr)) * 100),
    remaining: next - xp,
    nextLevel: level + 2
  };
}

// ── RESEARCH CARD ─────────────────────────────────────────────
function buildCard(p) {
  const tags = (p.keywords || p.domain || '').split(',').slice(0, 3);
  const canEndorse = Auth.isLoggedIn() && p.author_uuid !== Auth.user?.uuid;
  const title = escapeHtml(p.title);
  const abstract = escapeHtml(p.abstract);
  const domain = escapeHtml(p.domain);
  const authorName = escapeHtml(p.author_name);

  return `
  <div class="research-card reveal" onclick="openPaperDetail('${p.uuid}')">
    <div class="card-img" style="background:${dcol(p.domain)}">
      <svg width="180" height="120" viewBox="0 0 180 120" opacity="0.3"><circle cx="90" cy="60" r="40" fill="none" stroke="white" stroke-width="1.5"/><circle cx="90" cy="60" r="20" fill="none" stroke="white" stroke-width="1"/><circle cx="90" cy="60" r="8" fill="white"/></svg>
      <div class="card-tag">${domain || 'Research'}</div>
      ${p.ai_processing_status === 'completed' ? `<div class="ai-badge-card" title="AI-Enriched Insights available"><span class="iconify" data-icon="mdi:robot"></span> AI</div>` : ''}
    </div>
    <div class="card-body">
      <div class="card-meta">
        <div class="card-author-avatar" style="background:${dcol(p.domain)};cursor:pointer" onclick="event.stopPropagation(); viewResearcherProfile('${p.author_uuid}')">
          ${p.author_avatar ? `<img src="${p.author_avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>` : initials(p.author_name)}
        </div>
        <div class="card-author" style="cursor:pointer" onclick="event.stopPropagation(); viewResearcherProfile('${p.author_uuid}')">${authorName || 'Unknown'}</div>
        <div class="card-date">${relDate(p.created_at)}</div>
      </div>
      <div class="card-title">${title}</div>
      <div class="card-excerpt">${abstract}</div>
      <div class="card-footer">
        <div class="card-tags">${tags.map(t => `<span class="tag-chip">${escapeHtml(t.trim())}</span>`).join('')}</div>
        <div style="display:flex;align-items:center;gap:6px">
          ${canEndorse ? `<button class="card-action" title="Endorse this paper" onclick="endorsePaper('${p.uuid}',this,event)" style="font-size:0.75rem;width:auto;padding:0 10px;gap:6px"><span class="iconify" data-icon="mdi:handshake-outline"></span> ${p.endorsements || 0}</button>` : `<span style="font-size:0.75rem;color:var(--gray-400);padding:0 6px;display:inline-flex;align-items:center;gap:6px"><span class="iconify" data-icon="mdi:handshake-outline"></span> ${p.endorsements || 0}</span>`}
          <button class="card-action" onclick="event.stopPropagation(); openPaperDetail('${p.uuid}')">→</button>
        </div>
      </div>
    </div>
  </div>`;
}

window.endorsePaper = async function (uuid, btn, e) {
  e?.stopPropagation?.();
  if (!Auth.isLoggedIn()) { openModal('modal-login'); return; }
  btn.disabled = true;
  const r = await API.endorsePaper(uuid);
  if (r.ok) {
    btn.innerHTML = `<span class="iconify" data-icon="mdi:handshake-outline"></span> ${r.total}`;
    Toast.show('+10 rep awarded to the author!');
  } else {
    Toast.show(r.error || 'Already endorsed.', 'info');
  }
  btn.disabled = false;
};

window.viewResearcherProfile = function (uuid) {
  showPage('viewprofile', uuid);
};

// ── PAPER DETAIL MODAL ─────────────────────────────────────────
window.openPaperDetail = async function (uuid) {
  const box = document.getElementById('paper-detail-body');
  if (!box) return;
  openModal('modal-paper-detail');
  box.innerHTML = '<div class="loading-placeholder" style="padding:36px">Loading paper…</div>';
  try {
    const p = await API.getPaper(uuid);
    if (!p) { box.innerHTML = '<p style="padding:24px;color:var(--gray-400)">Paper not found.</p>'; return; }
    box.innerHTML = renderPaperDetail(p);
  } catch (e) {
    box.innerHTML = `<p style="padding:24px;color:var(--gray-400)">Error loading paper: ${e.message}</p>`;
  }
};

function citationAPA(p) {
  const year = p.created_at ? new Date(p.created_at).getFullYear() : new Date().getFullYear();
  const authors = [p.author_name].concat((p.co_authors || '').split(',').map(s => s.trim()).filter(Boolean));
  const authorStr = authors.filter(Boolean).join(', ') || 'Unknown';
  return `${authorStr} (${year}). ${p.title}. Data Voyage Research Repository.`;
}

function renderPaperDetail(p) {
  const authors = [p.author_name].concat((p.co_authors || '').split(',').map(s => s.trim()).filter(Boolean));
  const cite = citationAPA(p);
  const supports = (p.files || []);
  const dlUrl = `/api/research/${p.uuid}/download`;
  const viewUrl = `/api/research/${p.uuid}/view`;
  const canEndorse = Auth.isLoggedIn() && p.author_uuid !== Auth.user?.uuid;

  return `
    <div class="paper-view-container">
      <!-- HEADER: Academic Focus -->
      <div class="paper-view-header">
        <div class="paper-view-type">${escapeHtml(p.domain).toUpperCase()} RESEARCH PAPER</div>
        <h1 class="paper-view-title">${escapeHtml(p.title)}</h1>
        <div class="paper-view-authors">
          ${authors.map((a, i) => `
            <span class="paper-view-author ${i === 0 ? 'is-lead' : ''}" ${i === 0 ? `onclick="viewResearcherProfile('${p.author_uuid}')"` : ''}>
              ${escapeHtml(a)}${i < authors.length - 1 ? ',' : ''}
            </span>
          `).join(' ')}
        </div>
        <div class="paper-view-meta">
          <span><span class="iconify" data-icon="mdi:calendar"></span> ${fmtDate(p.created_at)}</span>
          <span><span class="iconify" data-icon="mdi:eye"></span> ${(p.views || 0).toLocaleString()} Views</span>
          <span><span class="iconify" data-icon="mdi:download"></span> ${(p.downloads || 0).toLocaleString()} Downloads</span>
          <span><span class="iconify" data-icon="mdi:handshake"></span> ${p.endorsements || 0} Endorsements</span>
        </div>
        <div class="paper-view-actions">
          <a class="btn-primary pv-btn" href="${viewUrl}" target="_blank">
            <span class="iconify" data-icon="mdi:file-pdf-box"></span> View Full Text
          </a>
          <a class="btn-ghost pv-btn" href="${dlUrl}">
            <span class="iconify" data-icon="mdi:download"></span> Download PDF
          </a>
          ${canEndorse ? `
            <button class="btn-ghost pv-btn" onclick="endorsePaper('${p.uuid}',this,event)">
              <span class="iconify" data-icon="mdi:star-outline"></span> Endorse Paper
            </button>
          ` : ''}
        </div>
      </div>

      <div class="paper-view-layout">
        <div class="paper-view-main">
          <div class="paper-section">
            <h3 class="paper-section-title">Abstract</h3>
            <p class="paper-abstract-text">${escapeHtml(p.abstract || '').replace(/\n/g, '<br/>')}</p>
          </div>

          ${supports.length ? `
            <div class="paper-section">
              <h3 class="paper-section-title">Supporting Assets & Source Code</h3>
              <div class="paper-files-explorer">
                ${supports.map(f => {
    const ext = (f.file_name || '').split('.').pop().toLowerCase();
    const isCode = ['js', 'py', 'json', 'txt', 'md', 'csv', 'html', 'css', 'c', 'cpp', 'go', 'rs'].includes(ext);
    return `
                  <div class="explorer-file-row">
                    <div class="file-info">
                      <span class="iconify" data-icon="${isCode ? 'mdi:file-code' : 'mdi:file-document'}"></span>
                      <span class="file-name">${escapeHtml(f.file_name)}</span>
                    </div>
                    <div class="file-actions">
                      ${isCode ? `<button class="btn-explorer" onclick="openCodeViewer('${p.uuid}','${f.id}','${f.file_name}')"><span class="iconify" data-icon="mdi:code-tags"></span> Inspect</button>` : ''}
                      <a class="btn-explorer" href="/api/research/${p.uuid}/files/${f.id}/download"><span class="iconify" data-icon="mdi:download-outline"></span> Download</a>
                    </div>
                  </div>
                `;
  }).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <div class="paper-view-sidebar">
          ${p.ai_summary ? `
            <div class="sidebar-box ai-insight-box">
              <h4 class="sidebar-title ai-title">
                <span class="iconify" data-icon="mdi:robot-outline"></span> AI Insights
              </h4>
              <p class="ai-summary-text italic">
                ${escapeHtml(p.ai_summary)}
              </p>
              ${p.ai_tags ? `
                <div class="ai-tags-wrap">
                  ${p.ai_tags.split(',').map(t => `<span class="ai-tag">${escapeHtml(t.trim())}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="sidebar-box">
            <h4 class="sidebar-title">Citation Info</h4>
            <div class="sidebar-cite-box">
              <p id="paper-cite-text" class="cite-text">${escapeHtml(cite)}</p>
              <button class="btn-ghost btn-xs" style="width:100%" onclick="copyCitation()">Copy APA Citation</button>
            </div>
          </div>

          <div class="sidebar-box">
            <h4 class="sidebar-title">Corresponding Author</h4>
            <div class="sidebar-author-card" onclick="viewResearcherProfile('${p.author_uuid}')">
              <div class="s-avatar">
                ${p.author_avatar ? `<img src="${p.author_avatar}" class="s-avatar-img"/>` : initials(p.author_name)}
              </div>
              <div class="s-info">
                <div class="s-name">${escapeHtml(p.author_name)}</div>
                <div class="s-dept">${escapeHtml(p.department || 'Researcher')}</div>
              </div>
            </div>
          </div>

          ${p.related_papers?.length ? `
            <div class="sidebar-box">
              <h4 class="sidebar-title">Related Research</h4>
              ${p.related_papers.map(rp => `
                <div class="related-item" onclick="openPaperDetail('${rp.uuid}')">
                  <div class="related-domain">${rp.domain}</div>
                  <div class="related-title">${escapeHtml(rp.title)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

window.openCodeViewer = async function (paperUuid, fileId, fileName) {
  const contentEl = document.getElementById('code-viewer-content');
  const nameEl = document.getElementById('code-viewer-filename');
  const dlEl = document.getElementById('code-viewer-download');
  if (!contentEl) return;

  nameEl.textContent = fileName;
  dlEl.href = `/api/research/${paperUuid}/files/${fileId}/download`;
  contentEl.textContent = 'Preparing secure environment...';
  openModal('modal-code-viewer');

  try {
    const data = await API.getFileContent(paperUuid, fileId);
    if (data.error) contentEl.textContent = 'Error: ' + data.error;
    else contentEl.textContent = data.content || '/* Source file is empty */';
  } catch (e) {
    contentEl.textContent = 'Request failed: ' + e.message;
  }
};

window.viewResearcherProfile = function (uuid) {
  closeModal('modal-paper-detail');
  showPage('viewprofile', uuid);
};

window.copyCitation = async function () {
  const t = document.getElementById('paper-cite-text')?.textContent?.trim();
  if (!t) return;
  try { await navigator.clipboard.writeText(t); Toast.show('Citation copied.'); }
  catch { Toast.show('Could not copy.', 'error'); }
};

// ── HOME ──────────────────────────────────────────────────────
async function loadHomeStats() {
  try {
    const s = await API.getPublicStats();
    [
      ['stat-papers', s.approvedPapers || 0],
      ['stat-researchers', s.totalResearchers || 0],
      ['stat-views', s.totalViews || 0],
      ['stat-domains', s.domains || 0],
      ['stat-badges', s.badgesAwarded || 0],
    ].forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) animateNumber(el, val);
    });
  } catch { }
}

async function loadFeaturedResearch() {
  const c = document.getElementById('featured-research-grid'); if (!c) return;
  try {
    const d = await API.getPapers({ page: 1 });
    const papers = (d.papers || []).slice(0, 3);
    c.innerHTML = papers.length
      ? papers.map(buildCard).join('')
      : '<p style="color:var(--gray-400);text-align:center;padding:40px;grid-column:1/-1">No published research yet. Be the first to upload!</p>';
    observeReveals();
  } catch { c.innerHTML = '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center">Could not load research.</p>'; }
}

async function loadDashboardStats() {
  try {
    const s = await API.getPublicStats();
    [
      ['dash-total-papers', s.approvedPapers || 0],
      ['dash-total-researchers', s.totalResearchers || 0],
      ['dash-domains', s.domains || 0],
      ['dash-endorsed', s.endorsements || 0],
      ['dash-views', s.totalViews || 0],
      ['dash-badges', s.badgesAwarded || 0],
    ].forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) animateNumber(el, val);
    });
  } catch { }
}

async function loadHomeNews() {
  const c = document.getElementById('home-news-grid'); if (!c) return;
  try {
    const d = await API.getNews({ page: 1, limit: 3 });
    const items = d.items || [];
    c.innerHTML = items.map((n, i) => `
      <div class="news-card reveal delay-${i + 1}" onclick="openNewsDetail('${n.uuid}')" style="cursor:pointer">
        <div class="news-img" style="height:${i === 0 ? '240px' : '160px'}">
          <svg viewBox="0 0 400 200" opacity="0.2" style="position:absolute;inset:0;width:100%;height:100%"><path d="M0 100 Q100 50 200 100 T400 100" fill="none" stroke="white" stroke-width="3"/></svg>
        </div>
        <div class="news-body">
          <div class="news-category">${escapeHtml(n.category)}</div>
          <div class="news-title">${escapeHtml(n.title)}</div>
          <div class="news-excerpt">${escapeHtml(n.summary)}</div>
          <div class="news-date">${fmtDate(n.created_at)}</div>
        </div>
      </div>`).join('') || '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center">No news yet.</p>';
    observeReveals();
  } catch { }
}

// ── RESEARCH REPO ─────────────────────────────────────────────
let repoState = { domain: 'all', q: '', page: 1, sort: 'newest', year: '', has_file: '0', min_endorsements: 0 };
let _repoYearsPopulated = false;

async function loadResearchRepo(opts = {}) {
  Object.assign(repoState, opts);
  const c = document.getElementById('repo-grid'); if (!c) return;

  // ── Sync UI controls to state ─────────────────────────
  const inp = document.getElementById('repo-search');
  if (inp) inp.value = repoState.q || '';
  document.getElementById('repo-search-clear').style.display = repoState.q ? 'block' : 'none';

  document.querySelectorAll('#repo-filter-chips .filter-chip').forEach(chip =>
    chip.classList.toggle('active', (chip.dataset.domain || 'all') === repoState.domain)
  );
  // Sync sort buttons (both sidebar row style and old pill style)
  document.querySelectorAll('.sort-btn, .sort-btn-row').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.sort === repoState.sort)
  );
  const yearEl = document.getElementById('filter-year');
  if (yearEl) yearEl.value = repoState.year || '';
  const endorseEl = document.getElementById('filter-endorsements');
  const endorseValEl = document.getElementById('filter-endorsements-val');
  if (endorseEl) { endorseEl.value = repoState.min_endorsements || 0; }
  if (endorseValEl) endorseValEl.textContent = repoState.min_endorsements > 0 ? repoState.min_endorsements + '+' : 'Any';
  const hasFileEl = document.getElementById('filter-has-file');
  if (hasFileEl) hasFileEl.checked = repoState.has_file === '1';

  // ── Count active filters & show reset button ───────────
  let activeFilters = 0;
  if (repoState.domain && repoState.domain !== 'all') activeFilters++;
  if (repoState.year) activeFilters++;
  if (repoState.has_file === '1') activeFilters++;
  if (repoState.min_endorsements > 0) activeFilters++;
  if (repoState.sort && repoState.sort !== 'newest') activeFilters++;
  const resetBtn = document.getElementById('sidebar-reset-btn');
  if (resetBtn) resetBtn.style.display = activeFilters > 0 ? 'block' : 'none';

  // ── Fetch & render ────────────────────────────────────
  c.innerHTML = '<div class="loading-placeholder" style="grid-column:1/-1">Loading papers…</div>';
  try {
    const d = await API.getPapers(repoState);

    // Populate year dropdown on first load
    if (!_repoYearsPopulated && d.yearRange?.min_year && yearEl) {
      _repoYearsPopulated = true;
      const minY = Number(d.yearRange.min_year), maxY = Number(d.yearRange.max_year);
      for (let y = maxY; y >= minY; y--) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        yearEl.appendChild(opt);
      }
      if (repoState.year) yearEl.value = repoState.year;
    }

    // Results counter
    const countEl = document.getElementById('repo-results-count');
    if (countEl) countEl.textContent = d.total > 0 ? `${d.total.toLocaleString()} paper${d.total !== 1 ? 's' : ''}` : '';

    c.innerHTML = (d.papers || []).length
      ? d.papers.map(buildCard).join('')
      : `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gray-400)">
           <div style="font-size:2.5rem;margin-bottom:14px"><span class="iconify" data-icon="mdi:file-search-outline"></span></div>
           <div style="font-weight:700;font-size:1.1rem;margin-bottom:6px">No papers found</div>
           <div style="font-size:0.875rem">Try adjusting your filters or search query</div>
           <button class="btn-ghost btn-sm" style="margin-top:18px" onclick="resetRepoFilters()">Clear all filters</button>
         </div>`;

    // Pagination
    const pg = document.getElementById('repo-pagination');
    if (pg) {
      pg.innerHTML = '';
      if (d.pages > 1) {
        const prev = document.createElement('button');
        prev.className = 'page-btn'; prev.textContent = '←'; prev.disabled = repoState.page <= 1;
        prev.onclick = () => loadResearchRepo({ page: repoState.page - 1 });
        pg.appendChild(prev);

        const maxVisible = 7;
        const startPg = Math.max(1, repoState.page - 3);
        const endPg = Math.min(d.pages, startPg + maxVisible - 1);
        for (let i = startPg; i <= endPg; i++) {
          const b = document.createElement('button');
          b.className = 'page-btn' + (i === d.page ? ' active' : '');
          b.textContent = i;
          b.onclick = () => loadResearchRepo({ page: i });
          pg.appendChild(b);
        }

        const next = document.createElement('button');
        next.className = 'page-btn'; next.textContent = '→'; next.disabled = repoState.page >= d.pages;
        next.onclick = () => loadResearchRepo({ page: repoState.page + 1 });
        pg.appendChild(next);
      }
    }
    observeReveals();
  } catch { c.innerHTML = '<p style="color:var(--gray-400);padding:40px;grid-column:1/-1;text-align:center">Error loading papers.</p>'; }
}

window.toggleRepoFilters = function () {
  // No-op now — sidebar is always visible
};

window.resetRepoFilters = function () {
  repoState = { domain: 'all', q: '', page: 1, sort: 'newest', year: '', has_file: '0', min_endorsements: 0 };
  loadResearchRepo({});
};

window.clearRepoSearch = function () {
  loadResearchRepo({ q: '', page: 1 });
};

// ── Event wiring ──────────────────────────────────────
document.getElementById('repo-search')?.addEventListener('input', debounce(e => {
  loadResearchRepo({ q: e.target.value.trim(), page: 1 });
  if (Auth.isLoggedIn()) saveRepoPrefs({ saved_repo_query: e.target.value.trim() });
}, 400));

document.querySelectorAll('#repo-filter-chips .filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const domain = chip.dataset.domain || 'all';
    loadResearchRepo({ domain, page: 1 });
    if (Auth.isLoggedIn()) saveRepoPrefs({ saved_repo_domain: domain === 'all' ? null : domain });
  });
});

document.querySelectorAll('.sort-btn, .sort-btn-row').forEach(btn => {
  btn.addEventListener('click', () => loadResearchRepo({ sort: btn.dataset.sort, page: 1 }));
});

document.getElementById('filter-year')?.addEventListener('change', e =>
  loadResearchRepo({ year: e.target.value, page: 1 })
);

document.getElementById('filter-endorsements')?.addEventListener('input', e => {
  const v = Number(e.target.value);
  document.getElementById('filter-endorsements-val').textContent = v > 0 ? v + '+' : 'Any';
});
document.getElementById('filter-endorsements')?.addEventListener('change', e =>
  loadResearchRepo({ min_endorsements: Number(e.target.value), page: 1 })
);

document.getElementById('filter-has-file')?.addEventListener('change', e =>
  loadResearchRepo({ has_file: e.target.checked ? '1' : '0', page: 1 })
);

const saveRepoPrefs = debounce(async (patch) => {
  try { await API.updateMySettings(patch); } catch { }
}, 700);

// ── NEWS ──────────────────────────────────────────────────────
let newsState = { page: 1, limit: 7, category: null };
async function loadNewsPage() {
  const feat = document.getElementById('news-featured-area');
  const list = document.getElementById('news-page-list');
  const bar = document.getElementById('news-filters-bar');
  try {
    const d = await API.getNews(newsState);
    const items = d.items || [];
    if (!items.length) {
      if (list) list.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:40px;grid-column:1/-1">No news articles yet.</p>';
      if (bar) bar.innerHTML = '';
      return;
    }
    // Filter chip
    if (bar) {
      if (newsState.category) {
        const label = newsState.category;
        bar.innerHTML = `
          <div class="filter-chip-active">
            <span>Filtered by: ${label}</span>
            <button type="button" class="filter-chip-clear" data-news-clear-filter>Clear</button>
          </div>`;
      } else {
        bar.innerHTML = '';
      }
    }
    const f = items[0];
    if (feat) feat.innerHTML = `
      <div class="featured-article reveal" onclick="openNewsDetail('${f.uuid}')">
        <div class="featured-img"><svg viewBox="0 0 500 400" style="position:absolute;inset:0;width:100%;height:100%;opacity:0.18"><path d="M0 200 Q125 100 250 200 T500 200" fill="none" stroke="white" stroke-width="3"/><circle cx="250" cy="200" r="60" fill="none" stroke="white" stroke-width="2"/></svg></div>
        <div class="featured-content">
          <div class="featured-badge">${escapeHtml(f.category)}</div>
          <div class="featured-title">${escapeHtml(f.title)}</div>
          <div class="featured-excerpt">${escapeHtml(f.summary)}</div>
          <div class="featured-byline">By ${escapeHtml(f.author_name)} · ${fmtDate(f.created_at)}</div>
        </div>
      </div>`;
    if (list) list.innerHTML = items.slice(1).map((n, i) => `
      <div class="news-card reveal delay-${(i % 3) + 1}" onclick="openNewsDetail('${n.uuid}')">
        <div class="news-img"><svg viewBox="0 0 300 160" opacity="0.2" style="position:absolute;inset:0;width:100%;height:100%"><circle cx="150" cy="80" r="50" fill="none" stroke="white" stroke-width="2"/></svg></div>
        <div class="news-body">
          <div class="news-category">${escapeHtml(n.category)}</div>
          <div class="news-title">${escapeHtml(n.title)}</div>
          <div class="news-excerpt">${escapeHtml(n.summary)}</div>
          <div class="news-date">${fmtDate(n.created_at)}</div>
        </div>
      </div>`).join('');

    // Pagination
    const pg = document.getElementById('news-pagination');
    if (pg) {
      pg.innerHTML = '';
      if ((d.pages || 1) > 1) {
        const prev = document.createElement('button');
        prev.className = 'page-btn';
        prev.textContent = '←';
        prev.disabled = (d.page || 1) <= 1;
        prev.onclick = () => { newsState.page = Math.max(1, newsState.page - 1); loadNewsPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
        pg.appendChild(prev);

        for (let i = 1; i <= d.pages; i++) {
          const b = document.createElement('button');
          b.className = 'page-btn' + (i === d.page ? ' active' : '');
          b.textContent = i;
          b.onclick = () => { newsState.page = i; loadNewsPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
          pg.appendChild(b);
        }

        const next = document.createElement('button');
        next.className = 'page-btn';
        next.textContent = '→';
        next.disabled = (d.page || 1) >= (d.pages || 1);
        next.onclick = () => { newsState.page = Math.min(d.pages, newsState.page + 1); loadNewsPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
        pg.appendChild(next);
      }
    }
    observeReveals();
  } catch { }
}

// ── NEWS DETAIL MODAL ──────────────────────────────────────────
window.openNewsDetail = async function (uuid) {
  const box = document.getElementById('news-detail-body');
  if (!box) return;
  openModal('modal-news-detail');
  box.innerHTML = '<div class="loading-placeholder" style="padding:36px">Loading article…</div>';
  try {
    const n = await API.getNewsItem(uuid);
    if (!n) { box.innerHTML = '<p style="padding:24px;color:var(--gray-400)">Article not found.</p>'; return; }
    box.innerHTML = `
      <div class="news-detail-head">
        <div class="news-detail-cat">${escapeHtml(n.category) || 'News'}</div>
        <div class="news-detail-title">${escapeHtml(n.title)}</div>
        <div class="news-detail-meta">By ${escapeHtml(n.author_name) || 'Data Voyage'} · ${fmtDate(n.created_at)}</div>
      </div>
      <div class="news-detail-body">
        ${escapeHtml(n.body || n.summary || '').replace(/\n/g, '<br/>')}
      </div>`;
  } catch (e) {
    box.innerHTML = `<p style="padding:24px;color:var(--gray-400)">Error: ${e.message}</p>`;
  }
};

// ── RESEARCHERS DIRECTORY ─────────────────────────────────────
let profileState = { search: '', department: 'all', domain: 'all' };

async function loadProfiles() {
  const g = document.getElementById('profiles-grid'); if (!g) return;
  g.innerHTML = '<div class="loading-placeholder" style="grid-column:1/-1">Loading researchers…</div>';
  try {
    const users = await API.getResearchers(profileState);
    g.innerHTML = users.length
      ? users.map((u, i) => `
        <div class="profile-card reveal delay-${(i % 6) + 1}" onclick="viewResearcherProfile('${u.uuid}')" style="cursor:pointer">
          <div class="profile-avatar" style="background:${dcol(u.department || '')}">
            ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>` : initials(u.name)}
          </div>
          <div class="profile-name">${escapeHtml(u.name)}</div>
          <div class="profile-role">${u.role === 'admin' ? 'Administrator' : 'Researcher'} · ${escapeHtml(u.department) || 'Data Science'}</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:10px">
            <span style="background:rgba(9,1,250,0.08);color:var(--primary);border-radius:20px;padding:3px 10px;font-size:0.72rem;font-weight:700">Lv.${u.level || 1}</span>
            <span style="font-size:0.78rem;color:var(--gray-400)">${levelLabel(u.level || 1)}</span>
          </div>
          <div class="profile-bio">${escapeHtml(u.bio) || 'University data science researcher.'}</div>
          <div class="profile-stats">
            <div class="pstat"><div class="pstat-val">${u.paper_count || 0}</div><div class="pstat-lbl">Papers</div></div>
            <div class="pstat"><div class="pstat-val">${(u.reputation || 0).toLocaleString()}</div><div class="pstat-lbl">Rep</div></div>
            <div class="pstat"><div class="pstat-val">${u.badge_count || 0}</div><div class="pstat-lbl">Badges</div></div>
          </div>
        </div>`).join('')
      : '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:40px">No researchers registered yet.</p>';
    observeReveals();
  } catch { g.innerHTML = '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center">Error loading researchers.</p>'; }
}
window.loadProfiles = loadProfiles;

// Wire researcher filters once
document.getElementById('profiles-search')?.addEventListener('input', debounce(e => {
  profileState.search = e.target.value.trim();
  loadProfiles();
}, 300));
document.getElementById('profiles-dept')?.addEventListener('change', e => {
  profileState.department = e.target.value || 'all';
  loadProfiles();
});
document.getElementById('profiles-domain')?.addEventListener('change', e => {
  profileState.domain = e.target.value || 'all';
  loadProfiles();
});

// ── VIEW A RESEARCHER PROFILE ─────────────────────────────────
async function loadViewProfile(uuid) {
  const c = document.getElementById('viewprofile-content'); if (!c) return;
  if (!uuid) { c.innerHTML = '<p style="padding:40px;color:var(--gray-400)">No profile selected.</p>'; return; }
  c.innerHTML = '<div class="loading-placeholder" style="padding:80px">Loading profile…</div>';
  try {
    const [u, rep] = await Promise.all([API.getUser(uuid), API.getUserRepStats(uuid)]);
    if (!u) { c.innerHTML = '<p style="padding:40px;color:var(--gray-400)">Researcher not found.</p>'; return; }
    const xp = xpForNextLevel(u.xp || 0);
    const isOwn = Auth.user?.uuid === uuid;
    c.innerHTML = buildFullProfileHTML(u, rep, xp, isOwn, false);
    // Animate XP bar
    setTimeout(() => {
      const fill = c.querySelector('.xp-bar-fill');
      if (fill) fill.style.width = xp.percent + '%';
    }, 200);
    observeReveals();
  } catch (e) { c.innerHTML = `<p style="padding:40px;color:var(--gray-400)">Error loading profile: ${e.message}</p>`; }
}

// ── MY PROFILE (own) ─────────────────────────────────────────
async function loadMyProfile() {
  if (!Auth.isLoggedIn()) { showPage('home'); return; }
  const c = document.getElementById('myprofile-content'); if (!c) return;
  c.innerHTML = '<div class="loading-placeholder" style="padding:80px">Loading your profile…</div>';
  try {
    if (!userSettings) await loadUserSettings();
    const [u, rep] = await Promise.all([
      API.getUser(Auth.user.uuid),
      API.getMyRepStats()
    ]);
    if (!u) { c.innerHTML = '<p style="padding:40px;color:var(--gray-400)">Profile not found.</p>'; return; }
    const xp = xpForNextLevel(u.xp || 0);
    c.innerHTML = buildFullProfileHTML(u, rep, xp, true, true);
    // Wire avatar input
    const avatarInput = c.querySelector('.avatar-file-input');
    if (avatarInput) avatarInput.addEventListener('change', e => handleAvatarUpload(e.target.files[0]));
    // Wire profile edit form
    const editForm = c.querySelector('#profile-edit-form');
    if (editForm) {
      editForm.pname.value = u.name || '';
      editForm.pdepartment.value = u.department || '';
      editForm.pbio.value = u.bio || '';
      if (editForm.pwebsite) editForm.pwebsite.value = u.website || '';
      if (editForm.ptwitter) editForm.ptwitter.value = u.twitter || '';
    }

    const settingsForm = c.querySelector('#settings-form');
    if (settingsForm && userSettings) {
      settingsForm.notify_paper_status.checked = !!userSettings.notify_paper_status;
      settingsForm.notify_platform.checked = !!userSettings.notify_platform;
      settingsForm.default_research_domain.value = userSettings.default_research_domain || 'all';

      settingsForm.ui_density.value = userSettings.ui_density || 'comfortable';
      settingsForm.ui_reduced_motion.checked = !!userSettings.ui_reduced_motion;
    }
    // Animate XP bar
    setTimeout(() => {
      const fill = c.querySelector('.xp-bar-fill');
      if (fill) fill.style.width = xp.percent + '%';
    }, 200);
    observeReveals();
  } catch (e) { c.innerHTML = `<p style="padding:40px;color:var(--gray-400)">Error: ${e.message}</p>`; }
}

// ── SETTINGS PAGE (separate section) ───────────────────────────
async function loadSettingsPage() {
  if (!Auth.isLoggedIn()) { showPage('home'); openModal('modal-login'); return; }
  const c = document.getElementById('settings-content'); if (!c) return;
  c.innerHTML = '<div class="loading-placeholder">Loading settings…</div>';

  try {
    const [me, settings, sessions] = await Promise.all([
      API._fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
      API.getMySettings(),
      API.getSessions()
    ]);
    if (!me) { c.innerHTML = '<p style="color:var(--gray-400);padding:24px">Could not load account.</p>'; return; }
    if (!settings) { c.innerHTML = '<p style="color:var(--gray-400);padding:24px">Could not load settings.</p>'; return; }

    c.innerHTML = buildSettingsHTML(me, settings, sessions || []);
    wireSettingsUI(me, settings);
  } catch (e) {
    c.innerHTML = `<p style="color:var(--gray-400);padding:24px">Error loading settings: ${e.message}</p>`;
  }
}

function buildSettingsHTML(me, s, sessions) {
  const tabs = [
    ['profile', 'mdi:account-outline', 'Profile'],
    ['security', 'mdi:shield-key-outline', 'Security'],
    ['notifications', 'mdi:bell-outline', 'Notifications'],
    ['privacy', 'mdi:lock-outline', 'Privacy & Data'],
  ];

  const sessionRows = sessions.length ? sessions.map(row => `
    <div style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--gray-100)">
      <div style="color:var(--gray-400);margin-top:2px"><span class="iconify" data-icon="mdi:laptop"></span></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;color:var(--gray-800);font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${row.user_agent || 'Unknown device'}</div>
        <div style="color:var(--gray-400);font-size:0.8rem;margin-top:4px">${row.ip || '—'} · Last seen ${new Date(row.last_seen_at).toLocaleString('en-GB')}</div>
      </div>
      <button class="btn-ghost btn-sm" style="color:var(--gray-600);border-color:var(--gray-200)" onclick="revokeSession('${row.session_id}')">Log out</button>
    </div>
  `).join('') : `<p style="color:var(--gray-400)">No active sessions found.</p>`;

  return `
    <div class="settings-layout">
      <div class="settings-nav">
        ${tabs.map(([id, icon, label], i) => `
          <button class="settings-nav-btn ${i === 0 ? 'active' : ''}" data-settings-tab="${id}">
            <span class="iconify" data-icon="${icon}"></span>${label}
          </button>`).join('')}
      </div>

      <div>
        <div class="settings-panel" data-settings-panel="profile">
          <div class="settings-title"><span class="iconify" data-icon="mdi:account-outline"></span> Profile & Personalization</div>
          <div class="settings-help">Update your profile, contact details, localization, and appearance preferences.</div>

          <form id="settings-profile-form">
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group"><label class="form-label">Full name</label><input class="form-input" name="name" value="${(me.name || '').replace(/\"/g, '&quot;')}" required/></div>
              <div class="form-group"><label class="form-label">Department</label><input class="form-input" name="department" value="${(me.department || '').replace(/\"/g, '&quot;')}" placeholder="e.g. Data Science"/></div>
            </div>
            <div class="form-group" style="margin-bottom:16px"><label class="form-label">Bio</label><textarea class="form-textarea" name="bio" style="min-height:100px">${me.bio || ''}</textarea></div>
            <div style="display:flex;justify-content:flex-end"><button class="btn-primary" type="submit">Save profile</button></div>
          </form>

          <div style="height:1px;background:var(--gray-100);margin:18px 0"></div>

          <form id="settings-localization-form">
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group">
                <label class="form-label">Language</label>
                <input class="form-input" name="language" value="${s.language || ''}" placeholder="e.g. en, si, ta"/>
              </div>
              <div class="form-group">
                <label class="form-label">Time zone</label>
                <input class="form-input" name="time_zone" value="${s.time_zone || ''}" placeholder="e.g. Asia/Colombo"/>
              </div>
            </div>
            <div style="display:flex;justify-content:flex-end"><button class="btn-primary" type="submit">Save localization</button></div>
          </form>

          <div style="height:1px;background:var(--gray-100);margin:18px 0"></div>

          <form id="settings-appearance-form">
            <div class="form-row" style="margin-bottom:16px">

              <div class="form-group">
                <label class="form-label">Density</label>
                <select class="form-select" name="ui_density">
                  <option value="comfortable" ${s.ui_density === 'comfortable' ? 'selected' : ''}>Comfortable</option>
                  <option value="compact" ${s.ui_density === 'compact' ? 'selected' : ''}>Compact</option>
                </select>
              </div>
            </div>
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group">
                <label class="form-label">Font size</label>
                <select class="form-select" name="font_scale">
                  <option value="sm" ${s.font_scale === 'sm' ? 'selected' : ''}>Small</option>
                  <option value="md" ${!s.font_scale || s.font_scale === 'md' ? 'selected' : ''}>Default</option>
                  <option value="lg" ${s.font_scale === 'lg' ? 'selected' : ''}>Large</option>
                  <option value="xl" ${s.font_scale === 'xl' ? 'selected' : ''}>Extra large</option>
                </select>
              </div>
              <div class="form-group" style="justify-content:flex-end;padding-top:24px">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--gray-600)">
                  <input type="checkbox" name="ui_reduced_motion" ${s.ui_reduced_motion ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)"/>
                  Reduced motion
                </label>
              </div>
            </div>
            <div style="display:flex;justify-content:flex-end"><button class="btn-primary" type="submit">Save appearance</button></div>
          </form>
        </div>

        <div class="settings-panel" data-settings-panel="security" style="display:none">
          <div class="settings-title"><span class="iconify" data-icon="mdi:shield-key-outline"></span> Login & Security</div>
          <div class="settings-help">Manage your password, account email, 2-step verification, and active sessions.</div>

          <form id="settings-change-email-form">
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group"><label class="form-label">Current email</label><input class="form-input" value="${me.email}" disabled/></div>
              <div class="form-group"><label class="form-label">New email</label><input class="form-input" name="newEmail" type="email" placeholder="new@email.com" required/></div>
            </div>
            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">Password (required for local accounts)</label>
              <input class="form-input" name="password" type="password" placeholder="Your password"/>
            </div>
            <div style="display:flex;justify-content:flex-end"><button class="btn-primary" type="submit">Change email</button></div>
          </form>

          <div style="height:1px;background:var(--gray-100);margin:18px 0"></div>

          <form id="change-password-form">
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group"><label class="form-label">Current password</label><input class="form-input" name="currentPassword" type="password" required/></div>
              <div class="form-group"><label class="form-label">New password</label><input class="form-input" name="newPassword" type="password" required/></div>
            </div>
            <div class="form-group" style="margin-bottom:16px"><label class="form-label">Confirm new password</label><input class="form-input" name="confirmNewPassword" type="password" required/></div>
            <div style="display:flex;justify-content:flex-end"><button class="btn-primary" type="submit">Update password</button></div>
          </form>

          <div style="height:1px;background:var(--gray-100);margin:18px 0"></div>

          <form id="settings-2fa-form">
            <div class="form-group" style="margin-bottom:12px">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--gray-600)">
                <input type="checkbox" name="two_factor_enabled" ${s.two_factor_enabled ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)"/>
                Two-step verification (placeholder)
              </label>
            </div>
            <div style="display:flex;justify-content:flex-end"><button class="btn-primary" type="submit">Save 2FA setting</button></div>
          </form>

          <div style="height:1px;background:var(--gray-100);margin:18px 0"></div>

          <div class="profile-section-title" style="margin:0 0 10px;font-size:0.98rem">Active sessions</div>
          ${sessionRows}
          <div style="display:flex;justify-content:flex-end;margin-top:14px">
            <button class="btn-ghost btn-sm" style="color:var(--gray-600);border-color:var(--gray-200)" onclick="logoutAllDevices(event)">Log out from all devices</button>
          </div>
        </div>

        <div class="settings-panel" data-settings-panel="notifications" style="display:none">
          <div class="settings-title"><span class="iconify" data-icon="mdi:bell-outline"></span> Notifications</div>
          <div class="settings-help">Control which notifications you receive and how often.</div>
          <form id="settings-notifications-form">
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--gray-600)">
                  <input type="checkbox" name="notify_email" ${s.notify_email ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)"/>
                  Email notifications
                </label>
              </div>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--gray-600)">
                  <input type="checkbox" name="notify_sms" ${s.notify_sms ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)"/>
                  SMS notifications (placeholder)
                </label>
              </div>
            </div>
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--gray-600)">
                  <input type="checkbox" name="notify_push" ${s.notify_push ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)"/>
                  Push notifications (placeholder)
                </label>
              </div>
              <div class="form-group">
                <label class="form-label">Frequency</label>
                <select class="form-select" name="notify_digest">
                  <option value="realtime" ${s.notify_digest === 'realtime' ? 'selected' : ''}>Real-time</option>
                  <option value="daily" ${s.notify_digest === 'daily' ? 'selected' : ''}>Daily digest</option>
                  <option value="weekly" ${s.notify_digest === 'weekly' ? 'selected' : ''}>Weekly digest</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom:16px">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--gray-600)">
                <input type="checkbox" name="notify_paper_status" ${s.notify_paper_status ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)"/>
                Paper status updates (approved/rejected)
              </label>
            </div>
            <div style="display:flex;justify-content:flex-end"><button class="btn-primary" type="submit">Save notifications</button></div>
          </form>
        </div>

        <div class="settings-panel" data-settings-panel="privacy" style="display:none">
          <div class="settings-title"><span class="iconify" data-icon="mdi:lock-outline"></span> Privacy & Data</div>
          <div class="settings-help">Manage profile visibility, data sharing, and export or delete your account.</div>
          <form id="settings-privacy-form">
            <div class="form-group" style="margin-bottom:12px">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--gray-600)">
                <input type="checkbox" name="profile_public" ${s.profile_public ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)"/>
                Public profile
              </label>
            </div>
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--gray-600)">
                  <input type="checkbox" name="data_sharing" ${s.data_sharing ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)"/>
                  Allow third-party data sharing (placeholder)
                </label>
              </div>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--gray-600)">
                  <input type="checkbox" name="usage_tracking" ${s.usage_tracking ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)"/>
                  Usage tracking (placeholder)
                </label>
              </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:12px">
              <button type="button" class="btn-ghost btn-sm" style="color:var(--gray-600);border-color:var(--gray-200)" onclick="clearSearchHistory(event)">Clear search history</button>
              <button class="btn-primary" type="submit">Save privacy</button>
            </div>
          </form>

          <div style="height:1px;background:var(--gray-100);margin:18px 0"></div>

          <div class="profile-section-title" style="margin:0 0 10px;font-size:0.98rem">Data export</div>
          <button class="btn-ghost btn-sm" style="color:var(--gray-600);border-color:var(--gray-200);gap:8px" onclick="exportMyData(event)"><span class="iconify" data-icon="mdi:download"></span> Export my data</button>

          <div style="height:1px;background:var(--gray-100);margin:18px 0"></div>

          <div class="profile-section-title" style="margin:0 0 10px;font-size:0.98rem;color:#b91c1c">Account deletion</div>
          <form id="settings-delete-account-form">
            <div class="form-group" style="margin-bottom:12px">
              <label class="form-label">Password (local accounts)</label>
              <input class="form-input" name="password" type="password" placeholder="Your password"/>
            </div>
            <button class="btn-primary" type="submit" style="background:#dc2626">Delete account</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

function wireSettingsUI(me, s) {
  // Tab switching logic
  const navBtns = document.querySelectorAll('[data-settings-tab]');
  const panels = document.querySelectorAll('[data-settings-panel]');
  navBtns.forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', () => {
      const id = btn.dataset.settingsTab;
      navBtns.forEach(b => b.classList.toggle('active', b === btn));
      panels.forEach(p => p.style.display = p.dataset.settingsPanel === id ? 'block' : 'none');
    });
  });

  // 1. Profile Details Form
  const profileForm = document.getElementById('settings-profile-form');
  if (profileForm && !profileForm._wired) {
    profileForm._wired = true;
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = profileForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const data = {
          name: profileForm.name.value,
          department: profileForm.department.value,
          bio: profileForm.bio.value
        };
        const res = await API.updateMySettings(data);
        if (res.ok) { Toast.show('Profile updated successfully.'); Auth.refresh(); }
        else Toast.show(res.error || 'Failed to update profile.', 'error');
      } catch { Toast.show('Connection error.', 'error'); }
      btn.disabled = false;
    });
  }

  // 2. Change Email Form
  const emailForm = document.getElementById('settings-change-email-form');
  if (emailForm && !emailForm._wired) {
    emailForm._wired = true;
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = emailForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const res = await API.changeEmail(emailForm.newEmail.value, emailForm.password?.value);
        if (res.ok) {
          Toast.show('Confirmation email sent to your new address.');
          emailForm.reset();
        } else {
          Toast.show(res.error || 'Failed to change email.', 'error');
        }
      } catch { Toast.show('Connection error.', 'error'); }
      btn.disabled = false;
    });
  }

  // 3. Change Password Form
  const passwordForm = document.getElementById('change-password-form');
  if (passwordForm && !passwordForm._wired) {
    passwordForm._wired = true;
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = passwordForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const data = {
          currentPassword: passwordForm.currentPassword.value,
          newPassword: passwordForm.newPassword.value,
          confirmNewPassword: passwordForm.confirmNewPassword.value
        };
        const res = await API.changePassword(data);
        if (res.ok) {
          Toast.show('Password changed successfully.');
          passwordForm.reset();
        } else {
          Toast.show(res.error || 'Failed to change password.', 'error');
        }
      } catch { Toast.show('Connection error.', 'error'); }
      btn.disabled = false;
    });
  }

  // 4. Appearance Form
  const appForm = document.getElementById('settings-appearance-form');
  if (appForm && !appForm._wired) {
    appForm._wired = true;
    appForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {

        ui_density: appForm.ui_density.value,
        font_scale: appForm.font_scale.value,
        ui_reduced_motion: appForm.ui_reduced_motion.checked ? 1 : 0
      };
      const res = await API.updateMySettings(data);
      if (res.ok) { Toast.show('Appearance saved.'); location.reload(); }
      else Toast.show(res.error || 'Failed.', 'error');
    });
  }
}

window.revokeSession = async function (sessionId) {
  const r = await API.revokeSession(sessionId);
  if (r.ok) { Toast.show('Logged out from device.'); loadSettingsPage(); }
  else Toast.show(r.error || 'Failed.', 'error');
};
window.logoutAllDevices = async function (e) {
  e.preventDefault();
  if (!confirm('Log out from all devices?')) return;
  const r = await API.logoutAllSessions();
  if (r.ok) { Toast.show('Logged out.'); Auth.user = null; Auth._updateNav(); Auth._updatePages(); showPage('home'); }
  else Toast.show(r.error || 'Failed.', 'error');
};
window.exportMyData = async function (e) {
  e.preventDefault();
  const data = await API.exportMyData();
  if (!data) { Toast.show('Export failed.', 'error'); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'datavoyage-export.json';
  a.click();
  URL.revokeObjectURL(url);
};
window.clearSearchHistory = async function (e) {
  e.preventDefault();
  const r = await API.updateMySettings({ saved_repo_query: null, saved_repo_domain: null });
  if (r.ok) { Toast.show('Search history cleared.'); loadUserSettings(); }
  else Toast.show(r.error || 'Failed.', 'error');
};

window.renderOwnProfile = function () { loadMyProfile(); };

// ── PROFILE HTML BUILDER ──────────────────────────────────────
function buildFullProfileHTML(u, rep, xp, isOwn, showEditForm) {
  const badges = rep?.badges || u.badges || [];
  const log = rep?.log || [];
  const papers = u.papers || [];
  const allBadges = getAllBadgeSlugs();

  return `
    <!-- PROFILE HERO -->
    <div class="profile-hero">
      <div class="profile-hero-card">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar-large">
            ${u.avatar_url
      ? `<img src="${u.avatar_url}" alt="${u.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
      : `<span>${initials(u.name)}</span>`}
          </div>
          ${showEditForm ? `
            <label class="profile-avatar-edit-btn" title="Change photo" style="display:flex;align-items:center;justify-content:center">
              <span class="iconify" data-icon="mdi:camera-outline"></span>
              <input type="file" class="avatar-file-input" accept="image/*" style="display:none"/>
            </label>` : ''}
        </div>
        <div class="profile-hero-info">
          <div class="profile-hero-name">${escapeHtml(u.name)}</div>
          <div class="profile-hero-role">
            <span style="display:inline-flex;align-items:center;gap:8px">${u.role === 'admin' ? `<span class="iconify" data-icon="mdi:shield-account-outline"></span> Administrator` : `<span class="iconify" data-icon="mdi:flask-outline"></span> Researcher`}</span>
            ${u.department ? `<span style="opacity:0.4">·</span><span>${escapeHtml(u.department)}</span>` : ''}
            <span class="profile-level-badge"><span class="iconify" data-icon="mdi:hexagon-outline"></span> Level ${u.level || 1} · ${levelLabel(u.level || 1)}</span>
          </div>
          ${u.bio ? `<div class="profile-hero-bio">${escapeHtml(u.bio)}</div>` : ''}
          <div class="profile-hero-links">
            ${u.website ? `<a class="profile-link-btn" href="${escapeHtml(u.website)}" target="_blank" style="gap:8px"><span class="iconify" data-icon="mdi:web"></span> Website</a>` : ''}
            ${u.twitter ? `<a class="profile-link-btn" href="https://twitter.com/${escapeHtml(u.twitter).replace('@', '')}" target="_blank" style="gap:8px"><span class="iconify" data-icon="mdi:twitter"></span> ${escapeHtml(u.twitter)}</a>` : ''}
            ${isOwn ? `<button class="profile-link-btn" onclick="document.getElementById('edit-profile-tab').click()" style="gap:8px"><span class="iconify" data-icon="mdi:pencil-outline"></span> Edit Profile</button>` : ''}
            ${isOwn ? `<button class="profile-link-btn" data-go="settings" style="gap:8px"><span class="iconify" data-icon="mdi:cog-outline"></span> Settings</button>` : ''}
          </div>
          <div class="profile-quick-stats">
            <div class="profile-qs-item"><div class="profile-qs-val">${(u.reputation || 0).toLocaleString()}</div><div class="profile-qs-lbl">Reputation</div></div>
            <div class="profile-qs-item"><div class="profile-qs-val">${u.xp?.toLocaleString() || 0}</div><div class="profile-qs-lbl">XP</div></div>
            <div class="profile-qs-item"><div class="profile-qs-val">${u.paper_count || 0}</div><div class="profile-qs-lbl">Papers</div></div>
            <div class="profile-qs-item"><div class="profile-qs-val">${u.endorse_count || 0}</div><div class="profile-qs-lbl">Endorsements</div></div>
            <div class="profile-qs-item"><div class="profile-qs-val">${badges.length}</div><div class="profile-qs-lbl">Badges</div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- PROFILE TABS -->
    <div class="profile-tabs">
      <div class="profile-tab active" onclick="switchProfileTab('overview',this)">Overview</div>
      <div class="profile-tab" onclick="switchProfileTab('papers',this)">Papers (${papers.length})</div>
      <div class="profile-tab" onclick="switchProfileTab('badges',this)">Badges (${badges.length})</div>
      <div class="profile-tab" onclick="switchProfileTab('activity',this)">Activity</div>
      ${showEditForm ? `<div class="profile-tab" id="edit-profile-tab" onclick="switchProfileTab('edit',this)">Edit Profile</div>` : ''}
    </div>

    <!-- PROFILE BODY -->
    <div class="profile-body">

      <!-- OVERVIEW TAB -->
      <div id="ptab-overview" class="profile-ptab">
        <!-- XP Bar -->
        <div class="xp-bar-wrap reveal">
          <div class="xp-bar-header">
            <span class="xp-bar-label">Level ${u.level || 1} — ${levelLabel(u.level || 1)}</span>
            <span class="xp-bar-value">${(u.xp || 0).toLocaleString()} XP</span>
          </div>
          <div class="xp-bar-track">
            <div class="xp-bar-fill" style="width:0%"></div>
          </div>
          <div class="xp-bar-footer">
            <span>Level ${u.level || 1}</span>
            ${xp.remaining ? `<span>${xp.remaining.toLocaleString()} XP to Level ${xp.nextLevel}</span>` : '<span>Max Level!</span>'}
          </div>
        </div>

        <!-- Stat cards -->
        <div class="rep-stats-grid reveal">
          <div class="rep-stat-card"><div class="rep-stat-icon"><span class="iconify" data-icon="mdi:star-outline"></span></div><div class="rep-stat-val">${(u.reputation || 0).toLocaleString()}</div><div class="rep-stat-lbl">Reputation</div></div>
          <div class="rep-stat-card"><div class="rep-stat-icon"><span class="iconify" data-icon="mdi:file-document-outline"></span></div><div class="rep-stat-val">${u.paper_count || 0}</div><div class="rep-stat-lbl">Papers</div></div>
          <div class="rep-stat-card"><div class="rep-stat-icon"><span class="iconify" data-icon="mdi:eye-outline"></span></div><div class="rep-stat-val">${(u.total_views || 0).toLocaleString()}</div><div class="rep-stat-lbl">Total Views</div></div>
          <div class="rep-stat-card"><div class="rep-stat-icon"><span class="iconify" data-icon="mdi:handshake-outline"></span></div><div class="rep-stat-val">${u.endorse_count || 0}</div><div class="rep-stat-lbl">Endorsements</div></div>
        </div>

        <!-- Recent badges (top 4) -->
        ${badges.length ? `
          <div class="profile-section-title reveal"><span class="iconify" data-icon="mdi:award-outline"></span> Recent Badges
            <a onclick="switchProfileTab('badges',document.querySelector('.profile-tab:nth-child(3)'))" style="font-size:0.8rem;font-weight:600;color:var(--primary);cursor:pointer;margin-left:auto">View all →</a>
          </div>
          <div class="badges-grid reveal" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
            ${badges.slice(0, 4).map(b => `
              <div class="badge-card" style="--badge-color:${b.color}">
                <span class="badge-icon">${b.icon}</span>
                <div class="badge-name">${b.name}</div>
                <div class="badge-desc">${b.description}</div>
                <span class="badge-tier ${b.tier}">${b.tier}</span>
              </div>`).join('')}
          </div>` : '<p style="color:var(--gray-400);margin-bottom:24px">No badges earned yet.</p>'}

        <!-- Recent papers (top 3) -->
        ${papers.length ? `
          <div class="profile-section-title reveal" style="margin-top:32px"><span class="iconify" data-icon="mdi:file-document-outline"></span> Recent Papers</div>
          <div class="profile-papers-grid reveal">${papers.slice(0, 3).map(p => `
            <div class="research-card" onclick="openPaperDetail('${p.uuid}')" style="cursor:pointer">
              <div class="card-img" style="background:${dcol(p.domain)}">
                <div class="card-img-overlay"></div>
                <div class="card-tag">${p.domain}</div>
              </div>
              <div class="card-body">
                <div class="card-title">${p.title}</div>
                <div class="card-meta" style="margin-top:8px">
                  <span style="font-size:0.78rem;color:var(--gray-400);display:inline-flex;align-items:center;gap:6px"><span class="iconify" data-icon="mdi:eye-outline"></span> ${p.views} · ${relDate(p.created_at)}</span>
                </div>
              </div>
            </div>`).join('')}
          </div>` : ''}
      </div>

      <!-- PAPERS TAB -->
      <div id="ptab-papers" class="profile-ptab" style="display:none">
        <div class="profile-section-title">All Published Papers</div>
        ${papers.length
      ? `<div class="profile-papers-grid">${papers.map(p => `
              <div class="research-card" onclick="openPaperDetail('${p.uuid}')" style="cursor:pointer">
                <div class="card-img" style="background:${dcol(p.domain)}">
                  <div class="card-img-overlay"></div><div class="card-tag">${p.domain}</div>
                </div>
                <div class="card-body">
                  <div class="card-title">${p.title}</div>
                  ${p.keywords ? `<div class="card-tags" style="margin-top:8px">${p.keywords.split(',').slice(0, 3).map(t => `<span class="tag-chip">${t.trim()}</span>`).join('')}</div>` : ''}
                  <div class="card-meta" style="margin-top:10px">
                    <span style="font-size:0.78rem;color:var(--gray-400);display:inline-flex;align-items:center;gap:6px"><span class="iconify" data-icon="mdi:eye-outline"></span> ${p.views} views · <span class="iconify" data-icon="mdi:download"></span> ${p.downloads} downloads</span>
                    <span class="card-date">${relDate(p.created_at)}</span>
                  </div>
                </div>
              </div>`).join('')}</div>`
      : '<p style="color:var(--gray-400)">No approved papers yet.</p>'}
      </div>

      <!-- BADGES TAB -->
      <div id="ptab-badges" class="profile-ptab" style="display:none">
        <div class="profile-section-title">All Badges</div>
        <div class="badges-grid">
          ${allBadges.map(slug => {
        const earned = badges.find(b => b.slug === slug);
        return earned
          ? `<div class="badge-card" style="--badge-color:${earned.color}" title="${earned.description}">
                  <span class="badge-icon">${earned.icon}</span>
                  <div class="badge-name">${earned.name}</div>
                  <div class="badge-desc">${earned.description}</div>
                  <span class="badge-tier ${earned.tier}">${earned.tier}</span>
                  <div class="badge-earned-date">Earned ${relDate(earned.earned_at)}</div>
                </div>`
          : `<div class="badge-card locked" title="Not earned yet">
                  <span class="badge-icon"><span class="iconify" data-icon="mdi:lock-outline"></span></span>
                  <div class="badge-name" style="color:var(--gray-400)">Locked</div>
                  <div class="badge-desc">Keep contributing to unlock</div>
                </div>`;
      }).join('')}
        </div>
      </div>

      <!-- ACTIVITY TAB -->
      <div id="ptab-activity" class="profile-ptab" style="display:none">
        <div class="profile-section-title">Recent Activity</div>
        ${log.length
      ? `<div class="activity-log">${log.map(l => {
        const isBadge = l.action === 'badge_earned';
        return `<div class="activity-item">
                <div class="activity-icon ${isBadge ? 'badge' : 'positive'}">${isBadge ? '<span class="iconify" data-icon="mdi:award-outline"></span>' : '<span class="iconify" data-icon="mdi:star-outline"></span>'}</div>
                <div class="activity-body">
                  <div class="activity-note">${escapeHtml(l.note) || l.action.replace(/_/g, ' ')}</div>
                  <div class="activity-meta">${relDate(l.created_at)}</div>
                </div>
                <div class="activity-points">+${l.points} rep · +${l.xp} XP</div>
              </div>`;
      }).join('')}</div>`
      : '<p style="color:var(--gray-400)">No activity yet.</p>'}
      </div>

      <!-- EDIT TAB (own profile only) -->
      ${showEditForm ? `
        <div id="ptab-edit" class="profile-ptab" style="display:none">
          <!-- Avatar Upload -->
          <div class="profile-edit-panel">
            <div class="profile-edit-title">Profile Picture</div>
            <div class="avatar-upload-area">
              <div class="avatar-preview-wrap">
                <div class="avatar-preview">
                  ${u.avatar_url
        ? `<img src="${u.avatar_url}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
        : `<span>${initials(u.name)}</span>`}
                </div>
              </div>
              <div>
                <div class="avatar-upload-btns">
                  <label>Upload Photo<input type="file" class="avatar-file-input" accept="image/jpeg,image/png,image/webp" style="display:none"/></label>
                  ${u.avatar_url ? `<button type="button" class="avatar-remove-btn" onclick="removeAvatar()">Remove photo</button>` : ''}
                </div>
                <div class="avatar-hint">JPG, PNG, or WebP · Max 5MB</div>
              </div>
            </div>
          </div>

          <!-- Profile Details -->
          <div class="profile-edit-panel">
            <div class="profile-edit-title">Profile Details</div>
            <form id="profile-edit-form">
              <div class="form-row" style="margin-bottom:18px">
                <div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" name="pname" type="text" required/></div>
                <div class="form-group"><label class="form-label">Department</label><input class="form-input" name="pdepartment" type="text" placeholder="e.g. Data Science"/></div>
              </div>
              <div class="form-group" style="margin-bottom:18px">
                <label class="form-label">Bio</label>
                <textarea class="form-textarea" name="pbio" style="min-height:100px" placeholder="Tell the community about your research interests and expertise…"></textarea>
              </div>
              <div class="form-row" style="margin-bottom:24px">
                <div class="form-group"><label class="form-label">Website</label><input class="form-input" name="pwebsite" type="url" placeholder="https://yoursite.com"/></div>
                <div class="form-group"><label class="form-label">Twitter / X</label><input class="form-input" name="ptwitter" type="text" placeholder="@username"/></div>
              </div>
              <div style="display:flex;justify-content:flex-end;gap:12px">
                <button type="submit" class="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>

          <!-- How to earn rep -->
          <div class="profile-edit-panel" style="background:linear-gradient(135deg,var(--primary-pale),white)">
            <div class="profile-edit-title" style="border-bottom:none;padding-bottom:0;display:flex;align-items:center;gap:10px"><span class="iconify" data-icon="mdi:trophy-outline"></span> How to Earn Reputation</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:16px">
              ${[
        ['<span class="iconify" data-icon="mdi:file-document-outline"></span>', 'Submit a paper', '+5 rep, +20 XP'],
        ['<span class="iconify" data-icon="mdi:check-decagram-outline"></span>', 'Paper approved', '+50 rep, +150 XP'],
        ['<span class="iconify" data-icon="mdi:eye-outline"></span>', 'Every 10 views', '+1 rep, +2 XP'],
        ['<span class="iconify" data-icon="mdi:handshake-outline"></span>', 'Receive endorsement', '+10 rep, +30 XP'],
        ['<span class="iconify" data-icon="mdi:sparkles"></span>', 'Complete profile', '+15 rep, +75 XP'],
        ['<span class="iconify" data-icon="mdi:fire"></span>', 'Daily login streak', 'Bonus XP'],
      ].map(([icon, label, reward]) => `
                <div style="background:white;border-radius:10px;padding:14px 16px;border:1px solid var(--gray-100)">
                  <div style="font-size:1.4rem;margin-bottom:6px;display:inline-flex;align-items:center">${icon}</div>
                  <div style="font-size:0.85rem;font-weight:600;color:var(--gray-800)">${label}</div>
                  <div style="font-size:0.78rem;color:var(--primary);font-weight:700;margin-top:3px">${reward}</div>
                </div>`).join('')}
            </div>
          </div>
        </div>` : ''}
    </div>`;
}

// All badge slugs for the full badge display
function getAllBadgeSlugs() {
  return ['welcome', 'first_upload', 'profile_complete', 'papers_3', 'papers_10', 'papers_25',
    'views_100', 'views_1000', 'endorsed_5', 'endorsed_20', 'multi_domain',
    'streak_7', 'streak_30', 'early_adopter'];
}

// Profile tab switcher
window.switchProfileTab = function (name, btn) {
  const container = btn?.closest('.page') || document;
  container.querySelectorAll('.profile-ptab').forEach(t => t.style.display = 'none');
  container.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
  const tab = container.querySelector('#ptab-' + name);
  if (tab) tab.style.display = 'block';
  if (btn) btn.classList.add('active');
};

// ── LEADERBOARD ───────────────────────────────────────────────
async function loadLeaderboard() {
  const c = document.getElementById('leaderboard-list'); if (!c) return;
  c.innerHTML = '<div class="loading-placeholder">Loading leaderboard…</div>';
  try {
    const users = await API.getLeaderboard();
    const medals = ['🥇', '🥈', '🥉'];
    c.innerHTML = users.length
      ? users.map((u, i) => `
        <div class="leaderboard-item rank-${Math.min(i + 1, 4)}" onclick="viewResearcherProfile('${u.uuid}')">
          <div class="lb-rank ${i < 3 ? 'top-3' : ''}">${i < 3 ? medals[i] : i + 1}</div>
          <div class="lb-avatar">
            ${u.avatar_url
          ? `<img src="${u.avatar_url}" alt="${escapeHtml(u.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
          : `<span>${initials(u.name)}</span>`}
          </div>
          <div class="lb-info">
            <div class="lb-name">${escapeHtml(u.name)}</div>
            <div class="lb-dept">${escapeHtml(u.department) || 'Data Science'} · Lv.${u.level || 1} ${levelLabel(u.level || 1)}</div>
            <div class="lb-badges">
              ${(u.badge_count > 0 ? Array(Math.min(u.badge_count, 5)).fill('<span class="iconify" data-icon="mdi:award-outline"></span>') : []).join('')}
            </div>
          </div>
          <div class="lb-stats">
            <div class="lb-rep">${(u.reputation || 0).toLocaleString()}</div>
            <div class="lb-level">${u.papers || 0} papers · ${u.badge_count || 0} badges</div>
          </div>
        </div>`).join('')
      : '<p style="color:var(--gray-400);text-align:center;padding:40px">No researchers yet.</p>';
    observeReveals();
  } catch { c.innerHTML = '<p style="color:var(--gray-400);text-align:center">Error loading leaderboard.</p>'; }
}

// ── MY PAPERS ─────────────────────────────────────────────────
async function loadMyPapers() {
  const g = document.getElementById('mypapers-grid'); if (!g) return;
  if (!Auth.isLoggedIn()) { showPage('home'); return; }
  g.innerHTML = '<div class="loading-placeholder" style="grid-column:1/-1">Loading…</div>';
  try {
    const papers = await API.getMyPapers();
    g.innerHTML = papers.length
      ? papers.map(p => `
          <div class="research-card reveal">
            <div class="card-img" style="background:${dcol(p.domain)}">
              <div class="card-img-overlay"></div>
              <div class="card-tag">${escapeHtml(p.domain)}</div>
              <div style="position:absolute;top:14px;right:14px">
                <span class="status-badge status-${p.status}">${p.status}</span>
              </div>
            </div>
            <div class="card-body">
              <div class="card-title">${escapeHtml(p.title)}</div>
              <div class="card-meta" style="margin-top:8px">
                <span style="font-size:0.78rem;color:var(--gray-400);display:inline-flex;align-items:center;gap:6px"><span class="iconify" data-icon="mdi:eye-outline"></span> ${p.views} · <span class="iconify" data-icon="mdi:download"></span> ${p.downloads}</span>
                <span class="card-date">${relDate(p.created_at)}</span>
              </div>
              <div class="card-footer" style="margin-top:14px">
                <span style="font-size:0.78rem;color:var(--gray-400);display:inline-flex;align-items:center;gap:6px">${p.status === 'approved' ? `<span class="iconify" data-icon="mdi:check-circle-outline"></span> Live` : p.status === 'pending' ? `<span class="iconify" data-icon="mdi:clock-outline"></span> Awaiting review` : p.status === 'review' ? `<span class="iconify" data-icon="mdi:magnify"></span> In review` : `<span class="iconify" data-icon="mdi:close-circle-outline"></span> Rejected`}</span>
                <button class="card-action" style="background:#fee2e2;color:#dc2626" onclick="deleteMyPaper('${p.uuid}',event)" title="Delete"><span class="iconify" data-icon="mdi:trash-can-outline"></span></button>
              </div>
            </div>
          </div>`)
        .join('')
      : `<div style="text-align:center;padding:60px;grid-column:1/-1;color:var(--gray-400)">
           <div style="font-size:2.5rem;margin-bottom:16px"><span class="iconify" data-icon="mdi:file-document-outline"></span></div>
           <div style="font-weight:600;font-size:1.1rem;margin-bottom:8px">No papers yet</div>
           <button class="btn-primary" onclick="showPage('upload')">Upload Research →</button>
         </div>`;
    observeReveals();
  } catch { g.innerHTML = '<p style="color:var(--gray-400)">Error loading papers.</p>'; }
}

window.deleteMyPaper = async function (uuid, e) {
  e.stopPropagation();
  if (!confirm('Delete this paper permanently?')) return;
  const r = await API.deletePaper(uuid);
  if (r.ok) { Toast.show('Paper deleted.'); loadMyPapers(); }
  else Toast.show(r.error || 'Delete failed.', 'error');
};

// ── UPLOAD ────────────────────────────────────────────────────
function initUploadPage() {
  const gate = document.querySelector('#page-upload .upload-gate');
  const cont = document.querySelector('#page-upload .upload-content');
  if (gate && cont) {
    gate.style.display = Auth.isLoggedIn() ? 'none' : 'flex';
    cont.style.display = Auth.isLoggedIn() ? 'block' : 'none';
  }

  const form = document.getElementById('upload-research-form');
  if (!form || form._wired) return;
  form._wired = true;

  // Dropzone click handler
  document.querySelectorAll('.dropzone[data-file-open]').forEach(dz => {
    dz.addEventListener('click', () => {
      const inputId = dz.dataset.fileOpen;
      const input = document.getElementById(inputId);
      if (input) input.click();
    });
  });

  // File change handler to show filename
  document.querySelectorAll('input[type="file"][data-dropzone-text]').forEach(input => {
    input.addEventListener('change', (e) => {
      const textId = input.dataset.dropzoneText;
      const textEl = document.getElementById(textId);
      const dz = input.closest('.dropzone');
      const iconId = textId.replace('-text', '-icon');
      const iconEl = document.getElementById(iconId);

      if (textEl && e.target.files.length > 0) {
        textEl.textContent = e.target.files.length === 1
          ? e.target.files[0].name
          : `${e.target.files.length} files selected`;
        
        if (dz) dz.classList.add('has-file');
        if (iconEl) {
          iconEl.innerHTML = '<span class="iconify" data-icon="mdi:check-circle"></span>';
          iconEl.style.color = '#10b981';
          iconEl.style.opacity = '1';
        }
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = 'Uploading…';

    const formData = new FormData(form);
    try {
      const res = await API.uploadPaper(formData);
      if (res.ok) {
        Toast.show('Research submitted for review! +5 rep awarded.');
        form.reset();
        
        // Reset dropzones
        document.querySelectorAll('.dropzone').forEach(dz => dz.classList.remove('has-file'));
        
        const pDz = document.getElementById('paper-dz-text');
        if (pDz) pDz.textContent = 'Click or drag to upload your research paper';
        const pIcon = document.getElementById('paper-dz-icon');
        if (pIcon) {
          pIcon.innerHTML = '<span class="iconify" data-icon="mdi:cloud-upload-outline"></span>';
          pIcon.style.color = '';
          pIcon.style.opacity = '';
        }

        const sDz = document.getElementById('support-dz-text');
        if (sDz) sDz.textContent = 'Datasets, code, or supplementary materials';
        const sIcon = document.getElementById('support-dz-icon');
        if (sIcon) {
          sIcon.innerHTML = '<span class="iconify" data-icon="mdi:database-outline"></span>';
          sIcon.style.color = '';
          sIcon.style.opacity = '';
        }

        showPage('home');
      } else {
        Toast.show(res.error || 'Upload failed.', 'error');
      }
    } catch (err) {
      Toast.show('An error occurred during upload.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  });
}

async function handleAvatarUpload(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { Toast.show('Please select an image file.', 'error'); return; }
  if (file.size > 2 * 1024 * 1024) { Toast.show('Avatar must be under 2MB.', 'error'); return; }

  const formData = new FormData();
  formData.append('avatar', file);

  Toast.show('Uploading avatar…');
  const res = await API.uploadAvatar(formData);
  if (res.ok) {
    Toast.show('Avatar updated!');
    loadMyProfile();
  } else {
    Toast.show(res.error || 'Failed to update avatar.', 'error');
  }
}

// ── ADMIN ─────────────────────────────────────────────────────
async function loadAdminDashboard() {
  if (!Auth.isAdmin()) return;
  try {
    const s = await API.getAdminStats();
    [['kpi-papers', s.totalPapers], ['kpi-pending', s.pendingPapers],
    ['kpi-users', s.totalUsers], ['kpi-badges', s.badgesAwarded]].forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el) animateNumber(el, v || 0);
    });
  } catch { }

  wireAdminUI();
  initAdminForms();
  loadAdminSubmissions('all', 'admin-submissions-tbody');
  loadAdminUsers();
}

function wireAdminUI() {
  const sidebarItems = document.querySelectorAll('[data-admin-tab]');
  const tabs = document.querySelectorAll('.admin-tab');
  if (sidebarItems.length && !sidebarItems[0]._wired) {
    sidebarItems.forEach(item => {
      item._wired = true;
      item.addEventListener('click', () => {
        const target = item.dataset.adminTab;
        sidebarItems.forEach(i => i.classList.toggle('active', i === item));
        tabs.forEach(t => t.style.display = t.id === 'admin-tab-' + target ? 'block' : 'none');
        // Lazy load tab content
        if (target === 'submissions') loadAdminSubmissions('all', 'admin-submissions-tbody-2');
        if (target === 'news-mgmt') loadAdminNews();
        if (target === 'audit') loadAuditLog();
        if (target === 'analytics') renderAdminCharts();
      });
    });
  }

  // Filter chips
  document.querySelectorAll('[data-sub-filter]').forEach(chip => {
    if (chip._wired) return;
    chip._wired = true;
    chip.addEventListener('click', () => {
      const status = chip.dataset.subFilter;
      const parentTable = chip.closest('.admin-tab');
      const tbodyId = parentTable.querySelector('tbody').id;
      parentTable.querySelectorAll('[data-sub-filter]').forEach(c => c.classList.toggle('active', c === chip));
      loadAdminSubmissions(status, tbodyId);
    });
  });
}

function initAdminForms() {
  const newsForm = document.getElementById('admin-news-form');
  if (newsForm && !newsForm._wired) {
    newsForm._wired = true;
    newsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = newsForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      const data = {
        title: newsForm.news_title.value,
        summary: newsForm.news_summary.value,
        body: newsForm.news_body.value,
        category: newsForm.news_category.value,
        published: newsForm.news_published.checked ? 1 : 0
      };
      const res = await API.createNews(data);
      if (res.ok) {
        Toast.show('News article created.');
        newsForm.reset();
        closeModal('modal-add-news');
        loadAdminNews();
        if (showPage === 'news') loadNewsPage();
      } else {
        Toast.show(res.error || 'Failed to create news.', 'error');
      }
      btn.disabled = false;
    });
  }
}

async function loadAdminNews() {
  const container = document.getElementById('admin-news-list');
  if (!container) return;
  container.innerHTML = '<div class="loading-placeholder">Loading news…</div>';
  try {
    const news = await API.getAllNews();
    if (!news.length) { container.innerHTML = '<p style="padding:24px;color:var(--gray-400)">No news articles.</p>'; return; }
    container.innerHTML = `
      <div class="admin-table-card">
        <table>
          <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${news.map(n => `
              <tr>
                <td><strong>${escapeHtml(n.title)}</strong></td>
                <td><span class="status-badge" style="background:var(--off-white);color:var(--gray-600)">${n.category}</span></td>
                <td><span class="status-badge ${n.published ? 'status-approved' : 'status-pending'}">${n.published ? 'Published' : 'Draft'}</span></td>
                <td>${new Date(n.created_at).toLocaleDateString('en-GB')}</td>
                <td>
                  <button class="action-btn" onclick="deleteAdminNews('${n.uuid}')"><span class="iconify" data-icon="mdi:trash-can-outline"></span></button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch { container.innerHTML = 'Error loading news.'; }
}

window.deleteAdminNews = async function (uuid) {
  if (!confirm('Delete news article?')) return;
  const res = await API.deleteNews(uuid);
  if (res.ok) { Toast.show('Deleted.'); loadAdminNews(); }
  else Toast.show(res.error || 'Failed.', 'error');
};

async function loadAuditLog() {
  const tb = document.getElementById('admin-audit-tbody');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px">Loading…</td></tr>';
  try {
    const logs = await API.getAuditLog();
    tb.innerHTML = logs.map(l => `
      <tr>
        <td>${l.user_name || 'System'}</td>
        <td><code style="background:var(--off-white);padding:2px 4px;border-radius:4px">${l.action}</code></td>
        <td>${l.target || '—'}</td>
        <td><small style="color:var(--gray-400)">${l.ip || '—'}</small></td>
        <td>${new Date(l.created_at).toLocaleString('en-GB')}</td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px">No logs.</td></tr>';
  } catch { tb.innerHTML = '<tr><td colspan="5" style="text-align:center">Error.</td></tr>'; }
}

async function renderAdminCharts() {
  try {
    const data = await API.getDashboardCharts();
    charts.drawAdminTrends(data?.trend?.map(x => x.value) || []);
    charts.drawAdminDomains(data?.domains || []);
  } catch {
    charts.drawAdminTrends([]);
    charts.drawAdminDomains([]);
  }
}

async function loadAdminSubmissions(status = 'all', tbodyId = 'admin-submissions-tbody') {
  const tb = document.getElementById(tbodyId); if (!tb) return;
  tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px">Loading…</td></tr>';
  try {
    const d = await API.getAdminSubmissions({ status });
    if (!d.rows?.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px">No submissions.</td></tr>'; return; }
    tb.innerHTML = d.rows.map(p => `
      <tr>
        <td title="${escapeHtml(p.title)}">${escapeHtml(p.title).length > 40 ? escapeHtml(p.title).slice(0, 40) + '…' : escapeHtml(p.title)}</td>
        <td>${escapeHtml(p.author_name)}</td>
        <td>${escapeHtml(p.domain)}</td>
        <td>${new Date(p.created_at).toLocaleDateString('en-GB')}</td>
        <td><span class="status-badge status-${p.status}">${p.status}</span></td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="action-btn" onclick="openPaperDetail('${p.uuid}')" title="View Paper"><span class="iconify" data-icon="mdi:eye-outline"></span></button>
            <select class="status-select" data-uuid="${p.uuid}" style="font-size:0.78rem;padding:4px 8px;border:1px solid var(--gray-200);border-radius:6px">
              <option value="pending"  ${p.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="review"   ${p.status === 'review' ? 'selected' : ''}>Review</option>
              <option value="approved" ${p.status === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="rejected" ${p.status === 'rejected' ? 'selected' : ''}>Rejected</option>
            </select>
            <button class="action-btn" onclick="adminDeletePaper('${p.uuid}')"><span class="iconify" data-icon="mdi:trash-can-outline"></span></button>
          </div>
        </td>
      </tr>`).join('');
    tb.querySelectorAll('.status-select').forEach(s => {
      s.addEventListener('change', async () => {
        const r = await API.updateSubmissionStatus(s.dataset.uuid, s.value);
        if (r.ok) { Toast.show('Status updated.'); loadAdminSubmissions(status, tbodyId); }
        else Toast.show(r.error || 'Failed.', 'error');
      });
    });
  } catch { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400)">Error.</td></tr>'; }
}

window.adminDeletePaper = async function (uuid) {
  if (!confirm('Delete paper?')) return;
  const r = await API.deletePaper(uuid);
  if (r.ok) { Toast.show('Deleted.'); loadAdminSubmissions(); }
  else Toast.show(r.error || 'Failed.', 'error');
};

async function loadAdminUsers() {
  const tb = document.getElementById('admin-users-tbody'); if (!tb) return;
  tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--gray-400);padding:24px">Loading…</td></tr>';
  try {
    const users = await API.getAdminUsers();
    tb.innerHTML = users.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.name)}</strong></td>
        <td style="font-size:0.82rem">${escapeHtml(u.email)}</td>
        <td>${u.role}</td>
        <td><strong style="color:var(--primary)">${(u.reputation || 0).toLocaleString()}</strong></td>
        <td>Lv.${u.level || 1}</td>
        <td>${u.badge_count || 0}</td>
        <td>${new Date(u.created_at).toLocaleDateString('en-GB')}</td>
        <td>
          <span class="status-badge ${u.is_active ? 'status-approved' : 'status-rejected'}">${u.is_active ? 'Active' : 'Inactive'}</span>
          <button class="action-btn" onclick="toggleUserRole(${u.id},'${u.role}')" title="${u.role === 'admin' ? 'Demote to Researcher' : 'Promote to Admin'}">${u.role === 'admin' ? '<span class="iconify" data-icon="mdi:shield-off-outline"></span>' : '<span class="iconify" data-icon="mdi:shield-plus-outline"></span>'}</button>
          <button class="action-btn" onclick="toggleUserActive(${u.id},${u.is_active})" title="${u.is_active ? 'Deactivate' : 'Activate'}">${u.is_active ? '<span class="iconify" data-icon=\"mdi:lock-outline\"></span>' : '<span class="iconify" data-icon=\"mdi:lock-open-outline\"></span>'}</button>
          <button class="action-btn" onclick="adminDeleteUser(${u.id})" title="Delete"><span class="iconify" data-icon="mdi:trash-can-outline"></span></button>
        </td>
      </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--gray-400)">No users.</td></tr>';
  } catch { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--gray-400)">Error.</td></tr>'; }
}

window.toggleUserRole = async function (id, curRole) {
  const nextRole = curRole === 'admin' ? 'researcher' : 'admin';
  if (!confirm(`Are you sure you want to ${nextRole === 'admin' ? 'promote this user to Admin' : 'demote this user to Researcher'}?`)) return;
  
  const r = await API.updateAdminUser(id, { role: nextRole });
  if (r.ok) { Toast.show('User role updated successfully.'); loadAdminUsers(); }
  else Toast.show(r.error || 'Failed to update role.', 'error');
};

window.toggleUserActive = async function (id, cur) {
  const r = await API.updateAdminUser(id, { is_active: !cur });
  if (r.ok) { Toast.show('Updated.'); loadAdminUsers(); }
  else Toast.show(r.error || 'Failed.', 'error');
};
window.adminDeleteUser = async function (id) {
  if (!confirm('Delete this user and all their papers?')) return;
  const r = await API.deleteAdminUser(id);
  if (r.ok) { Toast.show('User deleted.'); loadAdminUsers(); }
  else Toast.show(r.error || 'Failed.', 'error');
};

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();
  await loadUserSettings();

  // Handle OAuth / Auth redirects
  const params = new URLSearchParams(window.location.search);
  if (params.has('auth')) {
    const status = params.get('auth');
    if (status === 'ok') {
      Toast.show('Successfully signed in!', 'success');
    } else if (status === 'error') {
      Toast.show(params.get('msg') || 'Authentication failed', 'error');
    }
    // Clean URL
    const url = new URL(window.location);
    url.searchParams.delete('auth');
    url.searchParams.delete('msg');
    window.history.replaceState({}, '', url);
  }

  handleInitialRoute(false);
  observeReveals();
});

// Deep-link: open paper modal from ?paper=<uuid>
window.addEventListener('DOMContentLoaded', () => {
  const paper = new URLSearchParams(window.location.search).get('paper');
  if (paper) {
    setTimeout(() => {
      try { showPage('repo'); } catch { }
      setTimeout(() => openPaperDetail(paper), 250);
    }, 200);
  }
});

window.showPage = showPage;
window.loadAdminSubmissions = loadAdminSubmissions;
window.loadAdminUsers = loadAdminUsers;

// ── CONTACT ────────────────────────────────────────────────────
function initContactPage() {
  const form = document.getElementById('contact-form');
  if (!form || form._wired) return;
  form._wired = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: form.cname?.value?.trim() || '',
      email: form.cemail?.value?.trim() || '',
      subject: form.csubject?.value?.trim() || '',
      message: form.cmessage?.value?.trim() || ''
    };
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    const r = await API.submitContact(payload);
    if (r.ok) {
      form.reset();
      Toast.show('Message sent. We’ll get back to you soon.');
    } else {
      Toast.show(r.error || 'Could not send message.', 'error');
    }
    if (btn) btn.disabled = false;
  });
}
