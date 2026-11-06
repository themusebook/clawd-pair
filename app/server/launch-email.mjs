// Email-to-launch: a Resend inbound webhook (POST /api/launch/email) that creates a DEVNET-ONLY SPL token
// (6 decimals + Metaplex metadata) and replies with the mint, explorer links and metadata URL.
// There is no mainnet code path: the cluster is hard-coded to devnet and the RPC genesis hash is checked.
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite"; import fs from "node:fs"; import path from "node:path";

export const CLUSTER = "devnet";
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const DEVNET_RPC_DEFAULT = "https://api.devnet.solana.com";
export const DECIMALS = 6;
export const DISCLAIMER = "Devnet test token, no value, not tradeable on mainnet. Built on Solana. Not affiliated with or endorsed by the Solana Foundation.";
export const CONTACT = "toly@mail.grokbot.com";
const METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const explorer = (kind, id) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

// ---------- devnet guard ----------
export class NotDevnetError extends Error {}
/** Throws NotDevnetError unless the RPC reports devnet's genesis hash. `rpcCall(method)` returns the JSON-RPC result. */
export async function assertDevnet(rpcCall) {
  const h = await rpcCall("getGenesisHash");
  if (h !== DEVNET_GENESIS) throw new NotDevnetError(`refusing to start: RPC genesis hash ${String(h).slice(0, 12)}… is not devnet`);
  return true;
}
export const jsonRpc = (url, fetchImpl = fetch) => async (method, params = []) => {
  const r = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10000) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message || "rpc error"); return j.result;
};

