// Meyor API on Supabase: accounts, skill market and admin commands, answered at once (no queue, no cron).
//   POST /record   a device-signed record from Hustler (account heartbeat, username, skill, report, support, delete)
//   GET  /control  what every app may see: blocks, forced updates, usernames, skill statuses
//   GET  /catalog  the public skill market
//   POST /admin    an admin-signed command (the admin's Ed25519 key never leaves the admin's computer)
// Trust is the same as before: a new device proves its Google account with an id_token; afterwards only that
// device key is accepted for it. Only this function (service role) touches the tables.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1.0.5/base64";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_BASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ADMIN_SIGN = "FYjGyBuTZZx_YX0NmsIwW_llzs3jyRovsMGSnhMULLE";
const AUDIENCE = "615890397444-7aifug6tvg6695ncgoh18qerdrdqc26l.apps.googleusercontent.com";
const DAY = 864e5;
const PRODUCTS = new Set(["meyor", "uzscribe", "uzscribe-desktop", "uzscribe-resolve", "uzdictate", "tempo"]);
const VERSION = /^\d+\.\d+\.\d+$/;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

class Refusal extends Error { constructor(message: string, public status = 400) { super(message); } }
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra } });

// ---- crypto (same canonical JSON and keys as Hustler's cloud-crypto.cjs) ---------------------------------
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const o = value as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}
const fromB64u = (s: string) => decodeBase64(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4));
const utf8 = new TextEncoder();
async function verify(publicB64u: string, value: unknown, sig: string): Promise<boolean> {
  try {
    const raw = fromB64u(publicB64u);
    if (raw.length !== 32 || typeof sig !== "string") return false;
    const key = await crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, fromB64u(sig), utf8.encode(canonical(value)));
  } catch { return false; }
}
async function sha256hex(data: Uint8Array | string) {
  const bytes = typeof data === "string" ? utf8.encode(data) : data;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const accountHash = async (sub: string) => (await sha256hex("meyor-account-v1:" + sub)).slice(0, 40);

let googleCache: { at: number; keys: Record<string, CryptoKey> } | null = null;
async function googleKeys() {
  if (googleCache && Date.now() - googleCache.at < 3600e3) return googleCache.keys;
  const data = await (await fetch("https://www.googleapis.com/oauth2/v3/certs")).json();
  const keys: Record<string, CryptoKey> = {};
  for (const k of data.keys || []) if (k.kty === "RSA" && k.kid) keys[k.kid] = await crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  googleCache = { at: Date.now(), keys };
  return keys;
}
async function verifyIdToken(token: string, now: number) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Refusal("Google tasdig‘i yo‘q: Hustler’da qaytadan Google bilan kiring.", 401);
  const header = JSON.parse(new TextDecoder().decode(fromB64u(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(fromB64u(parts[1])));
  const key = (await googleKeys())[header.kid];
  if (header.alg !== "RS256" || !key) throw new Refusal("Google tasdig‘i noto‘g‘ri.", 401);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64u(parts[2]), utf8.encode(parts[0] + "." + parts[1]));
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ok || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) || !aud.includes(AUDIENCE)) throw new Refusal("Google tasdig‘i noto‘g‘ri.", 401);
  if (!claims.sub || !claims.email || claims.email_verified === false) throw new Refusal("Google akkauntida tasdiqlangan email yo‘q.", 401);
  if (!Number.isFinite(claims.iat) || claims.iat * 1000 > now + 5 * 60e3 || now - claims.iat * 1000 > 7 * DAY) throw new Refusal("Google tasdig‘i eskirgan: Hustler’da qaytadan Google bilan kiring.", 401);
  return claims;
}

