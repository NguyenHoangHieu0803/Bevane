'use strict';

// Password hashing with Node.js built-in crypto.scryptSync.
// No external packages needed.

const crypto = require('crypto');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64; // 64-byte output → 128 hex chars

function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const colon = stored.indexOf(':');
    const salt = stored.slice(0, colon);
    const hash = stored.slice(colon + 1);
    const attempt = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
