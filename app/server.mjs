// Pinch web server: serves dist/, proxies Solana RPC + WS (secrets stay server-side), live feeds.
import http from "node:http";
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

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, sock, head) => {
  if (new URL(req.url, "http://x").pathname !== "/ws" || !WSS) return sock.destroy();
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
