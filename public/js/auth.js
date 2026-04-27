/* ============================================================
   DATA VOYAGE — auth.js  v2
   Auth state · Login/Register/Logout · Profile Edit
   Avatar Upload · XP/Badge notifications
   ============================================================ */
'use strict';

// ── AUTH STATE ────────────────────────────────────────────────
const Auth = {
  user: null,

  isLoggedIn() { return !!this.user?.id; },
  isAdmin()    { return this.user?.role === 'admin'; },

  async init() {
    try {
      const res = await API._fetch('/api/auth/me');
      this.user = res.ok ? await res.json() : null;
    } catch { this.user = null; }
    this._updateNav();
    this._updatePages();
  },

  _updateNav() {
    const loginBtn  = document.getElementById('nav-login-btn');
    const userMenu  = document.getElementById('nav-user-menu');
    const userName  = document.getElementById('nav-user-name');
    const adminLink = document.getElementById('nav-admin-link');
    const uploadLnk = document.querySelector('[data-page="upload"]');
    const navAvatar = document.getElementById('nav-avatar-img');

    if (this.isLoggedIn()) {
      if (loginBtn)   loginBtn.style.display  = 'none';
      if (userMenu)   userMenu.style.display  = 'flex';
      if (userName)   userName.textContent    = this.user.name;
      if (adminLink)  adminLink.style.display = this.isAdmin() ? 'inline-flex' : 'none';
      if (uploadLnk)  uploadLnk.style.display = 'inline-flex';
      // Nav avatar
      if (navAvatar) {
        if (this.user.avatar_url) {
          navAvatar.src   = this.user.avatar_url;
          navAvatar.style.display = 'block';
          navAvatar.closest('.nav-avatar').querySelector('.nav-avatar-initials')?.remove?.();
        } else {
          navAvatar.style.display = 'none';
        }
      }
    } else {
      if (loginBtn)  loginBtn.style.display = 'inline-flex';
      if (userMenu)  userMenu.style.display = 'none';
      if (adminLink) adminLink.style.display = 'none';
      if (uploadLnk) uploadLnk.style.display = 'none';
    }
  },

  _updatePages() {
    const uploadGate = document.querySelector('#page-upload .upload-gate');
    const uploadCont = document.querySelector('#page-upload .upload-content');
    if (uploadGate && uploadCont) {
      uploadGate.style.display = this.isLoggedIn() ? 'none' : 'flex';
      uploadCont.style.display = this.isLoggedIn() ? 'block' : 'none';
    }
    const adminGate = document.querySelector('#page-admin .admin-gate');
    const adminCont = document.querySelector('#page-admin .admin-layout');
    if (adminGate && adminCont) {
      adminGate.style.display = this.isAdmin() ? 'none' : 'flex';
      adminCont.style.display = this.isAdmin() ? 'flex' : 'none';
    }
  },

  async logout() {
    await API._fetch('/api/auth/logout', { method: 'POST' });
    API.clearCsrfToken();
    this.user = null;
    this._updateNav();
    this._updatePages();
    showPage('home');
    Toast.show('Signed out successfully.', 'info');
  }
};

