// Shared AI helpers backed by /api/ai/*. All outputs are labeled
// "AI-generated (offline demo)". Used by chats.js and notes.js.

import { api } from './api.js';
import { $, el, clear, show, hide, toast, announce } from './ui.js';

const AI_LABEL = 'AI-generated (offline demo)';

// ----------------------------------------------------------------- AI result dialog
// A reusable modal that shows a title, a body, optional bullet list and a
// "use this" action. Returns nothing; purely presentational.
function ensureDialog() {
  let dlg = $('#ai-result-dialog');
  if (dlg) return dlg;
  dlg = el('div', {
    id: 'ai-result-dialog', class: 'modal', role: 'dialog',
    'aria-modal': 'true', 'aria-labelledby': 'ai-result-title', hidden: true,
  }, [
    el('div', { class: 'modal__card' }, [
      el('p', { class: 'ai-badge', id: 'ai-result-badge', text: `✦ ${AI_LABEL}` }),
      el('h2', { id: 'ai-result-title', text: 'AI result' }),
      el('div', { id: 'ai-result-body', class: 'ai-result-body' }),
      el('ul', { id: 'ai-result-bullets', class: 'ai-result-bullets' }),
      el('div', { class: 'ai-result-actions' }, [
        el('button', { id: 'ai-result-use', class: 'btn btn--primary', type: 'button', hidden: true }, ['Use this']),
        el('button', { id: 'ai-result-close', class: 'btn btn--secondary', type: 'button' }, ['Close']),
      ]),
    ]),
  ]);
  document.body.appendChild(dlg);

  const close = () => { hide(dlg); if (lastFocus && lastFocus.focus) lastFocus.focus(); };
  $('#ai-result-close', dlg).addEventListener('click', close);
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return dlg;
}

let lastFocus = null;

export function showAiResult({ title, body, bullets, onUse, useLabel }) {
  const dlg = ensureDialog();
  lastFocus = document.activeElement;
  $('#ai-result-title', dlg).textContent = title || 'AI result';

  const bodyEl = $('#ai-result-body', dlg);
  clear(bodyEl);
  if (body) bodyEl.appendChild(el('p', { text: body }));

  const ul = $('#ai-result-bullets', dlg);
  clear(ul);
  if (bullets && bullets.length) {
    for (const b of bullets) ul.appendChild(el('li', { text: b }));
    show(ul);
  } else hide(ul);

  const useBtn = $('#ai-result-use', dlg);
  const newUse = useBtn.cloneNode(true);
  useBtn.replaceWith(newUse);
  if (typeof onUse === 'function') {
    newUse.hidden = false;
    newUse.textContent = useLabel || 'Use this';
    newUse.addEventListener('click', () => { onUse(); hide(dlg); if (lastFocus) lastFocus.focus(); });
  } else {
    newUse.hidden = true;
  }

  show(dlg);
  $('#ai-result-close', dlg).focus();
  announce(`${title || 'AI result'}: ${body || (bullets ? bullets.join('. ') : '')}`);
}

// ----------------------------------------------------------------- tone adjust
const TONES = ['friendly', 'formal', 'concise', 'enthusiastic'];

export function buildTonePicker(getText, setText) {
  // returns a small popover-style group of tone buttons
  const wrap = el('div', { class: 'tone-picker', role: 'group', 'aria-label': 'Adjust tone of your draft', hidden: true });
  for (const tone of TONES) {
    wrap.appendChild(el('button', {
      class: 'tone-chip', type: 'button', 'aria-label': `Rewrite draft in a ${tone} tone`,
      onclick: async () => {
        const text = getText();
        if (!text.trim()) { toast('Type a draft first.'); return; }
        try {
          const { result } = await api.toneAdjust(text, tone);
          setText(result);
          toast(`Tone: ${tone} (AI demo)`);
          announce(`Draft rewritten in a ${tone} tone.`);
        } catch (e) {
          toast(e.message || 'Could not adjust tone.');
        }
        hide(wrap);
      },
    }, [tone]));
  }
  return wrap;
}

// ----------------------------------------------------------------- translate
export async function translateText(text, targetLang = 'es') {
  return api.translate(text, targetLang);
}

// ----------------------------------------------------------------- chat summary
export async function summarizeChat(conversationId) {
  try {
    const { summary, bullets } = await api.chatSummary(conversationId);
    showAiResult({ title: 'Chat summary', body: summary, bullets });
  } catch (e) {
    toast(e.message || 'Could not summarize chat.');
  }
}

export { AI_LABEL };