// ---- rules (same as accounts/lib/rules.cjs) -------------------------------------------------------------
const USERNAME = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])$/;
const RESERVED = new Set(["admin", "administrator", "meyor", "meyorvision", "hustler", "swible", "voxly", "tempass", "tempo", "support", "help", "official", "moderator", "root", "system", "abdulaziz-kbv", "telegram", "google", "null", "undefined"]);
const SKILL_MAX_BYTES = 1024 * 1024;
const DONATE_HOSTS = ["taps.uz", "tirikchilik.uz", "payme.uz", "click.uz", "t.me", "buymeacoffee.com", "ko-fi.com", "patreon.com", "boosty.to", "paypal.me"];
const text = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
function username(value: unknown) {
  const name = String(value || "").trim().toLowerCase();
  if (!USERNAME.test(name) || name.includes("--")) return { ok: false, reason: "Username 3–20 belgi: kichik lotin harflari, raqam va “-”." };
  if (RESERVED.has(name)) return { ok: false, reason: "Bu username band qilingan." };
  return { ok: true, name };
}
function donateLink(value: unknown) {
  if (value === undefined || value === null || value === "") return { ok: true, url: null as string | null };
  let url: URL;
  try { url = new URL(String(value).trim()); } catch { return { ok: false, reason: "Donat havolasi noto‘g‘ri." }; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || url.username || url.password || url.port) return { ok: false, reason: "Donat havolasi https:// bilan boshlansin." };
  if (!DONATE_HOSTS.includes(host)) return { ok: false, reason: "Faqat ma’lum donat saytlari: " + DONATE_HOSTS.join(", ") + "." };
  if (host === "t.me" && !/^\/tribute(\/|$)/i.test(url.pathname)) return { ok: false, reason: "Telegram’da faqat Tribute donat havolasi (t.me/tribute/…)." };
  if (url.href.length > 300) return { ok: false, reason: "Donat havolasi juda uzun." };
  return { ok: true, url: url.href };
}
// deno-lint-ignore no-explicit-any
function skillMeta(meta: any) {
  const id = String(meta?.id || "");
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) return { ok: false, reason: "Skill id noto‘g‘ri." };
  const name = String(meta?.name || "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, reason: "Skill nomi 2–80 belgi." };
  if (!VERSION.test(String(meta?.version || ""))) return { ok: false, reason: "Versiya 1.0.0 ko‘rinishida." };
  const donate = donateLink(meta?.donate);
  if (!donate.ok) return donate;
  return { ok: true, value: { id, name, version: String(meta.version), description: String(meta.description || "").slice(0, 400),
    tags: (Array.isArray(meta.tags) ? meta.tags : []).slice(0, 8).map((t: unknown) => String(t).slice(0, 30)), donate: (donate as { url: string | null }).url } };
}
// A skill zip: only text and media files, no links, no paths outside its folder, SKILL.md present.
function checkSkillZip(buf: Uint8Array) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Refusal("Zip emas.");
  const count = v.getUint16(end + 10, true), size = v.getUint32(end + 12, true), offset = v.getUint32(end + 16, true);
  if (offset + size > buf.length || count > 2000) throw new Refusal("Zip buzilgan yoki juda ko‘p fayl.");
  let total = 0, main = false;
  const FILES = /\.(md|markdown|txt|json|jsx|js|ts|tsx|mjs|cjs|py|csv|ya?ml|xml|png|jpe?g|webp|svg)$/i;
  for (let p = offset, n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Refusal("Zip buzilgan.");
    const unpacked = v.getUint32(p + 24, true), nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const attrs = v.getUint32(p + 38, true), name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (((attrs >>> 16) & 0xf000) === 0xa000) throw new Refusal("Skill ichida link bo‘lishi mumkin emas.");
    if (name.startsWith("/") || name.includes("\\") || name.split("/").some((part) => part === ".." || part === "")) throw new Refusal("Skill ichidagi fayl yo‘li noto‘g‘ri.");
    if (!FILES.test(name)) throw new Refusal("Ruxsat etilmagan fayl: " + name.split("/").pop());
    if ((total += unpacked) > 16 * 1024 ** 2) throw new Refusal("Skill ochilganda 16 MB dan oshmasin.");
    if (/^([^/]+\/)?SKILL\.md$/i.test(name)) main = true;
  }
  if (!main) throw new Refusal("Skill ichida SKILL.md yo‘q.");
}