// ── TOAST ─────────────────────────────────────────────────────
const Toast = {
  show(message, type = 'success', duration = 3800) {
    document.querySelector('.dv-toast')?.remove();
    const icons = { success:'✓', error:'✕', info:'ℹ', badge:'🏅' };
    const t = document.createElement('div');
    t.className = `dv-toast dv-toast-${type}`;
    t.innerHTML = `<span class="dv-toast-icon">${icons[type]||'✓'}</span><span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('dv-toast-visible'));
    setTimeout(() => { t.classList.remove('dv-toast-visible'); setTimeout(() => t.remove(), 400); }, duration);
  },
  badge(badgeName) {
    this.show(`Badge unlocked: <strong>${badgeName}</strong>`, 'badge', 5000);
  }
};

// ── MODALS ────────────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.style.display = 'flex';
  requestAnimationFrame(() => m.classList.add('modal-open'));
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('modal-open');
  setTimeout(() => { m.style.display = 'none'; document.body.style.overflow = ''; }, 280);
}

// Data-attribute driven modal controls (no inline JS)
document.addEventListener('click', (e) => {
  const openBtn = e.target.closest('[data-open-modal]');
  if (openBtn) {
    e.preventDefault();
    const id = openBtn.dataset.openModal;
    if (id) openModal(id);
    return;
  }

  const closeBtn = e.target.closest('[data-close-modal]');
  if (closeBtn) {
    e.preventDefault();
    const m = closeBtn.closest('.modal-backdrop');
    if (m?.id) closeModal(m.id);
    return;
  }

  const closeOpen = e.target.closest('[data-close-open-modals]');
  if (closeOpen) {
    e.preventDefault();
    const spec = closeOpen.dataset.closeOpenModals || '';
    const [from, to] = spec.split(':').map(s => (s || '').trim());
    if (from) closeModal(from);
    if (to) setTimeout(() => openModal(to), 300);
    return;
  }

  const pwBtn = e.target.closest('.pw-toggle');
  if (pwBtn) {
    e.preventDefault();
    togglePw(pwBtn);
  }
});

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) closeModal(e.target.id);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-backdrop.modal-open').forEach(m => closeModal(m.id));
});

// ── FORM HELPERS ──────────────────────────────────────────────
function setLoading(form, on) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = on;
  btn.dataset.orig = btn.dataset.orig || btn.innerHTML;
  btn.innerHTML = on ? '<span class="btn-spinner"></span> Loading…' : btn.dataset.orig;
}
function setError(form, msg) {
  let el = form.querySelector('.form-error-msg');
  if (!el) { el = document.createElement('div'); el.className = 'form-error-msg'; form.prepend(el); }
  el.textContent = msg; el.style.display = 'block';
}
function clearError(form) {
  const el = form.querySelector('.form-error-msg');
  if (el) el.style.display = 'none';
}

function setFieldError(input, message) {
  if (!input) return;
  const group = input.closest('.form-group');
  if (!group) return;
  group.classList.remove('has-success');
  group.classList.add('has-error');
  let hint = group.querySelector('.field-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'field-hint';
    group.appendChild(hint);
  }
  hint.textContent = message || '';
  hint.classList.remove('field-success');
  hint.classList.add('field-error');
}

function setFieldSuccess(input, message) {
  if (!input) return;
  const group = input.closest('.form-group');
  if (!group) return;
  group.classList.remove('has-error');
  group.classList.add('has-success');
  let hint = group.querySelector('.field-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'field-hint';
    group.appendChild(hint);
  }
  hint.textContent = message || '';
  hint.classList.remove('field-error');
  hint.classList.add('field-success');
}

function clearFieldState(form) {
  form.querySelectorAll('.form-group.has-error,.form-group.has-success').forEach(g => {
    g.classList.remove('has-error','has-success');
    const hint = g.querySelector('.field-hint');
    if (hint) hint.textContent = '';
  });
}

// ── LOGIN ─────────────────────────────────────────────────────
document.getElementById('login-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target; clearError(f); clearFieldState(f); setLoading(f, true);
  try {
    const r = await API._fetch('/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email: f.email.value.trim(), password: f.password.value })
    });
    const j = await r.json();
    if (r.ok) {
      const me = await API._fetch('/api/auth/me');
      Auth.user = me.ok ? await me.json() : { name: j.name, role: j.role };
      Auth._updateNav(); Auth._updatePages();
      closeModal('modal-login'); f.reset();
      Toast.show(`Welcome back, ${j.name}!`);
      const next = new URLSearchParams(window.location.search).get('next');
      if (next === '/upload') showPage('upload');
      else if (next === '/admin' && Auth.isAdmin()) showPage('admin');
    } else { setError(f, j.error || 'Login failed.'); }
  } catch { setError(f, 'Network error. Please try again.'); }
  finally  { setLoading(f, false); }
});

// ── REGISTER ──────────────────────────────────────────────────
document.getElementById('register-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target; clearError(f); clearFieldState(f);
  if (f.password.value !== f.password2.value) {
    setError(f, 'Passwords do not match.');
    setFieldError(f.password2, 'Passwords do not match.');
    return;
  }
  setLoading(f, true);
  try {
    const r = await API._fetch('/api/auth/register', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        name: `${f.first_name.value.trim()} ${f.last_name.value.trim()}`.trim(), email: f.email.value.trim(),
        password: f.password.value, department: f.department.value.trim()
      })
    });
    const j = await r.json();
    if (r.ok) {
      const me = await API._fetch('/api/auth/me');
      Auth.user = me.ok ? await me.json() : { name: j.name, role: j.role };
      Auth._updateNav(); Auth._updatePages();
      closeModal('modal-register'); f.reset();
      Toast.show(`Welcome to Data Voyage, ${j.name}!`);
      setTimeout(() => Toast.show('Badge unlocked: Welcome Aboard!', 'info', 4500), 1500);
    } else { setError(f, j.error || 'Registration failed.'); }
  } catch { setError(f, 'Network error. Please try again.'); }
  finally  { setLoading(f, false); }
});

// ── DYNAMIC FORMS (rendered after load) ────────────────────────
document.addEventListener('submit', async e => {
  const f = e.target;

  // Profile edit
  if (f && f.id === 'profile-edit-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    const data = {
      name:       f.pname.value.trim(),
      department: f.pdepartment.value.trim(),
      bio:        f.pbio.value.trim(),
      website:    f.pwebsite?.value?.trim() || '',
      twitter:    f.ptwitter?.value?.trim() || ''
    };
    try {
      const r = await API._fetch('/api/users/profile', {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      const j = await r.json();
      if (r.ok) {
        Auth.user = { ...Auth.user, ...j };
        Auth._updateNav();
        Toast.show('Profile updated successfully!');
        if (typeof renderOwnProfile === 'function') renderOwnProfile();
      } else { setError(f, j.error || 'Update failed.'); }
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  // Change password
  if (f && f.id === 'change-password-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    if (f.newPassword.value !== f.confirmNewPassword.value) {
      setError(f, 'New passwords do not match.');
      setFieldError(f.confirmNewPassword, 'New passwords do not match.');
      setLoading(f, false);
      return;
    }
    try {
      const r = await API._fetch('/api/auth/change-password', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          currentPassword: f.currentPassword.value,
          newPassword: f.newPassword.value,
          confirmNewPassword: f.confirmNewPassword.value
        })
      });
      const j = await r.json();
      if (r.ok) {
        f.reset();
        Toast.show('Password updated.');
      } else setError(f, j.error || 'Could not change password.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  // Forgot password
  if (f && f.id === 'forgot-password-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    try {
      const r = await API._fetch('/api/auth/forgot-password', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: f.email.value.trim() })
      });
      const j = await r.json();
      if (r.ok) {
        const hint = j.resetUrl ? `Reset link: ${j.resetUrl}` : 'If the email exists, a reset link has been issued.';
        Toast.show(hint, 'info', 8000);
        closeModal('modal-forgot-password');
        f.reset();
      } else setError(f, j.error || 'Could not start reset.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  // Reset password page
  if (f && f.id === 'reset-password-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    if (f.newPassword.value !== f.confirmNewPassword.value) {
      setError(f, 'New passwords do not match.');
      setFieldError(f.confirmNewPassword, 'New passwords do not match.');
      setLoading(f, false);
      return;
    }
    try {
      const r = await API._fetch('/api/auth/reset-password', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          token: f.token.value,
          newPassword: f.newPassword.value,
          confirmNewPassword: f.confirmNewPassword.value
        })
      });
      const j = await r.json();
      if (r.ok) {
        f.reset();
        Toast.show('Password reset successfully. Please sign in.', 'success', 5000);
        showPage('home');
        openModal('modal-login');
      } else setError(f, j.error || 'Reset failed.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  // Settings form
  if (f && f.id === 'settings-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    try {
      const payload = {
        notify_paper_status: !!f.notify_paper_status.checked,
        notify_platform: !!f.notify_platform.checked,
        default_research_domain: f.default_research_domain.value === 'all' ? null : f.default_research_domain.value,
        ui_theme: f.ui_theme.value,
        ui_density: f.ui_density.value,
        ui_reduced_motion: !!f.ui_reduced_motion.checked,
      };
      const j = await API.updateMySettings(payload);
      if (j.ok) {
        window.__dvSetUserSettings?.({ ...(j.settings || payload) });
        Toast.show('Settings saved.');
      } else setError(f, j.error || 'Could not save settings.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  // Settings page forms
  if (f && f.id === 'settings-profile-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    try {
      const r = await API._fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name.value.trim(),
          department: f.department.value.trim(),
          bio: f.bio.value.trim()
        })
      });
      const j = await r.json();
      if (r.ok) {
        Auth.user = { ...Auth.user, ...j };
        Auth._updateNav();
        Toast.show('Profile updated.');
      } else setError(f, j.error || 'Update failed.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  if (f && f.id === 'settings-localization-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    try {
      const j = await API.updateMySettings({
        language: f.language.value.trim() || null,
        time_zone: f.time_zone.value.trim() || null
      });
      if (j.ok) {
        window.__dvSetUserSettings?.({ ...(j.settings || {}) });
        Toast.show('Localization saved.');
        setFieldSuccess(f.language, 'Saved');
        setFieldSuccess(f.time_zone, 'Saved');
      } else setError(f, j.error || 'Save failed.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  if (f && f.id === 'settings-appearance-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    try {
      const j = await API.updateMySettings({
        ui_theme: f.ui_theme.value,
        ui_density: f.ui_density.value,
        font_scale: f.font_scale.value,
        ui_reduced_motion: !!f.ui_reduced_motion.checked
      });
      if (j.ok) {
        window.__dvSetUserSettings?.({ ...(j.settings || {}) });
        Toast.show('Appearance saved.');
        setFieldSuccess(f.ui_theme, 'Saved');
        setFieldSuccess(f.ui_density, 'Saved');
        setFieldSuccess(f.font_scale, 'Saved');
      } else setError(f, j.error || 'Save failed.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  if (f && f.id === 'settings-2fa-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    try {
      const j = await API.updateMySettings({ two_factor_enabled: !!f.two_factor_enabled.checked });
      if (j.ok) {
        window.__dvSetUserSettings?.({ ...(j.settings || {}) });
        Toast.show('Security setting saved.');
      } else setError(f, j.error || 'Save failed.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  if (f && f.id === 'settings-change-email-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    try {
      const j = await API.changeEmail(f.newEmail.value.trim(), f.password.value);
      if (j.ok) {
        Toast.show('Check your new email inbox to confirm the change.', 'info', 6000);
        setFieldSuccess(f.newEmail, 'Verification link sent');
      } else setError(f, j.error || 'Change email failed.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  if (f && f.id === 'settings-notifications-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    try {
      const j = await API.updateMySettings({
        notify_email: !!f.notify_email.checked,
        notify_sms: !!f.notify_sms.checked,
        notify_push: !!f.notify_push.checked,
        notify_digest: f.notify_digest.value,
        notify_paper_status: !!f.notify_paper_status.checked,
      });
      if (j.ok) {
        window.__dvSetUserSettings?.({ ...(j.settings || {}) });
        Toast.show('Notifications saved.');
        setFieldSuccess(f.notify_digest, 'Saved');
      } else setError(f, j.error || 'Save failed.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  if (f && f.id === 'settings-privacy-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    try {
      const j = await API.updateMySettings({
        profile_public: !!f.profile_public.checked,
        data_sharing: !!f.data_sharing.checked,
        usage_tracking: !!f.usage_tracking.checked,
      });
      if (j.ok) {
        window.__dvSetUserSettings?.({ ...(j.settings || {}) });
        Toast.show('Privacy saved.');
      } else setError(f, j.error || 'Save failed.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }

  if (f && f.id === 'settings-delete-account-form') {
    e.preventDefault();
    clearError(f); clearFieldState(f); setLoading(f, true);
    if (!confirm('Delete your account permanently? This cannot be undone.')) { setLoading(f, false); return; }
    try {
      const j = await API.deleteMyAccount(f.password.value);
      if (j.ok) {
        Toast.show('Account deleted.');
        Auth.user = null; Auth._updateNav(); Auth._updatePages();
        showPage('home');
      } else setError(f, j.error || 'Delete failed.');
    } catch { setError(f, 'Network error.'); }
    finally { setLoading(f, false); }
  }
});

// ── AVATAR UPLOAD ─────────────────────────────────────────────
async function handleAvatarUpload(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { Toast.show('Image must be under 5MB.', 'error'); return; }

  const fd = new FormData();
  fd.append('avatar', file);

  const r = await API._fetch('/api/users/avatar', { method:'POST', body:fd });
  const j = await r.json();
  if (r.ok) {
    Auth.user = { ...Auth.user, avatar_url: j.avatar_url };
    Auth._updateNav();
    // Update all avatar previews on the page
    document.querySelectorAll('.avatar-preview, .profile-avatar-large').forEach(el => {
      if (el.tagName === 'IMG') { el.src = j.avatar_url; }
      else {
        el.style.backgroundImage = `url(${j.avatar_url})`;
        el.style.backgroundSize  = 'cover';
        el.style.backgroundPosition = 'center';
        el.innerHTML = `<img src="${j.avatar_url}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
      }
    });
    Toast.show('Profile picture updated!');
  } else { Toast.show(j.error || 'Upload failed.', 'error'); }
}

