// node --test test/  (no network, no real email: Resend + RPC are mocked; no keys are read or printed)
import test from "node:test"; import assert from "node:assert"; import crypto from "node:crypto";
import { parseLaunchEmail, sanitizeName, sanitizeSymbol, verifyWebhook, assertDevnet, NotDevnetError, DEVNET_GENESIS, openLaunchDb, checkLimits, claimMessage, senderHash, makeLaunchEmail, isAutoOrBounce, authOk, metadataV3Data, DISCLAIMER, jsonRpc } from "../server/launch-email.mjs";

const ADDR = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"; // a well-known on-curve pubkey (used as "valid" in tests)
const valid = (a) => a === ADDR;

test("parser: subject name + (SYMBOL), body fields, address", () => {
  const p = parseLaunchEmail({ subject: "Re: Launch Crab Coin (crab)", text: "description: a crab for testing\nwallet: " + ADDR + "\n> quoted junk https://evil.com" }, valid);
  assert.deepEqual(p, { name: "Crab Coin", symbol: "CRAB", description: "a crab for testing", owner: ADDR });
});
test("parser: defaults and derived symbol", () => {
  assert.deepEqual(parseLaunchEmail({ subject: "", text: "" }), { name: "Pinch Devnet Token", symbol: "PDT", description: "Pinch Devnet Token is a devnet test token launched by email via Pinch.", owner: null });
  const p = parseLaunchEmail({ subject: "launch $MOON rocket", html: "<p>to the moon</p>" });
  assert.equal(p.symbol, "MOON"); assert.equal(p.name, "rocket"); assert.equal(p.description, "to the moon");
});
test("sanitize: lengths, symbol charset, urls and slurs rejected", () => {
  assert.equal(sanitizeName("x".repeat(50)).length, 32);
  assert.equal(sanitizeSymbol("ab-c!d"), "ABCD"); assert.equal(sanitizeSymbol("a"), ""); assert.equal(sanitizeSymbol("abcdefghijklmn"), "ABCDEFGHIJ");
  assert.equal(sanitizeName("visit https://scam.xyz"), ""); assert.equal(sanitizeName("scam.com coin"), ""); assert.equal(sanitizeName("f4ggot coin"), "");
  const p = parseLaunchEmail({ subject: "Launch www.scam.io (SCAM)", text: "name: free money at evil.com" });
  assert.equal(p.name, "Pinch Devnet Token");
  assert.equal(parseLaunchEmail({ text: "wallet: " + ADDR }, () => false).owner, null, "invalid addresses are ignored");
  assert.equal(sanitizeName('<script>"x"</script>'), "script x /script");
});
test("filters: auto-replies, bounces, spf/dkim", () => {
  assert.ok(isAutoOrBounce({ from: "MAILER-DAEMON@x.com", subject: "x" }));
  assert.ok(isAutoOrBounce({ from: "a@b.c", subject: "Out of office: back monday" }));
  assert.ok(isAutoOrBounce({ from: "a@b.c", subject: "hi", headers: { "Auto-Submitted": "auto-replied" } }));
  assert.ok(!isAutoOrBounce({ from: "A <a@b.c>", subject: "Launch X (XX)", headers: { "auto-submitted": "no" } }));
  assert.ok(!authOk({ authentication: { spf: "fail", dkim: "fail", dmarc: "gray" } }));
  assert.ok(!authOk({ authentication: { spf: "pass", dkim: "pass", dmarc: "fail" } }));
  assert.ok(authOk({ authentication: { spf: "gray", dkim: "pass", dmarc: "pass" } }));
});
test("signature: svix v1 verify, tamper, stale, wrong secret", () => {
  const secret = "whsec_" + crypto.randomBytes(24).toString("base64"); const body = '{"type":"email.received"}'; const now = Date.now(); const ts = String(Math.floor(now / 1000));
  const sig = crypto.createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`msg_1.${ts}.${body}`).digest("base64");
  const h = { "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,bogus v1,${sig}` };
  assert.ok(verifyWebhook(secret, h, Buffer.from(body), now));
  assert.ok(!verifyWebhook(secret, h, Buffer.from(body + " "), now));
  assert.ok(!verifyWebhook(secret, h, Buffer.from(body), now + 10 * 60_000));
  assert.ok(!verifyWebhook("whsec_" + crypto.randomBytes(24).toString("base64"), h, Buffer.from(body), now));
  assert.ok(!verifyWebhook("", h, Buffer.from(body), now)); assert.ok(!verifyWebhook(secret, {}, Buffer.from(body), now));
});
test("devnet guard: accepts devnet genesis, refuses anything else (mock RPC)", async () => {
  const mockFetch = (hash) => async () => ({ json: async () => ({ jsonrpc: "2.0", id: 1, result: hash }) });
  assert.equal(await assertDevnet(jsonRpc("http://rpc", mockFetch(DEVNET_GENESIS))), true);
  await assert.rejects(assertDevnet(jsonRpc("http://rpc", mockFetch("4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"))), NotDevnetError);
  await assert.rejects(assertDevnet(async () => "anything-else"), NotDevnetError);
});
test("rate limits: 1/hour, 3/day per sender, global cap", () => {
  const db = openLaunchDb(":memory:"); const H = 3600_000; const t0 = Date.now(); const ins = (sh, at) => db.prepare("INSERT INTO launches(sender_hash,status,at) VALUES(?, 'ok', ?)").run(sh, at);
  const a = senderHash("A <alice@x.com>", "s"); assert.equal(a, senderHash("alice@X.com", "s"));
  assert.ok(checkLimits(db, a, t0).ok); ins(a, t0);
  assert.equal(checkLimits(db, a, t0 + 10).reason, "hour");
  assert.ok(checkLimits(db, a, t0 + H + 1).ok); ins(a, t0 + H + 1); ins(a, t0 + 2 * H + 2);
  assert.equal(checkLimits(db, a, t0 + 3 * H + 3).reason, "day");
  assert.ok(checkLimits(db, a, t0 + 25 * H).ok);
  for (let i = 0; i < 3; i++) ins("g" + i, t0);
  assert.equal(checkLimits(db, "new", t0 + 5, { globalPerHour: 3 }).reason, "global");
  assert.ok(claimMessage(db, "<m1>", a, t0)); assert.ok(!claimMessage(db, "<m1>", a, t0));
});
test("metadata v3 instruction data layout", () => {
  const d = metadataV3Data({ name: "Ab", symbol: "AB", uri: "u" });
  assert.equal(d[0], 33); assert.equal(d.readUInt32LE(1), 2); assert.equal(d.length, 1 + 6 + 6 + 5 + 2 + 3 + 1 + 1);
});
test("service: launch, reply once, idempotent, faucet empty, limit, auth drop", async () => {
  const db = openLaunchDb(":memory:"); const sent = []; let bal = 5e9; let launches = 0;
  const fetchImpl = async (u, init) => { if (u.endsWith("/emails")) { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ id: "e" }) }; } throw new Error("unexpected " + u); };
  const launcher = { isValidAddress: valid, balanceLamports: async () => bal, launch: async ({ owner, uriFor }) => { launches++; const mint = "Mint" + "1".repeat(36) + launches; uriFor(mint); return { mint, sigs: ["sigA", "sigB"], owner: owner || "Fresh111", fresh: !owner, supply: 1e9 }; } };
  const svc = makeLaunchEmail({ db, fetchImpl, launcher, env: { RESEND_API_KEY: "test", LAUNCH_FROM: "Pinch <launch@clawdmail.app>" }, logger: { log() {}, warn() {} } });
  const mail = { id: "r1", message_id: "<a@x>", from: "Alice <alice@x.com>", subject: "Launch Crab (CRAB)", text: "wallet " + ADDR, authentication: { spf: "pass", dkim: "pass", dmarc: "pass" }, headers: {} };
  assert.equal(await svc.processMail(mail), "ok");
  assert.equal(sent.length, 1); const r = sent[0];
  assert.deepEqual(r.to, ["alice@x.com"]); assert.equal(r.from, "Pinch <launch@clawdmail.app>");
  assert.match(r.text, /explorer\.solana\.com\/tx\/sigA\?cluster=devnet/); assert.match(r.text, /\/api\/launch\/meta\/Mint1+1\.json/);
  assert.ok(r.text.includes(DISCLAIMER)); assert.ok(r.text.includes("toly@mail.grokbot.com")); assert.ok(!/mainnet-beta/.test(r.text));
  assert.equal(await svc.processMail(mail), "duplicate"); assert.equal(sent.length, 1);
  assert.equal(await svc.processMail({ ...mail, message_id: "<b@x>" }), "limit:replied:hour");
  assert.equal(await svc.processMail({ ...mail, message_id: "<c@x>" }), "limit:silent:hour"); assert.equal(sent.length, 2);
  assert.equal(await svc.processMail({ ...mail, message_id: "<d@x>", from: "eve@y.com", authentication: { spf: "fail", dkim: "fail" } }), "dropped:auth");
  assert.equal(await svc.processMail({ ...mail, message_id: "<e@x>", from: "mailer-daemon@y.com" }), "ignored:auto");
  assert.equal(await svc.processMail({ ...mail, message_id: "<f@x>", from: "launch@clawdmail.app" }), "ignored:sender");
  bal = 1000; assert.equal(await svc.processMail({ ...mail, message_id: "<g@x>", from: "bob@z.com" }), "faucet");
  assert.match(sent.at(-1).text, /faucet wallet .* is empty/); assert.equal(launches, 1);
  // metadata + recent endpoints (no sender data exposed)
  const call = async (p) => { let status, body; const res = { writeHead(s) { status = s; }, end(b) { body = b; } }; await svc.handle({ method: "GET", headers: {} }, res, new URL(p, "http://x"), { json: (_r, c, b) => { status = c; body = JSON.stringify(b); } }); return { status, body: JSON.parse(body) }; };
  const meta = await call("/api/launch/meta/Mint" + "1".repeat(36) + "1.json"); assert.equal(meta.status, 200); assert.equal(meta.body.symbol, "CRAB");
  const recent = await call("/api/launch/recent"); assert.equal(recent.body.launches.length, 1); assert.ok(!JSON.stringify(recent.body).includes("alice"));
  assert.ok(!JSON.stringify(db.prepare("select * from launches").all()).includes("alice@x.com"), "only sender hashes stored");
});
test("webhook route: rejects bad signature, accepts signed email.received", async () => {
  const db = openLaunchDb(":memory:"); const secret = "whsec_" + crypto.randomBytes(24).toString("base64"); const got = [];
  const fetchImpl = async (u) => { got.push(u); return { ok: true, status: 200, json: async () => ({ id: "r9", message_id: "<z@x>", from: "auto@x.com", subject: "Out of office", headers: {} }) }; };
  const svc = makeLaunchEmail({ db, fetchImpl, launcher: { isValidAddress: () => false, balanceLamports: async () => 0, launch: async () => { throw new Error("no"); } }, env: { LAUNCH_EMAIL_ENABLED: "true", RESEND_WEBHOOK_SECRET: secret, RESEND_API_KEY: "t" }, logger: { log() {}, warn() {} } });
  const body = JSON.stringify({ type: "email.received", data: { email_id: "r9" } }); const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`m.${ts}.${body}`).digest("base64");
  const call = async (headers) => { let status; await svc.handle({ method: "POST", headers }, {}, new URL("http://x/api/launch/email"), { json: (_r, c) => { status = c; }, readBody: async () => Buffer.from(body) }); return status; };
  assert.equal(await call({ "svix-id": "m", "svix-timestamp": ts, "svix-signature": "v1,AAAA" }), 401); assert.equal(got.length, 0);
  assert.equal(await call({ "svix-id": "m", "svix-timestamp": ts, "svix-signature": "v1," + sig }), 200);
  await new Promise((r) => setTimeout(r, 20)); assert.deepEqual(got, ["https://api.resend.com/emails/receiving/r9"]);
  assert.equal(db.prepare("select outcome from launch_messages").get().outcome, "ignored:auto");
});