// ---- database helpers -----------------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function q<T = any>(promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    const refused = /^refuse:(\d+):(.*)$/s.exec(error.message);
    if (refused) throw new Refusal(refused[2], Number(refused[1]));
    throw new Error(error.message);
  }
  return data;
}
// deno-lint-ignore no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => q<any>(db.rpc(name, args));
const sanitizeApps = (apps: unknown) => Object.fromEntries(Object.entries(apps && typeof apps === "object" ? apps as Record<string, unknown> : {})
  .filter(([k, v]) => /^[a-z-]{2,20}$/.test(k) && VERSION.test(String(v))).map(([k, v]) => [k, String(v)]));

// ---- POST /record: signature and rules here, one database call (meyor_record) -----------------------------
// deno-lint-ignore no-explicit-any
async function record(r: any) {
  const now = Date.now();
  if (!r || r.v !== 1 || !/^[a-f0-9]{40}$/.test(String(r.account)) || !/^[A-Za-z0-9_-]{8,64}$/.test(String(r.device))) throw new Refusal("Yozuv formati noto‘g‘ri.");
  if (!["account", "delete", "skill", "report", "support"].includes(r.type)) throw new Refusal("Yozuv turi noto‘g‘ri.");
  const { sig, ...body } = r;
  if (!(await verify(r.devicePub, body, sig))) throw new Refusal("Qurilma imzosi noto‘g‘ri.", 403);
  // deno-lint-ignore no-explicit-any
  const checked: any = { account: r.account, device: r.device, devicePub: r.devicePub, type: r.type, at: Math.min(Number(r.at) || now, now),
    os: text(r.os, 40), apps: sanitizeApps(r.apps), kind: ["xato", "taklif", "shikoyat", "savol"].includes(r.kind) ? r.kind : "savol",
    text: String(r.text ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, 2000), skill: r.type === "report" ? text(r.skill, 80) : undefined, reason: text(r.reason, 300) };
  if (r.type === "account" && r.username !== undefined && r.username !== null) {
    const check = username(r.username);
    checked.username = check.ok ? check.name : String(r.username).slice(0, 40);
    if (!check.ok) checked.usernameInvalid = check.reason;
  }
  if (r.type === "skill") {
    const meta = skillMeta(r.skill);
    if (!meta.ok) throw new Refusal((meta as { reason: string }).reason);
    const zip = decodeBase64(String(r.zip || ""));
    if (!zip.length || zip.length > SKILL_MAX_BYTES) throw new Refusal("Skill 1 MB dan oshmasin.");
    try { checkSkillZip(zip); } catch (e) { await rpc("meyor_record", { r: { ...checked, type: "skill-error", error: (e as Error).message } }).catch(() => {}); throw e; }
    const m = (meta as { value: Record<string, unknown> }).value;
    checked.skill = m; checked.file = `${r.account}/${m.id}/${m.version}.zip`; checked.zipSha = await sha256hex(zip); checked.zipBytes = zip.length;
    const { error } = await db.storage.from("submissions").upload(checked.file, zip, { upsert: true, contentType: "application/zip" });
    if (error) throw new Error(error.message);
  }
  // An account deleted with its published skills: their public files go too.
  const owned = r.type === "delete" ? await q(db.from("skills").select("key, published").eq("account", r.account).not("published", "is", null)) : [];
  let result = await rpc("meyor_record", { r: checked });
  if (result?.need === "google") {
    // A new device: Google's proof that it belongs to this account.
    const claims = await verifyIdToken(r.idToken, now);
    if ((await accountHash(claims.sub)) !== r.account) throw new Refusal("Google akkaunti mos emas.", 403);
    result = await rpc("meyor_record", { r: checked, claims: { email: text(claims.email, 200), name: text(claims.name || claims.email, 120), avatar: text(claims.picture, 500) } });
  }
  // deno-lint-ignore no-explicit-any
  if (result?.note === "deleted" && owned.length) await db.storage.from("skills").remove(owned.map((o: any) => `${o.key}/${o.published}.zip`));
  if (result?.note !== "ok") controlCache = null;
  return result;
}

