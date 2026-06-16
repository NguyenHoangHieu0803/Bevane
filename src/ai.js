'use strict';

/**
 * Bevane — deterministic, fully-offline AI helper.
 *
 * No network, no API key, no randomness. Same input -> same output, so the
 * demo and QA are reproducible.
 *
 *   - generateNote(messages, peerName) : summarize a conversation into a
 *       structured note (summary text + extracted action items).
 *   - smartReply(latestIncoming) : suggest 2–4 short replies to the latest
 *       message received from the other party.
 */

// Keywords that hint a line is "salient" enough to keep in the summary.
const SALIENT_KEYWORDS = [
  'need', "let's", 'lets', 'meet', 'send', 'todo', 'to-do', 'please',
  'can you', 'remember', 'tomorrow', 'today', 'tonight', 'deadline',
  'call', 'plan', 'schedule', 'by ',
];

// Keywords/phrases that mark an actionable item.
const ACTION_KEYWORDS = [
  'need to', "let's", 'lets ', 'please', 'can you', 'could you', 'todo',
  'to-do', 'remember to', 'remember', "don't forget", 'make sure',
  'send me', 'send the', 'follow up', 'follow-up', 'schedule', 'set up',
];

const DAY_TIME_REGEX =
  /\b(\d{1,2}(:\d{2})?\s?(am|pm)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|next week|this week)\b/i;

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fmtTime(ms) {
  // Deterministic UTC formatting, no locale variance.
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/**
 * Build a deterministic summary + action items from ordered message objects.
 *
 * @param {Array<{senderId:string, body:string, createdAt:number}>} messages
 * @param {Object} nameById  map of userId -> displayName
 * @returns {{ title:string, body:string, summary:string, actionItems:string[] }}
 */
function generateNote(messages, nameById = {}) {
  const ordered = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  const count = ordered.length;

  const participantIds = [...new Set(ordered.map((m) => m.senderId))];
  const participantNames = participantIds.map((id) => nameById[id] || 'Someone');

  const first = ordered[0];
  const last = ordered[count - 1];

  // ---- Salient line selection (deterministic) ----
  // Score each line: keyword hits + a small bonus for length, stable by index.
  const scored = ordered.map((m, idx) => {
    const lower = m.body.toLowerCase();
    let score = 0;
    for (const kw of SALIENT_KEYWORDS) if (lower.includes(kw)) score += 2;
    if (lower.includes('?')) score += 1;
    score += Math.min(3, Math.floor(m.body.trim().length / 40)); // length bonus, capped
    return { idx, m, score };
  });

  // Pick up to 3 highest-scoring lines; tie-break by original order for determinism.
  const top = [...scored]
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    .slice(0, 3)
    .sort((a, b) => a.idx - b.idx)
    .map((s) => s.m);

  const salientLines = (top.length ? top : ordered.slice(0, Math.min(3, count))).map((m) => {
    const who = nameById[m.senderId] || 'Someone';
    return `${who}: ${m.body.trim()}`;
  });

  // ---- Action items (deterministic extraction) ----
  const actionItems = [];
  const seen = new Set();
  for (const m of ordered) {
    for (const sentence of splitSentences(m.body)) {
      const lower = sentence.toLowerCase();
      const hasKeyword = ACTION_KEYWORDS.some((kw) => lower.includes(kw));
      const hasWhen = DAY_TIME_REGEX.test(sentence);
      if (hasKeyword || hasWhen) {
        const item = sentence.replace(/\s+/g, ' ').trim();
        const key = item.toLowerCase();
        if (item && !seen.has(key)) {
          seen.add(key);
          actionItems.push(item);
        }
      }
    }
  }

  // ---- Compose summary text (2–5 sentences) ----
  const summaryParts = [];
  summaryParts.push(
    `Conversation between ${participantNames.join(' and ')} with ${count} message${
      count === 1 ? '' : 's'
    }.`
  );
  summaryParts.push(
    `It started at ${fmtTime(first.createdAt)} and the latest message was at ${fmtTime(
      last.createdAt
    )}.`
  );
  if (salientLines.length) {
    summaryParts.push(`Key points — ${salientLines.join(' | ')}.`);
  }
  const summary = summaryParts.join(' ');

  // ---- Note body ----
  const bodyLines = [summary, ''];
  if (actionItems.length) {
    bodyLines.push('Action items:');
    for (const a of actionItems) bodyLines.push(`- ${a}`);
  } else {
    bodyLines.push('Action items: (none detected)');
  }
  const body = bodyLines.join('\n');

  const peerName = participantNames.find((n) => n !== 'Someone') || 'chat';
  const title = `Summary — chat with ${peerName}`;

  return { title, body, summary, actionItems };
}

/**
 * Deterministic smart-reply suggestions for the latest received message.
 *
 * @param {{body:string}|null} latestIncoming
 * @returns {string[]} 2–4 short reply suggestions
 */
function smartReply(latestIncoming) {
  if (!latestIncoming || !latestIncoming.body || !latestIncoming.body.trim()) {
    return ['Hey!', 'What’s up?', 'Talk soon.'];
  }

  const text = latestIncoming.body.trim();
  const lower = text.toLowerCase();
  const suggestions = [];

  const isQuestion = text.endsWith('?') || /\b(what|when|where|who|why|how|can|could|would|should|do you|are you)\b/.test(lower);
  const hasWhen = DAY_TIME_REGEX.test(text);
  const isGreeting = /\b(hi|hey|hello|good morning|good evening|yo)\b/.test(lower);
  const isThanks = /\b(thanks|thank you|thx|appreciate)\b/.test(lower);

  if (isThanks) {
    suggestions.push('You’re welcome!', 'Anytime 🙂', 'Happy to help.');
  } else if (hasWhen) {
    suggestions.push('Works for me!', 'Can we do another time?', 'Let me check and confirm.');
  } else if (isQuestion) {
    suggestions.push('Sounds good!', 'Can you tell me more?', 'Let me check and get back to you.');
  } else if (isGreeting) {
    suggestions.push('Hey! How are you?', 'Hi there 👋', 'Good to hear from you!');
  } else {
    suggestions.push('Got it, thanks!', 'Sounds good.', 'Let’s talk soon.');
  }

  // Always 2–4 non-empty suggestions.
  return suggestions.filter(Boolean).slice(0, 4);
}

// ===========================================================================
// Round-2: additional deterministic, fully-offline AI helpers.
// Same contract: no network, no API key, no randomness — reproducible output.
// ===========================================================================

// Common English stopwords for keyword extraction.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that',
  'these', 'those', 'it', 'its', 'as', 'by', 'from', 'i', 'you', 'he', 'she',
  'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'our', 'their',
  'so', 'if', 'then', 'than', 'too', 'very', 'can', 'will', 'just', 'do',
  'does', 'did', 'have', 'has', 'had', 'not', 'no', 'yes', 'up', 'out', 'about',
  'into', 'over', 'after', 'before', 'all', 'any', 'some', 'more', 'most',
  'there', 'here', 'when', 'where', 'who', 'what', 'which', 'how', 'why',
]);

