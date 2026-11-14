// Meyor-Control processor (GitHub Action, hourly and on demand). Reads Meyor-Inbox, applies records and
// admin commands, keeps state/state.enc + state/stats.enc in the private Meyor-Control repo (via the API), publishes the
// signed control.json to Meyor-Releases and approved skills to Swible-Skills.
// Secrets: MEYOR_BOT_TOKEN, ADMIN_BOX_PRIVATE, ADMIN_SIGN_PRIVATE. Nothing here prints personal data.
const fs = require('node:fs');
const path = require('node:path');
const c = require('./lib/crypto.cjs');
const core = require('./lib/core.cjs');
const { googleKeys } = require('./lib/google.cjs');

const OWNER = 'Azizbek-dsgn';
const AUDIENCE = process.env.GOOGLE_CLIENT_ID || '615890397444-7aifug6tvg6695ncgoh18qerdrdqc26l.apps.googleusercontent.com';
const PART = /m1\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{20,}/g;

function need(name) { const v = process.env[name]; if (!v || !v.trim()) throw new Error(`Secret ${name} yo‘q.`); return v.trim(); }

function github(token, fetchImpl = fetch) {
  return async function gh(method, url, body) {
    const res = await fetchImpl(url.startsWith('http') ? url : 'https://api.github.com' + url, { method,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'meyor-control' },
      body: body ? JSON.stringify(body) : undefined });
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) throw new Error(`GitHub ${method} ${url.split('?')[0]} → ${res.status}`);
    return res.status === 204 ? null : res.json();
  };
}
async function all(gh, url) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const items = await gh('GET', url + (url.includes('?') ? '&' : '?') + `per_page=100&page=${page}`);
    if (!items?.length) break; out.push(...items); if (items.length < 100) break;
  }
  return out;
}
// A record may be split across the issue body and its comments (skill zips are large).
async function sealedText(gh, issue) {
  let text = (String(issue.body || '').match(PART) || []).join('');
  if (issue.comments > 0) for (const cm of await all(gh, `/repos/${OWNER}/Meyor-Inbox/issues/${issue.number}/comments`)) {
    if (cm.user?.login !== issue.user?.login) continue;   // only the author's own parts
    text += (String(cm.body || '').match(PART) || []).join('');
  }
  return text;
}
async function putFile(gh, repo, file, content, message, { always = false } = {}) {
  const url = `/repos/${OWNER}/${repo}/contents/${file}`;
  const existing = await gh('GET', url);
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (!always && existing && Buffer.from(existing.content || '', 'base64').equals(data)) return false;
  await gh('PUT', url, { message, content: data.toString('base64'), sha: existing?.sha });
  return true;
}

async function run({ env = process.env, gh = github(need('MEYOR_BOT_TOKEN')), now = Date.now(), fetchJson } = {}) {
  const boxPrivate = need('ADMIN_BOX_PRIVATE'), signPrivate = need('ADMIN_SIGN_PRIVATE');
  const boxPublic = c.publicOf(boxPrivate), adminSignPublic = c.publicOf(signPrivate);
  // The encrypted state lives in the private Meyor-Control repo; this runs in the public Meyor-Releases
  // (free Actions minutes), so nothing private is ever written here.
  const saved = await gh('GET', `/repos/${OWNER}/Meyor-Control/contents/state/state.enc`);
  const state = saved ? JSON.parse(c.open(boxPrivate, Buffer.from(saved.content, 'base64').toString('utf8').trim())) : core.emptyState();
  const keys = await googleKeys(fetchJson || (async url => (await fetch(url)).json()));
  const since = state.lastRun ? `&since=${new Date(state.lastRun - 5 * 60e3).toISOString()}` : '';
  const issues = (await all(gh, `/repos/${OWNER}/Meyor-Inbox/issues?state=all&sort=updated&direction=asc${since}`)).filter(i => !i.pull_request);
  const tally = {};
  const admins = [];
  for (const issue of issues) {
    const labels = (issue.labels || []).map(l => l.name || l);
    let note;
    try {
      const sealed = await sealedText(gh, issue);
      // The same content is applied once (closing an issue changes its date, not its record).
      const digest = require('node:crypto').createHash('sha256').update(sealed).digest('hex').slice(0, 32);
      if (state.seen[issue.number] === digest) continue;
      state.seen[issue.number] = digest;
      const record = JSON.parse(c.open(boxPrivate, sealed).toString('utf8'));
      if (labels.includes('admin') || record.adminSig) { admins.push({ issue, record }); continue; }
      note = core.applyRecord(state, record, { keys, audience: AUDIENCE, now });
    } catch { note = 'unreadable'; }
    tally[note] = (tally[note] || 0) + 1;
    // One-off records (skills, reports, deletes, junk) are closed; account issues stay open for heartbeats.
    const oneOff = !/^(ok)$/.test(note) || labels.some(l => ['skill', 'report', 'delete'].includes(l));
    if (oneOff && issue.state === 'open') await gh('PATCH', `/repos/${OWNER}/Meyor-Inbox/issues/${issue.number}`, { state: 'closed' }).catch(() => {});
  }
  for (const { issue, record } of admins.sort((a, b) => (a.record.seq || 0) - (b.record.seq || 0))) {
    const note = core.applyAdmin(state, record, { adminSignPublic, now });
    tally['admin:' + note] = (tally['admin:' + note] || 0) + 1;
    if (issue.state === 'open') await gh('PATCH', `/repos/${OWNER}/Meyor-Inbox/issues/${issue.number}`, { state: 'closed' }).catch(() => {});
  }
  // Skills: publish approved versions, take down the rest.
  const skillsBase = `https://raw.githubusercontent.com/${OWNER}/Swible-Skills/main`;
  for (const [key, s] of Object.entries(state.skills)) {
    if (s.status === 'approved' && s.published !== s.version) {
      await putFile(gh, 'Swible-Skills', `skills/${key}/${s.version}.zip`, Buffer.from(s.zip, 'base64'), `Publish ${key} ${s.version}`);
      s.published = s.version;
    }
  }
  await putFile(gh, 'Swible-Skills', 'catalog.json', JSON.stringify(core.catalog(state, skillsBase), null, 1) + '\n', 'Update skill catalog');
  // Publish the signed control file only when its content changed (no hourly commits to the public repo).
  const signed = core.control(state, { adminSignPrivate: signPrivate, now });
  const { seq: _s, issuedAt: _i, sig: _g, ...content } = signed;
  const digest = require('node:crypto').createHash('sha256').update(c.canonical(content)).digest('hex');
  if (digest !== state.controlDigest) {
    await putFile(gh, 'Meyor-Releases', 'control/control.json', JSON.stringify(signed) + '\n', `Control ${signed.seq}`);
    state.controlDigest = digest;
  } else state.seq -= 1;
  state.lastRun = now;
  const seen = Object.keys(state.seen); if (seen.length > 20000) for (const k of seen.slice(0, seen.length - 20000)) delete state.seen[k];
  await putFile(gh, 'Meyor-Control', 'state/state.enc', c.seal(boxPublic, JSON.stringify(state)) + '\n', 'State', { always: true });
  await putFile(gh, 'Meyor-Control', 'state/stats.enc', c.seal(boxPublic, JSON.stringify(core.stats(state, now))) + '\n', 'Stats', { always: true });
  console.log('Processed', issues.length, 'issues:', JSON.stringify(tally));  // counts only, never content
  return { tally, control: signed };
}

if (require.main === module) run().catch(e => { console.error('Meyor-Control:', e.message); process.exit(1); });
module.exports = { run, github };
