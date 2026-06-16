// First-launch registration. POST /api/users, persist id, then resolve.

import { api, ApiError } from './api.js';
import { setIdentity, isRegistered } from './state.js';
import { $, show, hide } from './ui.js';

// Returns a promise that resolves once a valid identity exists.
export function ensureRegistered() {
  return new Promise((resolve) => {
    if (isRegistered()) { resolve(); return; }

    const overlay = $('#onboarding');
    const form = $('#onboarding-form');
    const input = $('#display-name');
    const errEl = $('#display-name-error');

    show(overlay);
    input.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.textContent = '';
      const name = input.value.trim();
      if (!name) {
        errEl.textContent = 'Please enter a display name.';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      if (name.length > 40) {
        errEl.textContent = 'Display name must be 40 characters or fewer.';
        input.focus();
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const user = await api.createUser(name);
        setIdentity(user.id, user.displayName);
        input.removeAttribute('aria-invalid');
        hide(overlay);
        resolve();
      } catch (err) {
        submitBtn.disabled = false;
        const msg = err instanceof ApiError ? err.message : 'Could not register. Try again.';
        errEl.textContent = msg;
        input.focus();
      }
    });
  });
}