const VALID_TONES = ['friendly', 'formal', 'concise', 'enthusiastic'];

// Tiny built-in demo phrase map for translate(). Lowercased keys.
const PHRASE_MAP = {
  es: {
    hello: 'hola', hi: 'hola', goodbye: 'adiós', bye: 'adiós', thanks: 'gracias',
    'thank you': 'gracias', please: 'por favor', yes: 'sí', no: 'no',
    'good morning': 'buenos días', 'good night': 'buenas noches',
    friend: 'amigo', love: 'amor', 'how are you': 'cómo estás',
  },
  fr: {
    hello: 'bonjour', hi: 'salut', goodbye: 'au revoir', bye: 'au revoir',
    thanks: 'merci', 'thank you': 'merci', please: "s'il vous plaît",
    yes: 'oui', no: 'non', 'good morning': 'bonjour', 'good night': 'bonne nuit',
    friend: 'ami', love: 'amour', 'how are you': 'comment allez-vous',
  },
  vi: {
    hello: 'xin chào', hi: 'chào', goodbye: 'tạm biệt', bye: 'tạm biệt',
    thanks: 'cảm ơn', 'thank you': 'cảm ơn', please: 'làm ơn', yes: 'vâng',
    no: 'không', 'good morning': 'chào buổi sáng', 'good night': 'chúc ngủ ngon',
    friend: 'bạn', love: 'tình yêu', 'how are you': 'bạn khỏe không',
  },
  de: {
    hello: 'hallo', hi: 'hallo', goodbye: 'auf wiedersehen', bye: 'tschüss',
    thanks: 'danke', 'thank you': 'danke', please: 'bitte', yes: 'ja',
    no: 'nein', 'good morning': 'guten morgen', 'good night': 'gute nacht',
    friend: 'freund', love: 'liebe', 'how are you': 'wie geht es dir',
  },
};