// ---- GET /control and /catalog ----------------------------------------------------------------------------
let controlCache: { at: number; body: unknown } | null = null;
async function control() {
  if (controlCache && Date.now() - controlCache.at < 2000) return controlCache.body;
  const body = await rpc("meyor_control", {});
  controlCache = { at: Date.now(), body };
  return body;
}
const catalog = () => rpc("meyor_catalog", { base: URL_BASE });

// ---- POST /admin ------------------------------------------------------------------------------------------
const stats = () => rpc("meyor_stats", {});
// deno-lint-ignore no-explicit-any
async function admin(cmd: any) {
  const now = Date.now();
  const { adminSig, ...body } = cmd || {};
  if (!(await verify(ADMIN_SIGN, body, adminSig))) throw new Refusal("Admin imzosi noto‘g‘ri.", 403);
  if (!Number.isFinite(body.at) || Math.abs(now - body.at) > 10 * 60e3) throw new Refusal("Buyruq eskirgan: kompyuter soatini tekshiring.", 403);
  if (body.type === "stats") return { ok: true, stats: await stats() };
  if (body.type === "skill-file") {
    const skill = await q(db.from("skills").select("file").eq("key", String(body.skill)).maybeSingle());
    const { data } = skill?.file ? await db.storage.from("submissions").download(skill.file) : { data: null };
    if (!data) throw new Refusal("Fayl topilmadi.");
    return { ok: true, zip: encodeBase64(new Uint8Array(await data.arrayBuffer())) };
  }
  if (body.type === "import") {
    const seq = Number((await q(db.from("meta").select("v").eq("k", "admin_seq").single())).v);
    if (!Number.isInteger(body.seq) || body.seq <= seq) throw new Refusal("Bu buyruq allaqachon bajarilgan.", 409);
    await q(db.from("meta").update({ v: body.seq }).eq("k", "admin_seq"));
    return { ok: true, note: await importState(body.state), stats: await stats() };
  }
  if (body.type === "update") {
    if (!PRODUCTS.has(body.product) || !VERSION.test(String(body.min))) throw new Refusal("Yangilanish buyrug‘i noto‘g‘ri.");
    body.targets = body.targets === "all" ? "all" : (Array.isArray(body.targets) ? body.targets.filter((t: string) => /^[a-f0-9]{40}$/.test(t)).slice(0, 1000).sort() : []);
  }
  if (body.type === "approve" || body.type === "unpublish") {
    const skill = await q(db.from("skills").select("key, version, published, file").eq("key", String(body.skill)).maybeSingle());
    if (!skill) throw new Refusal("Skill topilmadi.", 404);
    if (body.type === "approve") {
      const { data, error } = await db.storage.from("submissions").download(skill.file || `${skill.key}/${skill.version}.zip`);
      if (error || !data) throw new Refusal("Skill fayli topilmadi: " + skill.key);
      const { error: up } = await db.storage.from("skills").upload(`${skill.key}/${skill.version}.zip`, new Uint8Array(await data.arrayBuffer()), { upsert: true, contentType: "application/zip" });
      if (up) throw new Error(up.message);
    } else if (skill.published) await db.storage.from("skills").remove([`${skill.key}/${skill.published}.zip`]);
  }
  controlCache = null;
  return await rpc("meyor_admin", { cmd: body });
}

