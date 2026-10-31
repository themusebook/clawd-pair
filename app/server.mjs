// Pinch web server: serves dist/, proxies Solana RPC + WS (secrets stay server-side), live feeds.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.ACCESS_TOKEN || "";
const CLAWD = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const PUMPAI = process.env.PUMPAI_MCP_URL || "https://pumpai.ai/mcp";
// Solana Tracker RPC authenticates via ?api_key=<key> on both https and wss URLs.
const withKey = (u) => { if (!u) return ""; const x = new URL(u); if (TOKEN && !x.searchParams.has("api_key")) x.searchParams.set("api_key", TOKEN); return x.toString(); };
const RPC = withKey(process.env.RPC_URL);
const WSS = withKey(process.env.WSS_URL);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain" };
const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, no) => { let n = 0; const c = []; req.on("data", (d) => { n += d.length; if (n > 1e6) { no(new Error("too large")); req.destroy(); } else c.push(d); }); req.on("end", () => ok(Buffer.concat(c))); req.on("error", no); });
const cached = (ms, fn) => { let at = 0, val, p; return async () => { if (val && Date.now() - at < ms) return val; p ??= fn().then((v) => { val = v; at = Date.now(); return v; }).finally(() => { p = null; }); try { return await p; } catch (e) { if (val) return val; throw e; } }; };