/**
 * Rewrite a draft into a requested tone (deterministic rule-based rewrites).
 * @returns {{ result:string, tone:string }}
 */
function toneAdjust(text, tone) {
  const t = String(text || '').trim();
  let body = t.replace(/\s+/g, ' ');
  switch (tone) {
    case 'friendly':
      body = `Hey! ${body}`;
      if (!/[.!?]$/.test(body)) body += '.';
      body += ' 🙂';
      break;
    case 'formal':
      body = body
        .replace(/\bgonna\b/gi, 'going to')
        .replace(/\bwanna\b/gi, 'want to')
        .replace(/\bcan't\b/gi, 'cannot')
        .replace(/\bdon't\b/gi, 'do not')
        .replace(/\bi'm\b/gi, 'I am')
        .replace(/\bthanks\b/gi, 'thank you');
      body = `Dear recipient, ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
      if (!/[.!?]$/.test(body)) body += '.';
      body += ' Best regards.';
      break;
    case 'concise': {
      // Keep the first sentence, trim filler words.
      const first = splitSentences(body)[0] || body;
      body = first
        .replace(/\b(just|really|very|actually|basically|kind of|sort of)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!/[.!?]$/.test(body)) body += '.';
      break;
    }
    case 'enthusiastic':
      body = body.replace(/[.]+$/, '');
      body = `${body}! That's awesome! 🎉`;
      break;
    default:
      body = t;
  }
  return { result: body.trim(), tone };
}

/**
 * Demo deterministic translation: phrase-map substitution then a [lang] tag
 * fallback. NOT a real translator — clearly a demo.
 * @returns {{ result:string, targetLang:string, sourceLang:string }}
 */
function translate(text, targetLang) {
  const original = String(text || '').trim();
  const lang = String(targetLang || '').toLowerCase();
  const map = PHRASE_MAP[lang];
  let result;
  if (map) {
    let working = original;
    // Replace multi-word phrases first (longest keys), then single words.
    const keys = Object.keys(map).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      working = working.replace(re, map[key]);
    }
    result = working === original ? `${original} [${lang}]` : working;
  } else {
    // Unknown language: passthrough with a tag (demo fallback).
    result = `${original} [${lang || 'xx'}]`;
  }
  return { result, targetLang: lang, sourceLang: 'auto' };
}

/**
 * Extractive summary of free text: pick top-scoring sentences as bullets.
 * @returns {{ summary:string, bullets:string[] }}
 */
function summarizeText(text) {
  const sentences = splitSentences(String(text || ''));
  if (sentences.length === 0) {
    return { summary: '', bullets: [] };
  }
  const scored = sentences.map((s, idx) => {
    const lower = s.toLowerCase();
    let score = 0;
    for (const kw of SALIENT_KEYWORDS) if (lower.includes(kw)) score += 2;
    if (lower.includes('?')) score += 1;
    score += Math.min(3, Math.floor(s.trim().length / 40));
    return { idx, s: s.trim(), score };
  });
  const top = [...scored]
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    .slice(0, Math.min(3, sentences.length))
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.s);
  const bullets = top.length ? top : sentences.slice(0, Math.min(3, sentences.length));
  const summary = bullets.join(' ');
  return { summary, bullets };
}

/**
 * Summarize a conversation's stored messages into summary + bullets.
 * @param {Array<{senderId, body, createdAt}>} messages
 * @param {Object} nameById
 * @returns {{ summary:string, bullets:string[] }}
 */
function chatSummary(messages, nameById = {}) {
  const note = generateNote(messages, nameById);
  // Bullets = action items if present, else the salient "Key points" lines.
  let bullets = note.actionItems.slice(0, 6);
  if (bullets.length === 0) {
    const ordered = [...messages].sort((a, b) => a.createdAt - b.createdAt);
    bullets = ordered.slice(0, 3).map((m) => {
      const who = nameById[m.senderId] || 'Someone';
      return `${who}: ${m.body.trim()}`;
    });
  }
  return { summary: note.summary, bullets };
}

/**
 * Suggest 3–6 deterministic tags (top keywords by frequency, stable order).
 * @returns {string[]}
 */
function smartTags(text) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  const freq = new Map();
  const firstSeen = new Map();
  words.forEach((w, idx) => {
    freq.set(w, (freq.get(w) || 0) + 1);
    if (!firstSeen.has(w)) firstSeen.set(w, idx);
  });
  const tags = [...freq.keys()]
    .sort((a, b) => (freq.get(b) - freq.get(a)) || (firstSeen.get(a) - firstSeen.get(b)))
    .slice(0, 6);
  return tags;
}