// One-off: the accounts kept by the old GitHub processor (decrypted by its Action, signed by the admin key).
// deno-lint-ignore no-explicit-any
async function importState(state: any) {
  if (!state || typeof state !== "object" || !state.accounts) throw new Refusal("Import ma’lumoti noto‘g‘ri.");
  let accounts = 0, skills = 0;
  for (const [account, a] of Object.entries(state.accounts) as [string, any][]) {
    if (!/^[a-f0-9]{40}$/.test(account)) continue;
    await q(db.from("accounts").upsert({ account, email: a.email || null, name: a.name || null, avatar: a.avatar || null, username: a.username || null,
      username_at: a.usernameAt || 0, username_error: a.usernameError || null, blocked_reason: a.blocked?.reason || null, blocked_at: a.blocked?.at || null,
      created: a.created || Date.now(), seen: a.seen || 0 }));
    for (const [id, d] of Object.entries(a.devices || {}) as [string, any][]) {
      if (/^[A-Za-z0-9_-]{8,64}$/.test(id) && d.pub) await q(db.from("devices").upsert({ id, account, pub: d.pub, first: d.first || 0, seen: d.seen || 0, os: d.os || null, apps: sanitizeApps(d.apps) }));
    }
    accounts++;
  }
  for (const [key, s] of Object.entries(state.skills || {}) as [string, any][]) {
    if (!state.accounts[s.account]) continue;
    let published: string | null = null;
    let file: string | null = null;
    if (s.zip) {
      const zip = decodeBase64(s.zip);
      file = `${s.account}/${s.id}/${s.version}.zip`;
      await db.storage.from("submissions").upload(file, zip, { upsert: true, contentType: "application/zip" });
    }
    if (s.status === "approved" && s.published) {
      // Already public on GitHub (Swible-Skills): copy it over.
      const res = await fetch(`https://raw.githubusercontent.com/Azizbek-dsgn/Swible-Skills/main/skills/${key}/${s.published}.zip`);
      if (res.ok) {
        const zip = new Uint8Array(await res.arrayBuffer());
        await db.storage.from("skills").upload(`${key}/${s.published}.zip`, zip, { upsert: true, contentType: "application/zip" });
        file ||= `${s.account}/${s.id}/${s.published}.zip`;
        await db.storage.from("submissions").upload(file, zip, { upsert: true, contentType: "application/zip" });
        published = s.published;
      }
    }
    await q(db.from("skills").upsert({ key, account: s.account, author: s.author, id: s.id, name: s.name, version: s.version, description: s.description || "",
      tags: s.tags || [], donate: s.donate || null, status: s.status, reason: s.reason || null, submitted: s.submitted || 0, sha256: s.sha256, bytes: s.bytes || 0, published, file, updated: Date.now() }));
    skills++;
  }
  for (const u of state.updates || []) if (PRODUCTS.has(u.product)) await q(db.from("updates").upsert({ id: u.id, product: u.product, min: u.min, targets: u.targets, message: u.message || "", at: u.at || Date.now() }));
  // deno-lint-ignore no-explicit-any
  if ((state.reports || []).length) await q(db.from("reports").insert(state.reports.slice(0, 500).map((r: any) => ({ account: r.account, skill: r.skill, reason: r.reason, at: r.at || 0 }))));
  // deno-lint-ignore no-explicit-any
  if ((state.support || []).length) await q(db.from("support").insert(state.support.slice(0, 1000).map((m: any) => ({ account: m.account, kind: m.kind, text: m.text, at: m.at || 0 }))));
  const seq = Number((await q(db.from("meta").select("v").eq("k", "admin_seq").single())).v);
  if (Number(state.adminSeq) > seq) await q(db.from("meta").update({ v: Number(state.adminSeq) }).eq("k", "admin_seq"));
  return `imported ${accounts} accounts, ${skills} skills`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const route = new URL(req.url).pathname.replace(/^.*\/api/, "") || "/";
  try {
    if (req.method === "GET" && route === "/control") return json(await control(), 200, { "Cache-Control": "public, max-age=5" });
    if (req.method === "GET" && route === "/catalog") return json(await catalog(), 200, { "Cache-Control": "public, max-age=30" });
    if (req.method === "GET" && route === "/") return json({ ok: true, service: "meyor" });
    if (req.method === "POST" && (route === "/record" || route === "/admin")) {
      if (Number(req.headers.get("content-length") || 0) > 2.5 * 1024 * 1024) throw new Refusal("So‘rov juda katta.", 413);
      const body = await req.json();
      return json(route === "/record" ? await record(body) : await admin(body));
    }
    return json({ error: "Topilmadi." }, 404);
  } catch (e) {
    const status = e instanceof Refusal ? e.status : 500;
    if (status === 500) console.error("api:", (e as Error).message);
    return json({ error: e instanceof Refusal ? e.message : "Server xatosi. Birozdan keyin qayta urinib ko‘ring." }, status);
  }
});