async function removeAvatar() {
  const r = await API._fetch('/api/users/avatar', { method:'DELETE' });
  if (r.ok) {
    Auth.user = { ...Auth.user, avatar_url: null };
    Auth._updateNav();
    Toast.show('Avatar removed.');
    if (typeof renderOwnProfile === 'function') renderOwnProfile();
  }
}

// Wire all avatar file inputs
document.addEventListener('change', e => {
  if (e.target.classList.contains('avatar-file-input')) {
    handleAvatarUpload(e.target.files[0]);
  }
});

// ── UPLOAD RESEARCH ───────────────────────────────────────────
document.getElementById('upload-research-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!Auth.isLoggedIn()) { openModal('modal-login'); return; }
  const f = e.target; clearError(f); setLoading(f, true);
  try {
    const r = await API._fetch('/api/research', { method:'POST', body: new FormData(f) });
    const j = await r.json();
    if (r.ok) {
      f.reset();
      Toast.show('Research submitted for review! +5 rep, +20 XP ✓');
      showPage('mypapers');
    } else { setError(f, j.error || 'Submission failed.'); }
  } catch { setError(f, 'Network error. Please try again.'); }
  finally  { setLoading(f, false); }
});

// ── MODAL SWITCHER ────────────────────────────────────────────
document.querySelectorAll('[data-switch-modal]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const from = el.closest('.modal-backdrop');
    const to   = el.dataset.switchModal;
    if (from) closeModal(from.id);
    setTimeout(() => openModal(to), 300);
  });
});

// Password toggle
function togglePw(btn) {
  const inp = btn.previousElementSibling;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.innerHTML = inp.type === 'password'
    ? '<span class="iconify" data-icon="mdi:eye-outline"></span>'
    : '<span class="iconify" data-icon="mdi:eye-off-outline"></span>';
}

// ── EXPOSE ────────────────────────────────────────────────────
window.Auth              = Auth;
window.openModal         = openModal;
window.closeModal        = closeModal;
window.Toast             = Toast;
window.togglePw          = togglePw;
window.removeAvatar      = removeAvatar;
window.handleAvatarUpload = handleAvatarUpload;