/**
 * Extract action items: imperative leads, TODO markers, and checkbox lines.
 * @returns {string[]}
 */
function extractActionItems(text) {
  const lines = String(text || '').split(/\n+/);
  const items = [];
  const seen = new Set();
  const push = (raw) => {
    const item = raw.replace(/\s+/g, ' ').trim();
    const key = item.toLowerCase();
    if (item && !seen.has(key)) { seen.add(key); items.push(item); }
  };
  const IMPERATIVE = /^(call|send|email|buy|finish|review|schedule|book|pay|ask|check|update|prepare|write|fix|remember|follow up|set up|create|order|confirm|reply|share)\b/i;

  for (const line of lines) {
    // Checkbox / TODO markers.
    const checkbox = line.match(/^\s*[-*]?\s*\[\s*[ xX]?\s*\]\s*(.+)$/);
    if (checkbox) { push(checkbox[1]); continue; }
    const todo = line.match(/\b(todo|to-do|action item)\b[:\-\s]*(.+)$/i);
    if (todo && todo[2]) { push(todo[2]); continue; }
    // Sentence-level imperative / keyword scan.
    for (const sentence of splitSentences(line)) {
      const trimmed = sentence.trim();
      const lower = trimmed.toLowerCase();
      const hasKeyword = ACTION_KEYWORDS.some((kw) => lower.includes(kw));
      if (IMPERATIVE.test(trimmed) || hasKeyword) push(trimmed);
    }
  }
  return items;
}

/**
 * Extractive Q&A against a note's text: return the most relevant sentence.
 * @returns {{ answer:string }}
 */
function askAboutNote(text, question) {
  const sentences = splitSentences(String(text || ''));
  const qWords = String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  if (sentences.length === 0 || qWords.length === 0) {
    return { answer: "I couldn't find that in the note." };
  }
  let best = null;
  let bestScore = 0;
  sentences.forEach((s, idx) => {
    const lower = s.toLowerCase();
    let score = 0;
    for (const w of qWords) if (lower.includes(w)) score += 1;
    if (score > bestScore || (score === bestScore && best === null)) {
      if (score > bestScore) { bestScore = score; best = { s: s.trim(), idx }; }
    }
  });
  if (!best || bestScore === 0) {
    return { answer: "I couldn't find that in the note." };
  }
  return { answer: best.s };
}

module.exports = {
  generateNote,
  smartReply,
  // Round-2
  VALID_TONES,
  toneAdjust,
  translate,
  summarizeText,
  chatSummary,
  smartTags,
  extractActionItems,
  askAboutNote,
};
