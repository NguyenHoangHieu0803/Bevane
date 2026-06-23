// Authentication gate.
// Validates a stored session token, or shows Login / Register tabs until the
// user is authenticated, then resolves the returned promise.

import { api, ApiError } from './api.js';
import { setAuth, loadStoredAuth, state } from './state.js';
import { $, show, hide } from './ui.js';

export function ensureAuthenticated() {
  return new Promise((resolve) => {
    if (loadStoredAuth()) {
      // Token found in storage — validate it with the server.
      api.me()
        .then((user) => {
          state.displayName  = user.displayName;
          state.avatarUrl    = user.avatarUrl    || null;
          state.wallpaperUrl = user.wallpaperUrl || null;
          resolve();
        })
        .catch(() => {
          // Token expired or server restarted — show login form.
          showAuthScreen(resolve);
        });
      return;
    }
    showAuthScreen(resolve);
  });
}

// --------------------------------------------------------------------------
function showAuthScreen(resolve) {
  const overlay = $('#onboarding');
  show(overlay);

  const tabLogin    = $('#auth-tab-login');
  const tabRegister = $('#auth-tab-register');
  const panelLogin  = $('#auth-panel-login');
  const panelReg    = $('#auth-panel-register');

  function switchTab(which) {
    const toLogin = which === 'login';
    tabLogin.setAttribute('aria-selected',    String(toLogin));
    tabLogin.classList.toggle('auth-tab--active', toLogin);
    tabRegister.setAttribute('aria-selected', String(!toLogin));
    tabRegister.classList.toggle('auth-tab--active', !toLogin);
    panelLogin.hidden = !toLogin;
    panelReg.hidden   =  toLogin;
    (toLogin ? $('#login-username') : $('#reg-displayname')).focus();
  }

  tabLogin.addEventListener('click',    () => switchTab('login'));
  tabRegister.addEventListener('click', () => switchTab('register'));

  // Arrow-key navigation between tabs (ARIA tablist pattern).
  [tabLogin, tabRegister].forEach((tab, i, tabs) => {
    tab.addEventListener('keydown', (e) => {
      const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
      if (dir) { e.preventDefault(); const next = tabs[(i + dir + tabs.length) % tabs.length]; next.click(); next.focus(); }
    });
  });

  // ---- Login ----
  const loginForm  = $('#login-form');
  const loginError = $('#login-error');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    const remember = $('#login-remember').checked;
    if (!username || !password) {
      loginError.textContent = 'Please enter your username and password.';
      return;
    }
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const res = await api.login(username, password);
      setAuth(res.id, res.displayName, res.token, remember);
      state.avatarUrl    = res.avatarUrl    || null;
      state.wallpaperUrl = res.wallpaperUrl || null;
      hide(overlay);
      resolve();
    } catch (err) {
      loginError.textContent = err instanceof ApiError ? err.message : 'Could not log in. Try again.';
      btn.disabled = false; btn.textContent = 'Log in';
      $('#login-password').value = '';
      $('#login-username').focus();
    }
  });

  // ---- Register ----
  const regForm  = $('#register-form');
  const regError = $('#register-error');

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    regError.textContent = '';
    const nameInput = $('#reg-displayname').value.trim();
    const username  = $('#reg-username').value.trim();
    const password  = $('#reg-password').value;
    const password2 = $('#reg-password2').value;
    if (!nameInput) { regError.textContent = 'Please enter your display name.'; $('#reg-displayname').focus(); return; }
    if (nameInput.length > 40) { regError.textContent = 'Display name must be 40 characters or fewer.'; $('#reg-displayname').focus(); return; }
    if (!username) { regError.textContent = 'Please enter a username.'; $('#reg-username').focus(); return; }
    if (password.length < 6) { regError.textContent = 'Password must be at least 6 characters.'; $('#reg-password').focus(); return; }
    if (password !== password2) { regError.textContent = 'Passwords do not match.'; $('#reg-password2').focus(); return; }
    const btn = regForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Creating account…';
    try {
      const res = await api.register(username, password, nameInput);
      setAuth(res.id, res.displayName, res.token, true);
      state.avatarUrl    = res.avatarUrl    || null;
      state.wallpaperUrl = res.wallpaperUrl || null;
      hide(overlay);
      resolve();
    } catch (err) {
      regError.textContent = err instanceof ApiError ? err.message : 'Could not register. Try again.';
      btn.disabled = false; btn.textContent = 'Create account';
      $('#reg-username').focus();
    }
  });

  $('#login-username').focus();
}
