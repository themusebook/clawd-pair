// tolybot: wallet sign-in (message signature only, never a transaction), 1h server-side sessions,
// xAI Responses API chat (server-side key), per-session quota of 1 image + 1 video, contact form via Resend, airdrop DB.
import crypto from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { isPubkey, b58decode } from "./rewards.mjs";
import { openDb, setFlag, lookup, exportCsv, IDS } from "./db.mjs";

const XAI = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-4.7";
const IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || "grok-imagine-image-2.0";
const VIDEO_MODEL = process.env.XAI_VIDEO_MODEL || "grok-imagine-video-1.5-lite";
export const SESSION_MS = Number(process.env.SESSION_MS || 60 * 60_000);
const NONCE_MS = 5 * 60_000;
const CLAWD_MINT = process.env.CLAWD_MINT || "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const CONTACT_TO = process.env.CONTACT_TO || "tolybot@clawdmail.app";
const CONTACT_FROM = process.env.CONTACT_FROM || "Pinch contact <contact@clawdmail.app>";
const SYSTEM = `You are tolybot, an AI assistant on pinch.musebook.trade. Your name is "tolybot". You are NOT Anatoly Yakovenko and must never claim to be, speak as, or impersonate him or any real person. You are not affiliated with or endorsed by the Solana Foundation. Never give financial advice, never promise or imply returns, never say anything is the "first ever". You cannot sign or send transactions. You may call generate_image or generate_video once each per session when the user asks for one. Contact: toly@mail.grokbot.com. Keep answers short.`;
const TOOLS = [
  { type: "function", name: "generate_image", description: "Generate one image from a text prompt (max 1 per session).", parameters: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } },
  { type: "function", name: "generate_video", description: "Start one short video generation from a text prompt (max 1 per session). Returns a job id the UI polls.", parameters: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } },
  ...(process.env.XAI_SEARCH_TOOLS === "true" ? [{ type: "web_search" }, { type: "x_search" }] : []),
];