async function mcpCall(name, args = {}) {
  const r = await fetch(PUMPAI, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } }), signal: AbortSignal.timeout(8000) });
  let t = await r.text();
  if (t.startsWith("event:") || t.startsWith("data:")) t = t.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).pop() || "{}";
  const j = JSON.parse(t); if (j.error) throw new Error(j.error.message);
  const txt = j.result?.content?.find((c) => c.type === "text")?.text ?? "null";
  try { return JSON.parse(txt); } catch { return txt; }
}
const getLaunches = cached(4000, async () => {
  const raw = await mcpCall("get_recent_launches", {});
  const list = Array.isArray(raw) ? raw : raw?.launches || raw?.items || [];
  return { updatedAt: new Date().toISOString(), launches: list.filter((l) => l?.mint).slice(0, 40).map((l) => ({ mint: l.mint, name: l.name, symbol: l.symbol, image: l.imageUri || l.image || "", time: l.time, marketCapSol: l.marketCapSol ?? null, launchpad: l.launchpad, isV2: !!l.isV2, url: `https://pump.fun/coin/${l.mint}` })) };
});
const getClawd = cached(8000, async () => {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CLAWD}`, { signal: AbortSignal.timeout(8000) });
  const pairs = ((await r.json()).pairs || []).filter((p) => p.chainId === "solana" && p.baseToken?.address === CLAWD).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  const p = pairs[0]; if (!p) throw new Error("no pairs");
  const vol24 = pairs.reduce((s, x) => s + (x.volume?.h24 || 0), 0), liq = pairs.reduce((s, x) => s + (x.liquidity?.usd || 0), 0);
  return { source: "dexscreener", updatedAt: new Date().toISOString(), mint: CLAWD, name: p.baseToken.name, symbol: p.baseToken.symbol, priceUsd: Number(p.priceUsd), priceNative: Number(p.priceNative), marketCap: p.marketCap ?? null, fdv: p.fdv ?? null, volume24h: vol24, liquidityUsd: liq, change: p.priceChange || {}, txns24h: p.txns?.h24 || null, holders: null, pairs: pairs.length, dex: p.dexId, pairUrl: p.url };
});

// Holder rewards (SNAPSHOTS.md): CSV snapshot + config stay server-side; never bundled.
import { loadRewards, isPubkey } from "./server/rewards.mjs";
const REWARDS = loadRewards(path.join(path.dirname(fileURLToPath(import.meta.url)), "server", "data"));
console.log(`rewards: ${REWARDS.stats.owners} holders, ${REWARDS.stats.eligible} eligible`);

import { makeStore, verifyOwner, cleanNote, ipHash, signMessageText, MAX_NOTE } from "./server/submissions.mjs";
const SUBS = await makeStore(); console.log(`submissions store: ${SUBS.kind.startsWith("file") ? "file (set CONVEX_URL+SUBMIT_SECRET for Convex)" : "convex"}`);
const clientIp = (req) => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
// Fixed-window per-IP limiter.
function limiter(max, windowMs) { const m = new Map(); return (ip) => { const now = Date.now(); const e = m.get(ip); if (!e || now - e.t > windowMs) { m.set(ip, { t: now, n: 1 }); if (m.size > 50000) m.clear(); return true; } return ++e.n <= max; }; }
const submitLimit = limiter(10, 60 * 60_000), lookupLimit = limiter(120, 60_000), voiceLimit = limiter(Number(process.env.VOICE_SESSIONS_PER_HOUR || 6), 60 * 60_000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/rpc" && req.method === "POST") {
      if (!RPC) return json(res, 503, { error: "RPC not configured" });
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: await readBody(req), signal: AbortSignal.timeout(20000) });
      res.writeHead(r.status, { "content-type": "application/json", "cache-control": "no-store" }); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (url.pathname === "/api/airdrop/stats" || url.pathname === "/api/rewards/stats") return json(res, 200, REWARDS.stats);
    if (url.pathname === "/api/airdrop/check" || url.pathname === "/api/rewards/check") {
      const w = (url.searchParams.get("wallet") || "").trim();
      if (!isPubkey(w)) return json(res, 400, { error: "invalid wallet: expected base58 Solana public key" });
      return json(res, 200, REWARDS.check(w));
    }
    if (url.pathname.startsWith("/api/token-metadata/")) { // stateless metadata JSON for voice/UI launches (encoded in the URL)
      const raw = url.pathname.slice(20); if (raw.length > 2000) return json(res, 414, { error: "too long" });
      try { const m = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); const str = (v, n) => String(v || "").slice(0, n);
        const img = /^https:\/\//.test(m.image || "") ? str(m.image, 300) : "";
        res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=31536000, immutable" }); return res.end(JSON.stringify({ name: str(m.name, 32), symbol: str(m.symbol, 10), description: str(m.description, 500), image: img, showName: true, createdOn: "https://pinch.musebook.trade" }));
      } catch { return json(res, 400, { error: "bad metadata" }); } }
    if (url.pathname === "/api/airdrop/sign-message") { const w = url.searchParams.get("wallet") || ""; if (!isPubkey(w)) return json(res, 400, { error: "invalid wallet" }); const ts = Date.now(); return json(res, 200, { ts, message: signMessageText(w, ts) }); }
    if (url.pathname === "/api/airdrop/submit" && req.method === "POST") {
      const ip = clientIp(req); if (!submitLimit(ip)) return json(res, 429, { error: "too many submissions, try later" });
      let b; try { b = JSON.parse((await readBody(req)).toString() || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
      const w = String(b.wallet || "").trim(); if (!isPubkey(w)) return json(res, 400, { error: "invalid wallet: expected base58 Solana public key" });
      if (b.note && String(b.note).length > MAX_NOTE) return json(res, 400, { error: `note max ${MAX_NOTE} chars` });
      const verified = b.signature ? verifyOwner(w, b.ts, b.signature) : false;
      if (b.signature && !verified) return json(res, 400, { error: "signature did not verify (sign the exact message within 10 minutes)" });
      const r = await SUBS.submit({ wallet: w, note: cleanNote(b.note), verified, ipHash: ipHash(ip) });
      return json(res, 200, { wallet: w, ...r, label: r.verified ? "verified owner" : "unverified", message: "Submitted, pending review. This does not make the wallet eligible; the owner reviews submissions." });
    }
    if (url.pathname === "/api/airdrop/submission") {
      if (!lookupLimit(clientIp(req))) return json(res, 429, { error: "slow down" });
      const w = (url.searchParams.get("wallet") || "").trim(); if (!isPubkey(w)) return json(res, 400, { error: "invalid wallet" });
      const r = await SUBS.get(w); return json(res, 200, r ? { submitted: true, ...r, label: r.verified ? "verified owner" : "unverified" } : { submitted: false, wallet: w });
    }
    if (url.pathname === "/api/airdrop/submissions") {
      const tok = process.env.ADMIN_TOKEN, got = String(req.headers["x-admin-token"] || "");
      if (!tok || got.length !== tok.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(tok))) return json(res, 401, { error: "unauthorized" });
      const rows = await SUBS.list(url.searchParams.get("status") || undefined); return json(res, 200, { count: rows.length, store: SUBS.kind.split(":")[0], submissions: rows });
    }
    if (url.pathname === "/api/launches") return json(res, 200, await getLaunches());
    if (url.pathname === "/api/health") return json(res, 200, { ok: true, pumpai: await mcpCall("get_health").catch((e) => ({ error: String(e.message) })) });
    if (url.pathname === "/api/clawd") return json(res, 200, await getClawd());
    if (url.pathname === "/api/launches/stream") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      const push = () => getLaunches().then((d) => res.write(`data: ${JSON.stringify(d)}\n\n`)).catch(() => {});
      push(); const t = setInterval(push, 5000); req.on("close", () => clearInterval(t)); return;
    }
    let f = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html"); // SPA fallback (/proof etc.)
    const ext = path.extname(f);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": f.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache" });
    fs.createReadStream(f).pipe(res);
  } catch (e) { if (!res.headersSent) json(res, 502, { error: "upstream error" }); else res.end(); console.error(url.pathname, e.message); }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
// ---- /voice: xAI realtime agent bridge. XAI_API_KEY stays here; the browser only talks to /voice. ----
const XAI_KEY = process.env.XAI_API_KEY || "", XAI_AGENT = process.env.XAI_AGENT_ID || "agent_esdtAGBx2KxO6CO9";
const VOICE_MAX_MS = Number(process.env.VOICE_MAX_SECONDS || 300) * 1000, VOICE_MAX_CONCURRENT = Number(process.env.VOICE_MAX_CONCURRENT || 10);
const VOICE_CLIENT_EVENTS = new Set(["input_audio_buffer.append", "input_audio_buffer.commit", "input_audio_buffer.clear", "conversation.item.create", "response.create", "response.cancel"]);
const LAUNCH_TOOL = { type: "function", name: "prepare_token_launch", description: "Fill the pump.fun token launch form on the Pinch page so the user can review it and sign in their own Phantom wallet. This never signs, sends, or launches anything by itself. Ask for name, symbol and a short description if missing. Only include initial_buy_sol if the user said an amount.",
  parameters: { type: "object", properties: { name: { type: "string", description: "Token name, max 32 chars" }, symbol: { type: "string", description: "Ticker, max 10 chars, no $" }, description: { type: "string" }, image_url: { type: "string", description: "https image URL, optional" }, initial_buy_sol: { type: "number", description: "Optional SOL the user wants to buy at launch" } }, required: ["name", "symbol", "description"] } };
let voiceLive = 0;
function voiceBridge(client, ip) {
  voiceLive++; let configured = false; const q = [];
  const up = new WebSocket(`wss://api.x.ai/v1/realtime?agent_id=${encodeURIComponent(XAI_AGENT)}`, { headers: { Authorization: `Bearer ${XAI_KEY}` } });
  const send = (o) => client.readyState === 1 && client.send(JSON.stringify(o));
  const timer = setTimeout(() => { send({ type: "pinch.session_limit", seconds: VOICE_MAX_MS / 1000 }); close(); }, VOICE_MAX_MS);
  const close = () => { clearTimeout(timer); try { client.close(); } catch {} try { up.close(); } catch {} };
  up.on("message", (m) => { let e; try { e = JSON.parse(m.toString()); } catch { return; }
    if (e.type === "session.updated" && !configured) { configured = true; // keep the agent's own tools, add ours, pin PCM16 24 kHz both ways
      up.send(JSON.stringify({ type: "session.update", session: { tools: [...(e.session?.tools || []).filter((t) => t.name !== LAUNCH_TOOL.name), LAUNCH_TOOL], audio: { input: { format: { type: "audio/pcm", rate: 24000 } }, output: { format: { type: "audio/pcm", rate: 24000 } } } } }));
      q.splice(0).forEach((x) => up.send(x)); send({ type: "pinch.ready", maxSeconds: VOICE_MAX_MS / 1000 }); return; }
    if (e.type === "session.created" || e.type === "session.updated") return send({ type: e.type }); // don't leak agent config to the browser
    if (e.type === "response.function_call_arguments.done" && e.name !== LAUNCH_TOOL.name) return; // agent-side tools aren't ours to run
    send(e); });
  up.on("unexpected-response", (_r, res) => { send({ type: "pinch.error", error: `upstream ${res.statusCode}` }); close(); });
  up.on("close", close); up.on("error", () => { send({ type: "pinch.error", error: "upstream error" }); close(); });
  client.on("message", (m) => { if (m.length > 512 * 1024) return; let e; try { e = JSON.parse(m.toString()); } catch { return; }
    if (!VOICE_CLIENT_EVENTS.has(e.type)) return; // browser can't change session/instructions/tools
    if (e.type === "conversation.item.create" && !["message", "function_call_output"].includes(e.item?.type)) return;
    const s = JSON.stringify(e); configured && up.readyState === 1 ? up.send(s) : q.length < 200 && q.push(s); });
  client.on("close", () => { voiceLive--; close(); }); client.on("error", close);
}
server.on("upgrade", (req, sock, head) => {
  const pn = new URL(req.url, "http://x").pathname;
  if (pn === "/voice") {
    const ip = clientIp(req);
    if (!XAI_KEY) { sock.write("HTTP/1.1 503 Service Unavailable\r\n\r\n"); return sock.destroy(); }
    if (voiceLive >= VOICE_MAX_CONCURRENT || !voiceLimit(ip)) { sock.write("HTTP/1.1 429 Too Many Requests\r\n\r\n"); return sock.destroy(); }
    return wss.handleUpgrade(req, sock, head, (c) => voiceBridge(c, ip));
  }
  if (pn !== "/ws" || !WSS) return sock.destroy();
  wss.handleUpgrade(req, sock, head, (client) => {
    const up = new WebSocket(WSS); const q = [];
    up.on("open", () => { q.splice(0).forEach((m) => up.send(m)); });
    up.on("message", (m, bin) => client.readyState === 1 && client.send(m, { binary: bin }));
    client.on("message", (m, bin) => { const d = bin ? m : m.toString(); up.readyState === 1 ? up.send(d) : q.push(d); });
    const close = () => { try { client.close(); } catch {} try { up.close(); } catch {} };
    up.on("close", close); up.on("error", close); client.on("close", close); client.on("error", close);
  });
});
server.listen(PORT, "0.0.0.0", () => console.log(`pinch server on :${PORT} rpc=${!!RPC} ws=${!!WSS}`));
