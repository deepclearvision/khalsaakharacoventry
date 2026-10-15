/* ════════════════════════════════════════════════════════════════════
   KHALSA AKHARA WRESTLING COVENTRY — server.js
   Zero-dependency Node backend: static site + membership API + admin.
   Run:  node server.js                 (starts on http://127.0.0.1:8000)
         node server.js --set-password  (change the admin password)
         node server.js --set-email-key (save a Resend API key to config.json)
   ════════════════════════════════════════════════════════════════════ */
'use strict';

const http   = require('node:http');
const https  = require('node:https');
const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT     = __dirname;
const PORT     = parseInt(process.env.PORT || '8000', 10);
const HOST     = process.env.HOST || '127.0.0.1';
const CONFIG   = path.join(ROOT, 'config.json');
const DB_FILE  = path.join(ROOT, 'data', 'club.db');
const SESSION_TTL = 24 * 60 * 60 * 1000;   // 24 hours

/* Cloud-mode switches (set on Render via env vars) */
const TRUST_PROXY    = process.env.TRUST_PROXY === '1';   // use X-Forwarded-For for rate limiting
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';  // overrides the default at first boot

/* ─────────────────────────── config.json ─────────────────────────── */
const DEFAULT_PASSWORD = 'KhalsaAkhara2026!';

function hashPassword(salt, password) {
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}

function ensureConfig() {
  if (fs.existsSync(CONFIG)) return;
  const salt = crypto.randomBytes(16).toString('hex');
  const pw   = ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const cfg = { salt, passwordHash: hashPassword(salt, pw) };
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
  console.log('config.json created.');
  console.log('  Admin password: ' + (ADMIN_PASSWORD ? '(from ADMIN_PASSWORD env var)' : DEFAULT_PASSWORD));
  console.log('  Change it any time with: node server.js --set-password <new-password>');
}

/* CLI: node server.js --set-password <new> */
if (process.argv[2] === '--set-password') {
  const next = process.argv[3];
  if (!next || next.length < 8) {
    console.error('Usage: node server.js --set-password <new-password>  (min 8 chars)');
    process.exit(1);
  }
  ensureConfig();
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  cfg.passwordHash = hashPassword(cfg.salt, next);
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
  console.log('Admin password updated.');
  process.exit(0);
}

/* CLI: node server.js --set-email-key <resend-key> */
if (process.argv[2] === '--set-email-key') {
  const key = process.argv[3];
  if (!key || key.length < 8) {
    console.error('Usage: node server.js --set-email-key <resend-api-key>');
    process.exit(1);
  }
  ensureConfig();
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  cfg.email = Object.assign({}, cfg.email, { apiKey: key });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
  console.log('Resend API key saved to config.json (config.json is kept private).');
  process.exit(0);
}

ensureConfig();
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

