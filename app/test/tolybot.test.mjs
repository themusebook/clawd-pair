// node --test test/  (no network: xAI/Resend fetch is mocked; test key generated in memory, never printed)
import test from "node:test"; import assert from "node:assert"; import os from "node:os"; import fs from "node:fs"; import path from "node:path";
import { ed25519 } from "@noble/curves/ed25519";
import { makeTolybot, signInMessage } from "../server/tolybot.mjs"; import { openDb } from "../server/db.mjs";
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (b) => { let n = BigInt("0x" + Buffer.from(b).toString("hex")), s = ""; while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; } for (const x of b) { if (x) break; s = "1" + s; } return s; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tb-")); process.env.XAI_API_KEY = "test"; process.env.RESEND_API_KEY = "test"; process.env.ADMIN_TOKEN = "admintok";
let clock = Date.now(); const calls = [];
const fetchImpl = async (u, init) => { calls.push(u); const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  if (u.endsWith("/responses")) { const body = JSON.parse(init.body); const hasOut = body.input.some((i) => i.type === "function_call_output");
    if (!hasOut && /image/.test(body.input.at(-1)?.content || "")) return ok({ output: [{ type: "function_call", name: "generate_image", call_id: "c1", arguments: '{"prompt":"crab"}' }] });
    return ok({ output: [{ type: "message", content: [{ type: "output_text", text: "hi from tolybot" }] }] }); }
  if (u.endsWith("/images/generations")) return ok({ data: [{ url: "https://img/x.png" }] });
  if (u.endsWith("/videos/generations")) return ok({ request_id: "vid1" });
  if (u.includes("resend")) return ok({ id: "e1" }); throw new Error("unexpected " + u); };
const db = openDb(path.join(tmp, "t.db")); const h = makeTolybot({ db, fetchImpl, now: () => clock });
async function call(method, p, body, token) { let status, out; const req = { method, headers: { authorization: token ? "Bearer " + token : "" }, socket: {} };
  const res = { writeHead(s) { status = s; }, end(b) { out = b; } };
  await h(req, res, new URL(p, "http://x"), { json: (r, c, b) => { status = c; out = JSON.stringify(b); }, readBody: async () => Buffer.from(JSON.stringify(body || {})), clientIp: () => "1.1.1.1" });
  try { return { status, body: JSON.parse(out) }; } catch { return { status, body: out }; } }
const sk = ed25519.utils.randomPrivateKey(), wallet = b58(ed25519.getPublicKey(sk));
async function signIn() { const n = (await call("GET", "/api/tolybot/nonce?wallet=" + wallet)).body; const sig = Buffer.from(ed25519.sign(Buffer.from(n.message), sk)).toString("base64"); return call("POST", "/api/tolybot/verify", { wallet, nonce: n.nonce, signature: sig }); }

test("sign-in verifies ed25519, rejects bad sig and nonce reuse", async () => {
  const n = (await call("GET", "/api/tolybot/nonce?wallet=" + wallet)).body; assert.match(n.message, /not a transaction/);
  const bad = await call("POST", "/api/tolybot/verify", { wallet, nonce: n.nonce, signature: Buffer.alloc(64).toString("base64") }); assert.equal(bad.status, 401);
  const reuse = await call("POST", "/api/tolybot/verify", { wallet, nonce: n.nonce, signature: Buffer.from(ed25519.sign(Buffer.from(n.message), sk)).toString("base64") }); assert.equal(reuse.status, 401);
  const ok = await signIn(); assert.equal(ok.status, 200); assert.ok(ok.body.token);
  assert.equal(db.prepare("select signed_in from users where wallet=?").get(wallet).signed_in, 1);
});
test("chat + quota: second image/video blocked; first chat sets flag", async () => {
  const t = (await signIn()).body.token;
  const c = await call("POST", "/api/tolybot/chat", { message: "make an image of a crab" }, t); assert.equal(c.status, 200); assert.equal(c.body.media[0].url, "https://img/x.png"); assert.equal(c.body.quota.image, 0);
  assert.equal(db.prepare("select signed_and_chatted from users where wallet=?").get(wallet).signed_and_chatted, 1);
  assert.equal((await call("POST", "/api/tolybot/image", { prompt: "again" }, t)).status, 429);
  assert.equal((await call("POST", "/api/tolybot/video", { prompt: "v" }, t)).status, 200);
  assert.equal((await call("POST", "/api/tolybot/video", { prompt: "v2" }, t)).status, 429);
  assert.equal(calls.filter((u) => u.endsWith("/images/generations")).length, 1); assert.equal(calls.filter((u) => u.endsWith("/videos/generations")).length, 1);
});
test("session expires after 1h server-side", async () => {
  const t = (await signIn()).body.token; assert.equal((await call("GET", "/api/tolybot/session", null, t)).status, 200);
  clock += 60 * 60_000 + 1; assert.equal((await call("GET", "/api/tolybot/session", null, t)).status, 401);
});
test("contact validates input and honeypot", async () => {
  assert.equal((await call("POST", "/api/contact", { email: "nope", message: "hello" })).status, 400);
  assert.equal((await call("POST", "/api/contact", { email: "a@b.co", message: "" })).status, 400);
  const before = calls.length; assert.equal((await call("POST", "/api/contact", { email: "a@b.co", message: "hi", website: "spam" })).status, 200); assert.equal(calls.length, before);
  assert.equal((await call("POST", "/api/contact", { email: "a@b.co", message: "hello there" })).status, 200);
});
test("check is exact match and minimal; admin csv guarded", async () => {
  db.prepare("insert into users(wallet,x_handle,source) values('W1','alice','list.csv')").run();
  const r = await call("POST", "/api/check", { method: "x_handle", value: "@Alice" }); assert.deepEqual(Object.keys(r.body).sort(), ["groups", "lists", "onList"]); assert.equal(r.body.onList, true);
  assert.equal((await call("POST", "/api/check", { method: "x_handle", value: "ali" })).body.onList, false);
  assert.equal((await call("GET", "/api/admin/users.csv")).status, 401);
  assert.equal((await call("GET", "/api/admin/users.csv", null, "admintok")).status, 200);
});