export const signInMessage = (wallet, nonce, issuedAt) => `pinch.musebook.trade wants you to sign in to tolybot with your Solana wallet:\n${wallet}\n\nThis is a message signature only. It is not a transaction and costs nothing.\n\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

function limiter(max, windowMs) { const m = new Map(); return (k) => { const now = Date.now(); const e = m.get(k); if (!e || now - e.t > windowMs) { m.set(k, { t: now, n: 1 }); if (m.size > 50000) m.clear(); return true; } return ++e.n <= max; }; }

export function makeTolybot({ rpc = "", db = openDb(), fetchImpl = fetch, now = () => Date.now() } = {}) {
  const nonces = new Map(), sessions = new Map(), videoJobs = new Map();
  const nonceLimit = limiter(30, 60_000), chatLimit = limiter(30, 60_000), contactLimit = limiter(5, 60 * 60_000), checkLimit = limiter(30, 60_000), airdropLimit = limiter(10, 60 * 60_000);
  const xaiKey = () => process.env.XAI_API_KEY || "";
  const xai = async (p, init = {}) => { const r = await fetchImpl(XAI + p, { ...init, headers: { authorization: `Bearer ${xaiKey()}`, "content-type": "application/json" }, signal: AbortSignal.timeout(120_000) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`xai ${r.status}`); return j; };
  const gc = () => { const t = now(); for (const [k, v] of nonces) if (t - v.at > NONCE_MS) nonces.delete(k); for (const [k, v] of sessions) if (t > v.exp) sessions.delete(k); };

  function getSession(req) {
    const h = String(req.headers.authorization || ""); const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
    const s = tok && sessions.get(tok); if (!s) return null;
    if (now() > s.exp) { sessions.delete(tok); return null; }
    return s;
  }
  function issueNonce(wallet) {
    if (!isPubkey(wallet)) return { status: 400, body: { error: "invalid wallet" } };
    gc(); const nonce = crypto.randomBytes(16).toString("hex"), issuedAt = new Date(now()).toISOString();
    nonces.set(nonce, { wallet, issuedAt, at: now() });
    return { status: 200, body: { nonce, issuedAt, message: signInMessage(wallet, nonce, issuedAt) } };
  }
  function verify({ wallet, nonce, signature }) {
    const n = nonces.get(nonce); if (!n || n.wallet !== wallet) return { status: 401, body: { error: "unknown or used nonce" } };
    nonces.delete(nonce); // single use
    if (now() - n.at > NONCE_MS) return { status: 401, body: { error: "nonce expired" } };
    let ok = false; try { ok = ed25519.verify(Buffer.from(String(signature), "base64"), Buffer.from(signInMessage(wallet, nonce, n.issuedAt)), b58decode(wallet)); } catch { ok = false; }
    if (!ok) return { status: 401, body: { error: "bad signature" } };
    const token = crypto.randomBytes(32).toString("hex"), exp = now() + SESSION_MS;
    sessions.set(token, { wallet, exp, image: 0, video: 0, chatted: false, history: [] });
    setFlag(db, wallet, "signed_in");
    return { status: 200, body: { token, wallet, expiresAt: new Date(exp).toISOString() } };
  }
  // Quota is per wallet per session, claimed atomically before calling xAI.
  function claim(s, kind) { if (s[kind] >= 1) return false; s[kind]++; return true; }
  async function genImage(s, prompt) {
    if (!claim(s, "image")) return { error: "image quota used (1 per session)" };
    try { const j = await xai("/images/generations", { method: "POST", body: JSON.stringify({ model: IMAGE_MODEL, prompt: String(prompt).slice(0, 1000), n: 1 }) }); return { url: j.data?.[0]?.url || null }; }
    catch (e) { return { error: "image generation failed" }; }
  }
  async function genVideo(s, prompt) {
    if (!claim(s, "video")) return { error: "video quota used (1 per session)" };
    try { const j = await xai("/videos/generations", { method: "POST", body: JSON.stringify({ model: VIDEO_MODEL, prompt: String(prompt).slice(0, 1000) }) }); const id = j.request_id || j.id; if (id) videoJobs.set(id, s.wallet); return { videoId: id }; }
    catch (e) { return { error: "video generation failed" }; }
  }
  async function chat(s, message) {
    message = String(message || "").trim().slice(0, 4000); if (!message) return { status: 400, body: { error: "empty message" } };
    if (!xaiKey()) return { status: 503, body: { error: "chat not configured" } };
    if (!s.chatted) { s.chatted = true; setFlag(db, s.wallet, "signed_and_chatted"); }
    s.history.push({ role: "user", content: message }); s.history = s.history.slice(-20);
    let input = [{ role: "system", content: SYSTEM }, ...s.history]; const media = [];
    for (let step = 0; step < 4; step++) {
      const r = await xai("/responses", { method: "POST", body: JSON.stringify({ model: MODEL, input, tools: TOOLS, store: false }) });
      const calls = (r.output || []).filter((o) => o.type === "function_call");
      if (!calls.length) {
        const text = (r.output || []).filter((o) => o.type === "message").flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n") || r.output_text || "";
        s.history.push({ role: "assistant", content: text }); return { status: 200, body: { text, media, quota: { image: 1 - s.image, video: 1 - s.video } } };
      }
      input = [...input, ...r.output];
      for (const c of calls) {
        let args = {}; try { args = JSON.parse(c.arguments || "{}"); } catch {}
        const out = c.name === "generate_image" ? await genImage(s, args.prompt || message) : c.name === "generate_video" ? await genVideo(s, args.prompt || message) : { error: "unknown tool" };
        if (out.url) media.push({ type: "image", url: out.url }); if (out.videoId) media.push({ type: "video", id: out.videoId });
        input.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(out) });
      }
    }
    return { status: 200, body: { text: "(stopped after several tool steps)", media, quota: { image: 1 - s.image, video: 1 - s.video } } };
  }
  async function clawdHolder(wallet) {
    if (!rpc) return null;
    const r = await fetchImpl(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [wallet, { mint: CLAWD_MINT }, { encoding: "jsonParsed" }] }), signal: AbortSignal.timeout(10_000) });
    const j = await r.json(); return (j.result?.value || []).some((a) => Number(a.account?.data?.parsed?.info?.tokenAmount?.amount || 0) > 0);
  }
  async function contact(body, ip) {
    if (body.website) return { status: 200, body: { ok: true } }; // honeypot: pretend success
    if (!contactLimit(ip)) return { status: 429, body: { error: "too many messages, try later" } };
    const email = String(body.email || "").trim(), message = String(body.message || "").trim();
    if (!/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i.test(email)) return { status: 400, body: { error: "valid email required" } };
    if (message.length < 2 || message.length > 5000) return { status: 400, body: { error: "message must be 2-5000 characters" } };
    if (!process.env.RESEND_API_KEY) return { status: 503, body: { error: "contact not configured" } };
    const r = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: CONTACT_FROM, to: [CONTACT_TO], reply_to: email, subject: `Pinch contact form: ${email}`, text: `From: ${email}\n\n${message}` }) });
    return r.ok ? { status: 200, body: { ok: true } } : { status: 502, body: { error: "send failed" } };
  }

  // Returns true if handled.
  return async function handle(req, res, url, { json, readBody, clientIp }) {
    const p = url.pathname; if (!p.startsWith("/api/tolybot/") && !["/api/contact", "/api/check", "/api/check/methods", "/api/admin/users.csv"].includes(p)) return false;
    const ip = clientIp(req); const body = async () => { try { return JSON.parse((await readBody(req)).toString() || "{}"); } catch { return {}; } };
    const send = (r) => json(res, r.status, r.body);
    if (p === "/api/contact" && req.method === "POST") return send(await contact(await body(), ip)), true;
    if (p === "/api/check/methods") return json(res, 200, { methods: Object.entries(IDS).map(([id, label]) => ({ id, label })) }), true;
    if (p === "/api/check" && req.method === "POST") {
      if (!checkLimit(ip)) return json(res, 429, { error: "too many lookups, slow down" }), true;
      const b = await body(); const r = lookup(db, String(b.method || ""), b.value); return r ? json(res, 200, r) : json(res, 400, { error: "pick a method and enter a value" }), true;
    }
    if (p === "/api/admin/users.csv") {
      const t = String(req.headers.authorization || "").replace(/^Bearer /, ""), want = process.env.ADMIN_TOKEN || "";
      if (!want || t.length !== want.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(want))) return json(res, 401, { error: "unauthorized" }), true;
      res.writeHead(200, { "content-type": "text/csv", "cache-control": "no-store", "content-disposition": "attachment; filename=users.csv" }); res.end(exportCsv(db)); return true;
    }
    if (p === "/api/tolybot/nonce") { if (!nonceLimit(ip)) return json(res, 429, { error: "slow down" }), true; return send(issueNonce(url.searchParams.get("wallet") || "")), true; }
    if (p === "/api/tolybot/verify" && req.method === "POST") return send(verify(await body())), true;
    const s = getSession(req); if (!s) return json(res, 401, { error: "session expired or missing, sign in again" }), true;
    if (p === "/api/tolybot/session") return json(res, 200, { wallet: s.wallet, expiresAt: new Date(s.exp).toISOString(), quota: { image: 1 - s.image, video: 1 - s.video } }), true;
    if (p === "/api/tolybot/chat" && req.method === "POST") { if (!chatLimit(s.wallet)) return json(res, 429, { error: "slow down" }), true; return send(await chat(s, (await body()).message)), true; }
    if (p === "/api/tolybot/image" && req.method === "POST") { const r = await genImage(s, (await body()).prompt || ""); return json(res, r.error ? 429 : 200, r), true; }
    if (p === "/api/tolybot/video" && req.method === "POST") { const r = await genVideo(s, (await body()).prompt || ""); return json(res, r.error ? 429 : 200, r), true; }
    if (p.startsWith("/api/tolybot/video/")) { const id = p.slice(19); if (videoJobs.get(id) !== s.wallet) return json(res, 404, { error: "not found" }), true; try { const j = await xai(`/videos/${encodeURIComponent(id)}`); return json(res, 200, { status: j.status, url: j.video?.url || j.url || null }), true; } catch { return json(res, 502, { error: "poll failed" }), true; } }
    if (p === "/api/tolybot/airdrop" && req.method === "POST") { if (!airdropLimit(s.wallet)) return json(res, 429, { error: "slow down" }), true; setFlag(db, s.wallet, "airdrop_submitted"); return json(res, 200, { ok: true }), true; }
    if (p === "/api/tolybot/holder" && req.method === "POST") { const h = await clawdHolder(s.wallet).catch(() => null); if (h === null) return json(res, 503, { error: "holder check unavailable" }), true; if (h) setFlag(db, s.wallet, "clawd_holder"); return json(res, 200, { clawd_holder: h }), true; }
    return json(res, 404, { error: "not found" }), true;
  };
}