// ---------- Resend (Svix) webhook signature ----------
/** Verifies svix-id / svix-timestamp / svix-signature against a whsec_ secret. 5 minute tolerance. */
export function verifyWebhook(secret, headers, rawBody, nowMs = Date.now()) {
  if (!secret) return false;
  const id = headers["svix-id"], ts = headers["svix-timestamp"], sigs = headers["svix-signature"];
  if (!id || !ts || !sigs || !/^\d+$/.test(String(ts))) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody}`).digest();
  return String(sigs).split(" ").some((s) => { const [v, b64] = s.split(","); if (v !== "v1" || !b64) return false; const got = Buffer.from(b64, "base64"); return got.length === expected.length && crypto.timingSafeEqual(got, expected); });
}

// ---------- parsing + sanitizing ----------
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const URLISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|fun|app|trade|gg|co|me|ly|sh|ai|dev|link|site|top)\b)/i;
// Short blocklist of slurs (matched on normalized letters). Extend via LAUNCH_BLOCKLIST (comma-separated).
const SLURS = ["nigger", "nigga", "faggot", "fag", "retard", "kike", "chink", "spic", "tranny", "wetback", "coon", "gook", "dyke", "paki", "raghead", "beaner"];
const norm = (s) => s.toLowerCase().replace(/[0@]/g, "o").replace(/[1!|]/g, "i").replace(/3/g, "e").replace(/[4]/g, "a").replace(/[5$]/g, "s").replace(/7/g, "t").replace(/[^a-z]/g, "");
export function isBlocked(s, extra = (process.env.LAUNCH_BLOCKLIST || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
  if (!s) return false; if (URLISH.test(s)) return true; const n = norm(s);
  return [...SLURS, ...extra].some((w) => w.length <= 3 ? new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(s.toLowerCase().replace(/[^a-z]+/g, " ")) : n.includes(w));
}
const clean = (s) => String(s || "").replace(/[\u0000-\u001f\u007f<>"`\\]/g, " ").replace(/\s+/g, " ").trim();
export function sanitizeName(s) { s = clean(s).slice(0, 32).trim(); return s && !isBlocked(s) ? s : ""; }
export function sanitizeSymbol(s) { s = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10); return s.length >= 2 && !isBlocked(s) ? s : ""; }
export function sanitizeDescription(s) { s = clean(s).replace(/(https?:\/\/|www\.)\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, 280); return isBlocked(s) ? "" : s; }
export function symbolFromName(name) {
  const w = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const s = w.length > 1 ? w.map((x) => x[0]).join("") : (w[0] || ""); return sanitizeSymbol(s.length >= 2 ? s : s + "X");
}
const stripHtml = (h) => String(h || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/** isValidAddress(str) => bool (on-curve ed25519 key); injected so the parser has no web3 dependency. */
export function parseLaunchEmail({ subject = "", text = "", html = "" } = {}, isValidAddress = () => false) {
  let body = (text || stripHtml(html) || "").replace(/\r/g, "");
  // drop quoted replies and signatures
  body = body.split("\n").filter((l) => !/^\s*>/.test(l)).join("\n").split(/\n--\s*\n|\nOn .{5,120}wrote:\n/)[0];
  const field = (k) => (body.match(new RegExp(`^\\s*${k}\\s*[:=]\\s*(.+)$`, "im")) || [])[1] || "";
  let subj = clean(subject).replace(/^((re|fwd?|aw)\s*:\s*)+/i, "").replace(/^(please\s+)?(launch|create|mint|deploy)\b[:\s-]*/i, "").replace(/\btoken\b\s*$/i, "").trim();
  let subjSym = "";
  const m = subj.match(/\(\s*\$?([A-Za-z0-9]{2,10})\s*\)|\$([A-Za-z0-9]{2,10})\b|\[\s*([A-Za-z0-9]{2,10})\s*\]/);
  if (m) { subjSym = m[1] || m[2] || m[3]; subj = subj.replace(m[0], " ").replace(/\s+/g, " ").trim(); }
  const name = sanitizeName(field("name")) || sanitizeName(subj) || "Pinch Devnet Token";
  const symbol = sanitizeSymbol(field("symbol") || field("ticker")) || sanitizeSymbol(subjSym) || symbolFromName(name) || "PINCH";
  let description = sanitizeDescription(field("description") || field("desc"));
  if (!description) description = sanitizeDescription(body.split("\n").map((l) => l.trim()).filter((l) => l && !/^\s*(name|symbol|ticker|description|desc|wallet|address|to)\s*[:=]/i.test(l) && !B58.test(l)).join(" ").slice(0, 280));
  if (!description) description = `${name} is a devnet test token launched by email via Pinch.`;
  let owner = null;
  for (const tok of (field("wallet") + " " + field("address") + " " + field("to") + " " + body).split(/[\s,;:<>()[\]"']+/)) if (B58.test(tok) && isValidAddress(tok)) { owner = tok; break; }
  return { name, symbol, description, owner };
}

// ---------- mail filtering ----------
export function senderAddress(from) { const m = String(from || "").match(/<([^>]+)>/); return (m ? m[1] : String(from || "")).trim().toLowerCase(); }
export function isAutoOrBounce(mail) {
  const h = Object.fromEntries(Object.entries(mail.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  const from = senderAddress(mail.from), subj = String(mail.subject || "").toLowerCase();
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if (/bulk|junk|list|auto_reply/.test(h["precedence"] || "")) return true;
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-auto-response-suppress"] || h["list-id"] || h["list-unsubscribe"]) return true;
  if (h["return-path"] === "<>" || h["return-path"] === "") return true;
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce[s]?)([+@.-]|$)/.test(from)) return true;
  if (/^(auto(matic)?[ -]?reply|auto:|out of (the )?office|undeliver|delivery (status )?notification|mail delivery (failed|subsystem)|returned mail|failure notice|vacation)/.test(subj)) return true;
  return false;
}
/** Drop mail whose SPF and DKIM results are both known-bad. Requires pass on at least one of SPF/DKIM when Resend reports them. */
export function authOk(mail) {
  const a = mail.authentication; if (!a) return true; // older payloads without the field
  if (a.dmarc === "fail") return false;
  return a.spf === "pass" || a.dkim === "pass";
}

// ---------- store ----------
export function openLaunchDb(p = process.env.LAUNCH_DB_PATH || path.join(process.env.DATA_DIR || "/data", "launch.db")) {
  if (p !== ":memory:") fs.mkdirSync(path.dirname(p), { recursive: true });
  const db = new DatabaseSync(p);
  db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS launch_messages (message_id TEXT PRIMARY KEY, sender_hash TEXT, outcome TEXT, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS launches (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_hash TEXT NOT NULL, mint TEXT, name TEXT, symbol TEXT, description TEXT, owner TEXT, sigs TEXT, status TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS l_sender ON launches(sender_hash, at); CREATE INDEX IF NOT EXISTS l_at ON launches(at); CREATE INDEX IF NOT EXISTS l_mint ON launches(mint);`);
  return db;
}
export const senderHash = (email, salt) => crypto.createHmac("sha256", salt || "pinch-launch").update(senderAddress(email)).digest("hex");
const HOUR = 3600_000, DAY = 24 * HOUR;
/** Rate limits count every launch attempt that reached the chain step (ok or failed), not dropped mail. */
export function checkLimits(db, sh, now, { perHour = 1, perDay = 3, globalPerHour = 20 } = {}) {
  const c = (sql, ...a) => db.prepare(sql).get(...a).n;
  if (c("SELECT count(*) n FROM launches WHERE at>? AND status!='refused'", now - HOUR) >= globalPerHour) return { ok: false, reason: "global" };
  if (c("SELECT count(*) n FROM launches WHERE sender_hash=? AND at>? AND status!='refused'", sh, now - HOUR) >= perHour) return { ok: false, reason: "hour" };
  if (c("SELECT count(*) n FROM launches WHERE sender_hash=? AND at>? AND status!='refused'", sh, now - DAY) >= perDay) return { ok: false, reason: "day" };
  return { ok: true };
}
/** Claims a message-id; false if it was already seen (never process or reply twice). */
export function claimMessage(db, messageId, sh, now) {
  return db.prepare("INSERT OR IGNORE INTO launch_messages(message_id, sender_hash, outcome, at) VALUES(?,?,?,?)").run(messageId, sh, "processing", now).changes === 1;
}
const setOutcome = (db, id, o) => db.prepare("UPDATE launch_messages SET outcome=? WHERE message_id=?").run(o, id);
export function recentLaunches(db, limit = 25) {
  return db.prepare("SELECT mint, name, symbol, sigs, at FROM launches WHERE status='ok' ORDER BY at DESC LIMIT ?").all(limit)
    .map((r) => ({ mint: r.mint, name: r.name, symbol: r.symbol, at: new Date(r.at).toISOString(), explorer: explorer("address", r.mint), txs: JSON.parse(r.sigs || "[]").map((s) => explorer("tx", s)) }));
}

// ---------- reply ----------
export function replyText({ kind, launch, publicUrl, reason }) {
  const foot = `\n\n—\n${DISCLAIMER}\nQuestions or abuse reports: ${CONTACT}\nHow it works: ${publicUrl}/launch.html\n`;
  if (kind === "ok") return `Your devnet token is live.\n\nName: ${launch.name}\nSymbol: ${launch.symbol}\nMint: ${launch.mint}\nToken: ${explorer("address", launch.mint)}\n\nTransactions:\n${launch.sigs.map((s, i) => `  ${i + 1}. ${explorer("tx", s)}`).join("\n")}\n\nMetadata: ${publicUrl}/api/launch/meta/${launch.mint}.json\nSupply: ${launch.supply.toLocaleString("en-US")} ${launch.symbol} (6 decimals) minted to ${launch.owner}${launch.fresh ? " (a fresh devnet wallet; put your own devnet address in the email body next time to receive the supply)" : ""}.\nMint authority was revoked after minting, so the supply is fixed.` + foot;
  if (kind === "faucet") return `Thanks for trying Pinch email launches! The devnet faucet wallet that pays for launches is empty right now, so no token was created. Please try again later.` + foot;
  if (kind === "limit") return `Easy there! Email launches are limited to 1 per hour and 3 per day per sender (and a global hourly cap). ${reason === "global" ? "The global hourly cap was reached." : "You've hit your limit."} Please try again later. Nothing was created.` + foot;
  return `Sorry, the devnet launch failed and no token was created. Please try again later.` + foot;
}

// ---------- service ----------
/**
 * makeLaunchEmail({ db, fetchImpl, rpcCall, launcher, now, env })
 * launcher: { balanceLamports(): Promise<number>, launch({name,symbol,uri,owner}): Promise<{mint, sigs, owner, fresh, supply}>, isValidAddress(s): bool }
 */
export function makeLaunchEmail({ db, fetchImpl = fetch, launcher, now = () => Date.now(), env = process.env, logger = console } = {}) {
  const publicUrl = (env.PUBLIC_URL || "https://pinch.musebook.trade").replace(/\/$/, "");
  const fromAddr = env.LAUNCH_FROM || "Pinch Devnet Launch <launch@clawdmail.app>";
  const launchAddr = senderAddress(fromAddr);
  const limits = { perHour: Number(env.LAUNCH_PER_SENDER_HOUR || 1), perDay: Number(env.LAUNCH_PER_SENDER_DAY || 3), globalPerHour: Number(env.LAUNCH_GLOBAL_PER_HOUR || 20) };
  const minLamports = Math.round(Number(env.LAUNCH_MIN_PAYER_SOL || 0.05) * 1e9);
  const salt = env.LAUNCH_HASH_SALT || env.RESEND_WEBHOOK_SECRET || "";
  const resend = (p, init = {}) => fetchImpl(`https://api.resend.com${p}`, { ...init, headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", ...(init.headers || {}) } });

  async function sendReply(mail, kind, extra = {}) {
    const to = senderAddress(mail.from); const subject = `Re: ${String(mail.subject || "devnet launch").slice(0, 120)}`;
    const headers = mail.message_id ? { "In-Reply-To": mail.message_id, References: mail.message_id } : {};
    const r = await resend("/emails", { method: "POST", headers: { "Idempotency-Key": `launch-${crypto.createHash("sha256").update(String(mail.message_id || mail.id)).digest("hex").slice(0, 40)}` }, body: JSON.stringify({ from: fromAddr, to: [to], subject, text: replyText({ kind, publicUrl, ...extra }), headers: { ...headers, "Auto-Submitted": "auto-replied" } }) });
    if (!r.ok) logger.warn(`launch: reply failed status=${r.status}`);
  }

  /** Processes one received email (already fetched). Returns an outcome string. */
  async function processMail(mail) {
    const messageId = String(mail.message_id || `resend:${mail.id}`);
    const sender = senderAddress(mail.from); const sh = senderHash(sender, salt); const t = now();
    if (!sender || !sender.includes("@") || sender === launchAddr) return "ignored:sender";
    if (!claimMessage(db, messageId, sh, t)) return "duplicate";
    const done = (o) => { setOutcome(db, messageId, o); return o; };
    if (!authOk(mail)) return done("dropped:auth");
    if (isAutoOrBounce(mail)) return done("ignored:auto");
    const lim = checkLimits(db, sh, t, limits);
    if (!lim.ok) { // one courtesy note per sender per hour at most, then silent
      const noted = db.prepare("SELECT count(*) n FROM launch_messages WHERE sender_hash=? AND outcome LIKE 'limit:replied%' AND at>?").get(sh, t - HOUR).n;
      if (!noted) { await sendReply(mail, "limit", { reason: lim.reason }); return done(`limit:replied:${lim.reason}`); }
      return done(`limit:silent:${lim.reason}`);
    }
    const parsed = parseLaunchEmail(mail, launcher.isValidAddress);
    let bal = 0; try { bal = await launcher.balanceLamports(); } catch { bal = -1; }
    if (bal >= 0 && bal < minLamports) { await sendReply(mail, "faucet"); return done("faucet"); }
    const row = db.prepare("INSERT INTO launches(sender_hash, name, symbol, description, owner, status, at) VALUES(?,?,?,?,?,?,?)").run(sh, parsed.name, parsed.symbol, parsed.description, parsed.owner, "pending", t);
    try {
      const res = await launcher.launch({ ...parsed, uriFor: (mint) => `${publicUrl}/api/launch/meta/${mint}.json` });
      db.prepare("UPDATE launches SET mint=?, owner=?, sigs=?, status='ok' WHERE id=?").run(res.mint, res.owner, JSON.stringify(res.sigs), row.lastInsertRowid);
      await sendReply(mail, "ok", { launch: { ...parsed, ...res } });
      logger.log(`launch: devnet mint ${res.mint} (${parsed.symbol})`);
      return done("ok");
    } catch (e) {
      db.prepare("UPDATE launches SET status='failed' WHERE id=?").run(row.lastInsertRowid);
      logger.warn(`launch: failed ${String(e?.message || e).slice(0, 200)}`);
      if (/insufficient|0x1\b|debit an account/i.test(String(e?.message))) { await sendReply(mail, "faucet"); return done("faucet"); }
      await sendReply(mail, "error"); return done("error");
    }
  }

  async function fetchReceived(id) {
    const r = await resend(`/emails/receiving/${encodeURIComponent(id)}`); if (!r.ok) throw new Error(`resend get ${r.status}`); return r.json();
  }

  /** HTTP handler. Returns true if it handled the request. */
  async function handle(req, res, url, { json, readBody }) {
    if (url.pathname === "/api/launch/email" && req.method === "POST") {
      if (env.LAUNCH_EMAIL_ENABLED !== "true") return json(res, 404, { error: "not enabled" }), true;
      const raw = await readBody(req);
      if (!verifyWebhook(env.RESEND_WEBHOOK_SECRET, req.headers, raw, now())) return json(res, 401, { error: "bad signature" }), true;
      let ev; try { ev = JSON.parse(raw.toString("utf8")); } catch { return json(res, 400, { error: "bad json" }), true; }
      if (ev.type !== "email.received" || !ev.data?.email_id) return json(res, 200, { ignored: true }), true;
      json(res, 200, { accepted: true }); // ack fast; processing is idempotent on message-id
      (async () => { try { const mail = await fetchReceived(ev.data.email_id); mail.message_id ||= ev.data.message_id; await processMail(mail); } catch (e) { logger.warn(`launch: webhook processing error ${String(e?.message || e).slice(0, 200)}`); } })();
      return true;
    }
    const mm = url.pathname.match(/^\/api\/launch\/meta\/([1-9A-HJ-NP-Za-km-z]{32,44})\.json$/);
    if (mm) {
      const r = db.prepare("SELECT name, symbol, description FROM launches WHERE mint=? AND status IN ('ok','pending')").get(mm[1]);
      if (!r) return json(res, 404, { error: "unknown mint" }), true;
      res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" });
      res.end(JSON.stringify({ name: r.name, symbol: r.symbol, description: `${r.description}\n\n${DISCLAIMER}`, image: `${publicUrl}/pinch-512.png`, external_url: `${publicUrl}/launch.html`, attributes: [{ trait_type: "cluster", value: "devnet" }], properties: { category: "currency" } })); return true;
    }
    if (url.pathname === "/api/launch/recent") return json(res, 200, { cluster: CLUSTER, launches: recentLaunches(db) }), true;
    return false;
  }
  return { handle, processMail };
}

// ---------- on-chain (devnet) ----------
/** Builds the real launcher. Imported lazily so tests/other routes don't need web3. Payer secret only from DEVNET_PAYER_SECRET; never logged. */
export async function makeDevnetLauncher({ rpcUrl = DEVNET_RPC_DEFAULT, secret, supply = 1_000_000_000 } = {}) {
  const web3 = await import("@solana/web3.js"); const spl = await import("@solana/spl-token");
  const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction, SYSVAR_RENT_PUBKEY } = web3;
  if (!secret) throw new Error("DEVNET_PAYER_SECRET not set");
  let payer; // parse errors are replaced with a generic message so no part of the secret can reach logs
  try { const s = String(secret).trim(); const bytes = s.startsWith("[") ? Uint8Array.from(JSON.parse(s)) : decodeB58(s); payer = Keypair.fromSecretKey(bytes); bytes.fill(0); }
  catch { throw new Error("DEVNET_PAYER_SECRET is not a valid keypair (expected base58 or JSON byte array)"); }
  const conn = new Connection(rpcUrl, "confirmed");
  await assertDevnet(async () => conn.getGenesisHash());
  const MPL = new PublicKey(METADATA_PROGRAM);
  const isValidAddress = (a) => { try { return PublicKey.isOnCurve(new PublicKey(a).toBytes()); } catch { return false; } };
  return {
    payer: payer.publicKey.toBase58(), isValidAddress,
    balanceLamports: () => conn.getBalance(payer.publicKey),
    async launch({ name, symbol, owner, uriFor }) {
      const mint = Keypair.generate(); const fresh = !owner; const ownerPk = owner ? new PublicKey(owner) : Keypair.generate().publicKey;
      const [metadata] = PublicKey.findProgramAddressSync([Buffer.from("metadata"), MPL.toBuffer(), mint.publicKey.toBuffer()], MPL);
      const ata = spl.getAssociatedTokenAddressSync(mint.publicKey, ownerPk, true);
      const rent = await spl.getMinimumBalanceForRentExemptMint(conn);
      const tx1 = new Transaction().add(
        SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mint.publicKey, space: spl.MINT_SIZE, lamports: rent, programId: spl.TOKEN_PROGRAM_ID }),
        spl.createInitializeMint2Instruction(mint.publicKey, DECIMALS, payer.publicKey, null),
        new TransactionInstruction({ programId: MPL, data: metadataV3Data({ name, symbol, uri: uriFor(mint.publicKey.toBase58()) }), keys: [
          { pubkey: metadata, isSigner: false, isWritable: true }, { pubkey: mint.publicKey, isSigner: false, isWritable: false },
          { pubkey: payer.publicKey, isSigner: true, isWritable: false }, { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: payer.publicKey, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }] }));
      const sig1 = await sendAndConfirmTransaction(conn, tx1, [payer, mint], { commitment: "confirmed" });
      const tx2 = new Transaction().add(
        spl.createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, ownerPk, mint.publicKey),
        spl.createMintToInstruction(mint.publicKey, ata, payer.publicKey, BigInt(supply) * 10n ** BigInt(DECIMALS)),
        spl.createSetAuthorityInstruction(mint.publicKey, payer.publicKey, spl.AuthorityType.MintTokens, null));
      const sig2 = await sendAndConfirmTransaction(conn, tx2, [payer], { commitment: "confirmed" });
      return { mint: mint.publicKey.toBase58(), sigs: [sig1, sig2], owner: ownerPk.toBase58(), fresh, supply };
    },
  };
}
/** Borsh data for Metaplex Token Metadata CreateMetadataAccountV3 (discriminator 33). */
export function metadataV3Data({ name, symbol, uri }) {
  const str = (s) => { const b = Buffer.from(s, "utf8"); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
  return Buffer.concat([Buffer.from([33]), str(name), str(symbol), str(uri), Buffer.from([0, 0]), Buffer.from([0]), Buffer.from([0]), Buffer.from([0]), Buffer.from([1]), Buffer.from([0])]);
}
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeB58(s) { let n = 0n; for (const c of s) { const i = ALPHA.indexOf(c); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); } let hex = n.toString(16); if (hex.length % 2) hex = "0" + hex; const out = [...Buffer.from(hex, "hex")]; for (const c of s) { if (c !== "1") break; out.unshift(0); } return Uint8Array.from(out); }

/** Startup: returns a handler or null. Exits the process if the RPC is reachable but not devnet. */
export async function startLaunchEmail({ env = process.env, logger = console } = {}) {
  if (env.LAUNCH_EMAIL_ENABLED !== "true") return null;
  const rpcUrl = env.DEVNET_RPC_URL || DEVNET_RPC_DEFAULT;
  try {
    const launcher = await makeDevnetLauncher({ rpcUrl, secret: env.DEVNET_PAYER_SECRET, supply: Number(env.LAUNCH_SUPPLY || 1_000_000_000) });
    const svc = makeLaunchEmail({ db: openLaunchDb(), launcher, env, logger });
    logger.log(`launch-email: devnet guard ok, payer ${launcher.payer}`);
    return svc;
  } catch (e) {
    if (e instanceof NotDevnetError) { logger.error(`launch-email: ${e.message}`); process.exit(1); }
    logger.error(`launch-email disabled: ${String(e?.message || e).slice(0, 160)}`); return null;
  }
}
