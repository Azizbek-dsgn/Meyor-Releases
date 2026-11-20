// One-off move of the accounts kept by the old GitHub processor (state.enc in Meyor-Control) to the Meyor
// Supabase API: decrypted here with the admin box key, sent as one admin-signed "import" command.
// Prints counts only, never personal data.
const c = require('./lib/crypto.cjs');
const { github } = require('./index.cjs');

const API = 'https://jqlqsejoblnzxbnwpvvr.supabase.co/functions/v1/api';
function need(name) { const v = process.env[name]; if (!v || !v.trim()) throw new Error(`Secret ${name} yo‘q.`); return v.trim(); }

async function main() {
  const gh = github(need('MEYOR_BOT_TOKEN')), box = need('ADMIN_BOX_PRIVATE'), sign = need('ADMIN_SIGN_PRIVATE');
  const saved = await gh('GET', '/repos/Azizbek-dsgn/Meyor-Control/contents/state/state.enc', null, { raw: true });
  if (!saved) { console.log('No state yet: nothing to move.'); return; }
  const state = JSON.parse(c.open(box, String(saved).trim()).toString('utf8'));
  // Only what the new tables keep (skill zips: just the ones still waiting for review).
  for (const s of Object.values(state.skills || {})) if (s.status !== 'pending') delete s.zip;
  const now = Date.now(), body = { v: 1, type: 'import', state: { accounts: state.accounts, skills: state.skills, updates: state.updates, reports: state.reports, support: state.support, adminSeq: state.adminSeq }, seq: now, at: now };
  const res = await fetch(API + '/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, adminSig: c.sign(sign, body) }) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`API ${res.status}: ${answer.error || ''}`);
  console.log('Moved:', answer.note, '| accounts now:', answer.stats?.total);
}
main().catch(e => { console.error('Migrate:', e.message); process.exit(1); });