/* ─────────────────────────── email settings ──────────────────────── */
/* Priority: env var → config.json → sensible default. No key = no email. */
const RESEND_API_KEY = process.env.RESEND_API_KEY || (config.email && config.email.apiKey) || '';
const EMAIL_FROM     = process.env.EMAIL_FROM || (config.email && config.email.from) || 'Khalsa Akhara Wrestling Coventry <onboarding@resend.dev>';
const SITE_URL       = (process.env.SITE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const GOCARDLESS_URL = process.env.GOCARDLESS_URL || 'https://manage.gocardless.com';   // placeholder until the real plan link exists
const NOTIFY_EMAIL   = process.env.NOTIFY_EMAIL || '';   // optional: the club is told about every new sign-up

/* ─────────────────────────── database ────────────────────────────── */
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    wrestler_name  TEXT NOT NULL,
    dob            TEXT NOT NULL,                     -- YYYY-MM-DD
    under16        INTEGER NOT NULL DEFAULT 0,
    weight_kg      TEXT,
    guardian_name  TEXT,
    guardian_phone TEXT,
    guardian_email TEXT,
    phone          TEXT,                              -- primary contact (guardian for U16)
    email          TEXT,                              -- primary contact
    notes          TEXT DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'Pending',   -- Pending | Active
    paid_month     TEXT,                              -- 'YYYY-MM' of last recorded payment
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE TABLE IF NOT EXISTS prospects (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    wrestler_name TEXT,
    wrestler_age  TEXT,
    status        TEXT NOT NULL DEFAULT 'New',        -- New | Contacted
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    phone      TEXT,
    subject    TEXT,
    body       TEXT NOT NULL,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
`);

const Q = {
  insMember:    db.prepare(`INSERT INTO members (wrestler_name, dob, under16, weight_kg, guardian_name, guardian_phone, guardian_email, phone, email) VALUES (?,?,?,?,?,?,?,?,?)`),
  insProspect:  db.prepare(`INSERT INTO prospects (name, email, wrestler_name, wrestler_age) VALUES (?,?,?,?)`),
  insMessage:   db.prepare(`INSERT INTO messages (name, email, phone, subject, body) VALUES (?,?,?,?,?)`),
  allMembers:   db.prepare(`SELECT * FROM members ORDER BY id DESC`),
  allProspects: db.prepare(`SELECT * FROM prospects ORDER BY id DESC`),
  allMessages:  db.prepare(`SELECT * FROM messages ORDER BY id DESC`),
  getMember:    db.prepare(`SELECT id FROM members WHERE id = ?`),
  getMemberFull:db.prepare(`SELECT * FROM members WHERE id = ?`),
  getProspect:  db.prepare(`SELECT id FROM prospects WHERE id = ?`),
  getMessage:   db.prepare(`SELECT id FROM messages WHERE id = ?`),
  patchMember:  db.prepare(`UPDATE members SET status = ? WHERE id = ?`),
  patchProspect:db.prepare(`UPDATE prospects SET status = ? WHERE id = ?`),
  patchMessage: db.prepare(`UPDATE messages SET read = ? WHERE id = ?`),
  payMember:    db.prepare(`UPDATE members SET paid_month = ? WHERE id = ?`),
  delMember:    db.prepare(`DELETE FROM members WHERE id = ?`),
  delProspect:  db.prepare(`DELETE FROM prospects WHERE id = ?`),
  delMessage:   db.prepare(`DELETE FROM messages WHERE id = ?`),
};

/* ─────────────────────────── validation ──────────────────────────── */
function vString(val, label, opts) {
  const o = opts || {};
  const max = o.max || 200;
  if (typeof val !== 'string') return label + ' is required.';
  const v = val.trim();
  if (!v) return label + ' is required.';
  if (v.length > max) return label + ' is too long (max ' + max + ' chars).';
  return { v };
}

function vEmail(val, label) {
  if (typeof val !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.trim())) {
    return 'Please enter a valid ' + label.toLowerCase() + '.';
  }
  return { v: val.trim().toLowerCase() };
}

function vPhone(val, label) {
  if (typeof val !== 'string') return label + ' is required.';
  const digits = val.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return 'Please enter a valid ' + label.toLowerCase() + '.';
  return { v: val.trim() };
}

function vDob(val, label) {
  if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'Please enter a valid ' + label.toLowerCase() + ' (YYYY-MM-DD).';
  const d = new Date(val + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== val) return 'Please enter a valid ' + label.toLowerCase() + '.';
  if (d.getTime() > Date.now()) return label + ' cannot be in the future.';
  if (d.getFullYear() < 1900) return label + ' is not valid.';
  return { v: val };
}

function ageFromDob(dob) {
  const d = new Date(dob + 'T00:00:00Z');
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const before = (now.getMonth() < d.getMonth()) ||
                 (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (before) age--;
  return age;
}

function vWeight(val, label) {
  if (val === undefined || val === null || String(val).trim() === '') return null; // optional
  const w = parseFloat(val);
  if (Number.isNaN(w) || w < 15 || w > 300) return 'Please enter a ' + label.toLowerCase() + ' between 15 and 300 kg.';
  return { v: String(w) };
}

function vEnum(val, list, label) {
  if (!list.includes(val)) return 'Invalid ' + label.toLowerCase() + '.';
  return { v: val };
}

function vAge(val, label) {
  if (typeof val !== 'string' || !/^\d{1,2}$/.test(val.trim())) return 'Please enter a valid ' + label.toLowerCase() + '.';
  const a = parseInt(val, 10);
  if (a < 3 || a > 99) return 'Please enter a ' + label.toLowerCase() + ' between 3 and 99.';
  return { v: String(a) };
}

/* Collect field errors: returns {values, errors} */
function collect(spec, body) {
  const values = {};
  const errors = {};
  for (const [field, check] of Object.entries(spec)) {
    const r = check(body[field]);
    if (r === null) continue;               // optional, skipped
    if (typeof r === 'string') errors[field] = r;
    else values[field] = r.v;
  }
  return { values, errors };
}

/* ─────────────────────────── auth / sessions ─────────────────────── */
const sessions = new Map();   // token -> expiry timestamp

function verifyPassword(password) {
  if (typeof password !== 'string') return false;
  const a = Buffer.from(hashPassword(config.salt, password), 'hex');
  const b = Buffer.from(config.passwordHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function makeSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

function cookieHeader(token, maxAge) {
  let c = 'ka_session=' + token + '; Path=/; HttpOnly; SameSite=Lax' + (maxAge === 0 ? '; Max-Age=0' : '; Max-Age=' + SESSION_TTL / 1000);
  return c;
}

function sessionFrom(req) {
  const raw = req.headers.cookie || '';
  const pair = raw.split(';').map(s => s.trim()).find(s => s.startsWith('ka_session='));
  if (!pair) return null;
  const token = pair.slice('ka_session='.length);
  const expiry = sessions.get(token);
  if (!expiry) return null;
  if (expiry < Date.now()) { sessions.delete(token); return null; }
  sessions.set(token, Date.now() + SESSION_TTL); // sliding expiry
  return token;
}

/* ─────────────────────────── rate limiting ───────────────────────── */
const buckets = new Map();  // key -> { count, windowStart }

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.windowStart > windowMs) {
    b = { count: 0, windowStart: now };
    buckets.set(key, b);
  }
  b.count++;
  return b.count <= max;
}

setInterval(function () {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (now - b.windowStart > 30 * 60 * 1000) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

/* ─────────────────────────── http helpers ────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.m4a':  'audio/mp4',
  '.mp4':  'video/mp4',
  '.pdf':  'application/pdf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

/* ─────────────────────────── static files ────────────────────────── */
function serveStatic(res, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); }
  catch (e) { return notFound(res); }

  if (p === '/admin' || p === '/admin/') p = '/admin.html';

  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return forbidden(res);

  /* never serve server internals */
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel.startsWith('data/') || rel === 'config.json' || rel === 'server.js' || rel === 'README.md') {
    return notFound(res);
  }

  let stat;
  try { stat = fs.statSync(file); }
  catch (e) { return notFound(res); }

  if (stat.isDirectory()) {
    const idx = path.join(file, 'index.html');
    try { stat = fs.statSync(idx); }
    catch (e) { return notFound(res); }
    return sendFile(res, idx, stat, 'text/html; charset=utf-8');
  }

  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  sendFile(res, file, stat, mime);
}

function sendFile(res, file, stat, mime) {
  const isHtml = mime.startsWith('text/html');
  const isMedia = mime.startsWith('audio/') || mime.startsWith('video/');
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': isHtml ? 'no-store' : ('public, max-age=' + (isMedia ? 86400 : 3600)),
  });
  fs.createReadStream(file).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 — not found');
}

function forbidden(res) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('403 — forbidden');
}

/* ─────────────────────────── welcome emails ──────────────────────── */
/* Fire-and-forget via api.resend.com (zero extra dependencies).
   Silently skipped when no RESEND_API_KEY is configured. */
function postEmail(payload) {
  const body = JSON.stringify(payload);
  const req = https.request({
    hostname: 'api.resend.com',
    path: '/emails',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, function (r) {
    let data = '';
    r.on('data', function (c) { data += c; });
    r.on('end', function () {
      if (r.statusCode >= 200 && r.statusCode < 300) {
        console.log('[email] sent to ' + payload.to.join(', '));
      } else {
        console.error('[email] failed (' + r.statusCode + '): ' + data.slice(0, 300));
      }
    });
  });
  req.on('error', function (err) { console.error('[email] error: ' + err.message); });
  req.setTimeout(10000, function () { req.destroy(new Error('timeout')); });
  req.end(body);
}

function welcomeHtml(member) {
  const under16  = member.under16 === 1;
  const wrestler = String(member.wrestler_name || '');
  const guardian = String(member.guardian_name || '');
  const who      = under16 ? (guardian || wrestler) : wrestler;
  const onboarding = SITE_URL + '/docs/member-onboarding.html';
  const site       = SITE_URL + '/index.html';
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1d1d23;line-height:1.6">' +
    '<div style="background:linear-gradient(90deg,#ffa62b,#d95f00);height:8px"></div>' +
    '<div style="padding:28px 30px;border:1px solid #e4ded2;border-top:0">' +
    '<h1 style="font-size:24px;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px">Welcome to the <span style="color:#d95f00">Akhara</span>! 🥇</h1>' +
    '<p>Dear <strong>' + escHtml(who) + '</strong>,</p>' +
    '<p>Thank you for signing ' + (under16 ? '<strong>' + escHtml(wrestler) + '</strong>' : 'yourself') + ' up for <strong>Khalsa Akhara Wrestling Coventry</strong> — Coventry&rsquo;s home of traditional Punjabi wrestling. You are now part of the family, and we can&rsquo;t wait to see you on the mat.</p>' +
    '<h2 style="font-size:16px;margin:22px 0 8px;text-transform:uppercase">What happens next</h2>' +
    '<ol style="margin:0 0 18px;padding-left:20px">' +
    '<li>The club will be in touch shortly with your first session details — what to wear, where to come and what to expect.</li>' +
    '<li>Read the <a href="' + onboarding + '" style="color:#d95f00;font-weight:bold">Member Onboarding Pack</a> to get ready for your first session.</li>' +
    '<li>Set up your monthly direct debit with GoCardless so your £30 membership runs smoothly from the 1st of each month.</li>' +
    '</ol>' +
    '<p style="margin:22px 0 8px"><a href="' + GOCARDLESS_URL + '" style="display:inline-block;background:linear-gradient(135deg,#ffa62b,#f09000 45%,#d95f00);color:#160b00;font-weight:bold;text-decoration:none;padding:14px 30px;border-radius:3px;text-transform:uppercase;letter-spacing:1px">Set Up Your Direct Debit</a></p>' +
    '<p style="font-size:13px;color:#6b6760">This is a placeholder link — the club will share the official GoCardless page very soon.</p>' +
    '<p style="margin-top:22px">Any questions — about safety, payments or anything at all? Speak to our welfare officers, <strong>Gurpreet Singh</strong> and <strong>H S Dhaliwal</strong>, or message the club any time.</p>' +
    '<p style="margin-top:22px;border-top:1px solid #e4ded2;padding-top:16px;font-size:13px;color:#6b6760">' +
    '<a href="' + site + '" style="color:#d95f00">' + escHtml(SITE_URL) + '</a> • ' +
    '<a href="https://www.facebook.com/khalsaakharagym" style="color:#d95f00">Facebook</a> • ' +
    '<a href="https://www.instagram.com/khalsaakharawrestling/" style="color:#d95f00">Instagram</a> • ' +
    '<a href="https://www.youtube.com/@CoventryWrestling" style="color:#d95f00">YouTube</a><br>' +
    'Khalsa Akhara Wrestling Coventry — 35-50 Cross Rd, Coventry CV6 5GU</p>' +
    '<p style="font-size:14px;color:#6b6760">ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ</p>' +
    '</div></div>';
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function sendWelcomeEmail(member) {
  if (!RESEND_API_KEY) {
    console.log('[email] skipped — no RESEND_API_KEY configured (set it via env var or --set-email-key).');
    return;
  }
  const under16 = member.under16 === 1;
  const toAddr  = String(member.email || '');   // primary contact (guardian for U16)
  if (!toAddr) { console.log('[email] skipped — no contact email on record.'); return; }

  postEmail({
    from: EMAIL_FROM,
    to: [toAddr],
    subject: 'Welcome to Khalsa Akhara Wrestling Coventry' + (under16 ? ' — ' + member.wrestler_name : '') + ' 🥇',
    html: welcomeHtml(member),
  });

  /* optional heads-up to the club */
  if (NOTIFY_EMAIL) {
    postEmail({
      from: EMAIL_FROM,
      to: [NOTIFY_EMAIL],
      subject: 'New member sign-up: ' + member.wrestler_name,
      html: '<p>New membership form submission:</p>' +
        '<ul>' +
        '<li>Wrestler: <strong>' + escHtml(member.wrestler_name) + '</strong></li>' +
        '<li>Under 16: ' + (under16 ? 'yes' : 'no') + '</li>' +
        '<li>Contact: ' + escHtml(toAddr) + '</li>' +
        '<li>Phone: ' + escHtml(member.phone || '') + '</li>' +
        '<li>DOB: ' + escHtml(member.dob || '') + '</li>' +
        '</ul><p>Check the dashboard: ' + SITE_URL + '/admin</p>',
    });
  }
}

/* ─────────────────────────── API handlers ────────────────────────── */
function requireAuth(req, res, next) {
  if (!sessionFrom(req)) return sendJSON(res, 401, { ok: false, error: 'Not logged in.' });
  next();
}

const handlers = {
  /* POST /api/member — public */
  'POST /api/member': function (req, res, body) {
    if (body && typeof body.website === 'string' && body.website.trim() !== '') {
      return sendJSON(res, 201, { ok: true }); // honeypot: pretend success, store nothing
    }
    const branch = body && body.branch;
    if (branch !== 'u16' && branch !== 'adult') {
      return sendJSON(res, 400, { ok: false, errors: { branch: 'Please choose an age group.' } });
    }

    const spec = branch === 'u16' ? {
      guardian_name:  v => vString(v, 'Guardian name'),
      guardian_phone: v => vPhone(v, 'Guardian phone'),
      guardian_email: v => vEmail(v, 'Guardian email'),
      wrestler_name:  v => vString(v, "Wrestler's name"),
      dob:            v => vDob(v, 'Date of birth'),
      weight_kg:      v => vWeight(v, 'Approx weight'),
    } : {
      wrestler_name:  v => vString(v, 'Your name'),
      phone:          v => vPhone(v, 'Phone number'),
      email:          v => vEmail(v, 'Email address'),
      dob:            v => vDob(v, 'Date of birth'),
      weight_kg:      v => vWeight(v, 'Approx weight'),
    };

    const { values, errors } = collect(spec, body || {});
    if (Object.keys(errors).length) return sendJSON(res, 400, { ok: false, errors });

    /* age must match the chosen branch */
    const age = ageFromDob(values.dob);
    if (branch === 'u16' && age >= 16) errors.dob = 'Date of birth shows the wrestler is 16 or over — choose the adult path.';
    if (branch === 'adult' && age < 16) errors.dob = 'Date of birth shows the wrestler is under 16 — choose the under-16 path.';
    if (Object.keys(errors).length) return sendJSON(res, 400, { ok: false, errors });

    const r = Q.insMember.run(
      values.wrestler_name,
      values.dob,
      branch === 'u16' ? 1 : 0,
      values.weight_kg || '',
      values.guardian_name || '',
      values.guardian_phone || '',
      values.guardian_email || '',
      branch === 'u16' ? values.guardian_phone : values.phone,
      branch === 'u16' ? values.guardian_email : values.email
    );
    /* welcome email — fire-and-forget, never blocks the response */
    try { sendWelcomeEmail(Q.getMemberFull.get(Number(r.lastInsertRowid))); }
    catch (e) { console.error('[email] welcome email failed: ' + e.message); }
    sendJSON(res, 201, { ok: true, id: Number(r.lastInsertRowid) });
  },

  /* POST /api/prospect — public */
  'POST /api/prospect': function (req, res, body) {
    if (body && typeof body.website === 'string' && body.website.trim() !== '') {
      return sendJSON(res, 201, { ok: true });
    }
    const { values, errors } = collect({
      name:          v => vString(v, 'Your name'),
      email:         v => vEmail(v, 'Email address'),
      wrestler_name: v => { if (v === undefined || v === null || String(v).trim() === '') return null; return vString(v, "Wrestler's name"); },
      wrestler_age:  v => vAge(v, "Wrestler's age"),
    }, body || {});
    if (Object.keys(errors).length) return sendJSON(res, 400, { ok: false, errors });

    const r = Q.insProspect.run(values.name, values.email, values.wrestler_name || values.name, values.wrestler_age);
    sendJSON(res, 201, { ok: true, id: Number(r.lastInsertRowid) });
  },

  /* POST /api/message — public */
  'POST /api/message': function (req, res, body) {
    if (body && typeof body.website === 'string' && body.website.trim() !== '') {
      return sendJSON(res, 201, { ok: true });
    }
    const { values, errors } = collect({
      name:    v => vString(v, 'Your name'),
      email:   v => vEmail(v, 'Email address'),
      phone:   v => { if (v === undefined || v === null || String(v).trim() === '') return null; return vString(v, 'Phone number', { max: 30 }); },
      subject: v => { if (v === undefined || v === null || String(v).trim() === '') return null; return vString(v, 'Subject', { max: 120 }); },
      body:    v => vString(v, 'Message', { max: 2000 }),
    }, body || {});
    if (Object.keys(errors).length) return sendJSON(res, 400, { ok: false, errors });

    const r = Q.insMessage.run(values.name, values.email, values.phone || '', values.subject || '', values.body);
    sendJSON(res, 201, { ok: true, id: Number(r.lastInsertRowid) });
  },

  /* POST /api/login — public */
  'POST /api/login': function (req, res, body) {
    if (!rateLimit('login:' + req.ip, 10, 15 * 60 * 1000)) {
      return sendJSON(res, 429, { ok: false, error: 'Too many login attempts — try again in 15 minutes.' });
    }
    if (!body || !verifyPassword(body.password)) {
      return sendJSON(res, 401, { ok: false, error: 'Incorrect password.' });
    }
    const token = makeSession();
    res.setHeader('Set-Cookie', cookieHeader(token));
    sendJSON(res, 200, { ok: true });
  },

  'POST /api/logout': function (req, res) {
    const raw = req.headers.cookie || '';
    const pair = raw.split(';').map(s => s.trim()).find(s => s.startsWith('ka_session='));
    if (pair) sessions.delete(pair.slice('ka_session='.length));
    res.setHeader('Set-Cookie', cookieHeader('', 0));
    sendJSON(res, 200, { ok: true });
  },

  /* GET /api/session — public */
  'GET /api/session': function (req, res) {
    sendJSON(res, 200, { ok: true, authed: !!sessionFrom(req) });
  },

  /* GET /api/dashboard — admin */
  'GET /api/dashboard': function (req, res) {
    const d = new Date();
    sendJSON(res, 200, {
      ok: true,
      currentMonth: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      members:   Q.allMembers.all(),
      prospects: Q.allProspects.all(),
      messages:  Q.allMessages.all(),
    });
  },

  /* PATCH /api/members/:id — admin */
  'PATCH /api/members/:id': function (req, res, body, id) {
    const s = vEnum(body && body.status, ['Pending', 'Active'], 'Status');
    if (typeof s === 'string') return sendJSON(res, 400, { ok: false, error: s });
    if (!Q.getMember.get(id)) return sendJSON(res, 404, { ok: false, error: 'Member not found.' });
    Q.patchMember.run(s.v, id);
    sendJSON(res, 200, { ok: true });
  },

  /* POST /api/members/:id/pay — admin */
  'POST /api/members/:id/pay': function (req, res, body, id) {
    if (!Q.getMember.get(id)) return sendJSON(res, 404, { ok: false, error: 'Member not found.' });
    const d = new Date();
    Q.payMember.run(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), id);
    sendJSON(res, 200, { ok: true });
  },

  'DELETE /api/members/:id': function (req, res, body, id) {
    if (!Q.getMember.get(id)) return sendJSON(res, 404, { ok: false, error: 'Member not found.' });
    Q.delMember.run(id);
    sendJSON(res, 200, { ok: true });
  },

  'PATCH /api/prospects/:id': function (req, res, body, id) {
    const s = vEnum(body && body.status, ['New', 'Contacted'], 'Status');
    if (typeof s === 'string') return sendJSON(res, 400, { ok: false, error: s });
    if (!Q.getProspect.get(id)) return sendJSON(res, 404, { ok: false, error: 'Prospect not found.' });
    Q.patchProspect.run(s.v, id);
    sendJSON(res, 200, { ok: true });
  },

  'DELETE /api/prospects/:id': function (req, res, body, id) {
    if (!Q.getProspect.get(id)) return sendJSON(res, 404, { ok: false, error: 'Prospect not found.' });
    Q.delProspect.run(id);
    sendJSON(res, 200, { ok: true });
  },

  'PATCH /api/messages/:id': function (req, res, body, id) {
    const r = vEnum(body && body.read, [0, 1], 'Read flag');
    if (typeof r === 'string') return sendJSON(res, 400, { ok: false, error: r });
    if (!Q.getMessage.get(id)) return sendJSON(res, 404, { ok: false, error: 'Message not found.' });
    Q.patchMessage.run(r.v, id);
    sendJSON(res, 200, { ok: true });
  },

  'DELETE /api/messages/:id': function (req, res, body, id) {
    if (!Q.getMessage.get(id)) return sendJSON(res, 404, { ok: false, error: 'Message not found.' });
    Q.delMessage.run(id);
    sendJSON(res, 200, { ok: true });
  },
};

/* ─────────────────────────── router ──────────────────────────────── */
function route(req, res) {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const pathname = url.pathname;
  const method = req.method;

  /* API */
  if (pathname.startsWith('/api/')) {
    let key = method + ' ' + pathname;
    let id = null;
    const m = pathname.match(/^\/api\/(members|prospects|messages)\/(\d+)(?:\/pay)?$/);
    if (m) {
      id = Number(m[2]);
      key = method + ' /api/' + m[1] + '/:id' + (pathname.endsWith('/pay') ? '/pay' : '');
    }

    const isPublicWrite = (method === 'POST' && ['/api/member', '/api/prospect', '/api/message', '/api/login'].includes(pathname));
    const isPublicRead  = (method === 'GET' && pathname === '/api/session');
    const authed = !!sessionFrom(req);
    if (!isPublicWrite && !isPublicRead && !authed) {
      return sendJSON(res, 401, { ok: false, error: 'Not logged in.' });
    }

    const handler = handlers[key];
    if (!handler) return sendJSON(res, 404, { ok: false, error: 'Unknown endpoint.' });

    if (isPublicWrite && pathname !== '/api/login') {
      if (!rateLimit('form:' + req.ip, 20, 10 * 60 * 1000)) {
        return sendJSON(res, 429, { ok: false, error: 'Too many requests — please try again in a few minutes.' });
      }
    }

    readBody(req, 100 * 1024)
      .then(function (body) { handler(req, res, body, id); })
      .catch(function (err) {
        if (err.message === 'body too large') return sendJSON(res, 413, { ok: false, error: 'Request too large.' });
        if (err.message === 'invalid JSON') return sendJSON(res, 400, { ok: false, error: 'Invalid request body.' });
        console.error('[api error]', err);
        sendJSON(res, 500, { ok: false, error: 'Server error.' });
      });
    return;
  }

  /* Static */
  if (method === 'GET' || method === 'HEAD') return serveStatic(res, pathname);
  sendJSON(res, 405, { ok: false, error: 'Method not allowed.' });
}

/* ─────────────────────────── server ──────────────────────────────── */
const server = http.createServer(function (req, res) {
  /* Behind a proxy (Render), all visitors share one IP — read the real one
     from X-Forwarded-For when TRUST_PROXY=1. */
  req.ip = TRUST_PROXY && req.headers['x-forwarded-for']
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
    : (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  try { route(req, res); }
  catch (err) {
    console.error('[error]', err);
    try { sendJSON(res, 500, { ok: false, error: 'Server error.' }); }
    catch (e) { /* response already sent */ }
  }
});

server.listen(PORT, HOST, function () {
  console.log('Khalsa Akhara site + API running at http://' + HOST + ':' + PORT);
  console.log('Admin dashboard:  http://' + HOST + ':' + PORT + '/admin');
});

function shutdown() {
  console.log('\nShutting down…');
  try { db.close(); } catch (e) { /* already closed */ }
  server.close(function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
