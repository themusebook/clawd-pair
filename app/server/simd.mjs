// SIMD client backend: lists Solana Improvement Documents from the official repo, parses frontmatter,
// renders markdown safely (all raw HTML escaped), and checks feature-gate accounts with read-only getMultipleAccounts.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

export const REPO = "solana-foundation/solana-improvement-documents";
export const DISCLAIMER = "Unofficial community draft. Built on Solana. Not affiliated with or endorsed by the Solana Foundation.";
export const CONTACT = "toly@mail.grokbot.com";
const FEATURE_OWNER = "Feature111111111111111111111111111111111111";
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const CLUSTERS = { mainnet: "https://api.mainnet-beta.solana.com", devnet: "https://api.devnet.solana.com", testnet: "https://api.testnet.solana.com" };
const SPEC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "spec");

// ---- frontmatter (the small YAML subset SIMDs use: scalars, quoted scalars, "- item" lists) ----
export function parseFrontmatter(src) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(String(src || ""));
  if (!m) return { meta: {}, body: String(src || "") };
  const meta = {}; let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s*(.*)$/.exec(line) || (key && /^-\s+(.*)$/.exec(line));
    if (item && key) { if (!Array.isArray(meta[key])) meta[key] = meta[key] ? [meta[key]] : []; meta[key].push(unq(item[1])); continue; }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) { key = kv[1].toLowerCase(); meta[key] = kv[2] === "" ? "" : unq(kv[2]); }
  }
  return { meta, body: src.slice(m[0].length) };
}
const unq = (s) => { s = String(s).trim(); return /^(['"]).*\1$/.test(s) ? s.slice(1, -1) : s; };

export function normalizeSimd(file, src) {
  const { meta, body } = parseFrontmatter(src);
  const num = String(meta.simd || (/^(\d{4})/.exec(file) || [])[1] || "").padStart(4, "0");
  const featureRaw = String(meta.feature || "");
  const feature = (featureRaw.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || []).find((k) => B58.test(k)) || null;
  const authors = Array.isArray(meta.authors) ? meta.authors : meta.authors ? [meta.authors] : [];
  const status = titleCase(meta.status || "Unknown");
  return { num, title: String(meta.title || file).trim(), authors, category: meta.category || "", type: meta.type || "",
    status, created: String(meta.created || ""), feature, featureRaw, supersedes: meta.supersedes || null, file,
    development: Array.isArray(meta.development) ? meta.development : [], body };
}
const titleCase = (s) => String(s).trim().replace(/^\w/, (c) => c.toUpperCase());

// ---- safe markdown: every character of source is HTML-escaped; only our own tags are emitted ----
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function safeUrl(u, base = "") {
  u = String(u || "").trim();
  if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
  if (/^#[\w-]*$/.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("//")) return null; // javascript:, data:, protocol-relative...
  return base ? base + u.replace(/^\.?\//, "") : u;
}
function inline(s, base) {
  const codes = []; s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (all, t, u) => {
    const raw = u.replace(/&amp;/g, "&"); const ok = safeUrl(raw, base); return ok ? `<a href="${esc(ok)}" target="_blank" rel="noopener noreferrer">${t || esc(ok)}</a>` : t; });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^\w*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g /* eslint-disable-line no-control-regex */, (_, i) => `<code>${esc(codes[i])}</code>`);
}
export function renderMarkdown(md, { base = "" } = {}) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n"); const out = []; let i = 0;
  const slug = (t) => t.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  while (i < lines.length) {
    const l = lines[i];
    const fence = /^\s*(```|~~~)\s*([\w+-]*)/.exec(l);
    if (fence) { const buf = []; i++; while (i < lines.length && !lines[i].trim().startsWith(fence[1])) buf.push(lines[i++]); i++;
      out.push(`<pre><code${fence[2] ? ` class="lang-${esc(fence[2])}"` : ""}>${esc(buf.join("\n"))}</code></pre>`); continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(l);
    if (h) { const t = inline(h[2], base); out.push(`<h${h[1].length} id="${slug(t)}">${t}</h${h[1].length}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push("<hr/>"); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim(), base));
      const head = row(l); i += 2; const rows = []; while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(row(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`); continue; }
    if (/^\s*>/.test(l)) { const buf = []; while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"), { base })}</blockquote>`); continue; }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (li) { const ordered = /\d/.test(li[2]); const items = [];
      while (i < lines.length) { const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m) { items.push(m[3]); i++; } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1] += " " + lines[i].trim(); i++; } else break; }
      const tag = ordered ? "ol" : "ul"; out.push(`<${tag}>${items.map((t) => `<li>${inline(t, base)}</li>`).join("")}</${tag}>`); continue; }
    if (!l.trim()) { i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    out.push(`<p>${inline(buf.join(" "), base)}</p>`);
  }
  return out.join("\n");
}

// ---- spec sections (source of truth: spec/sections.json + spec/*.md) ----
export function loadSpec(dir = SPEC_DIR) {
  try { const s = JSON.parse(fs.readFileSync(path.join(dir, "sections.json"), "utf8"));
    for (const sec of s.sections) sec.markdown = fs.readFileSync(path.join(dir, sec.file), "utf8");
    return s; } catch (e) { return { sections: [], error: String(e.message) }; }
}
export function sectionsFor(num, spec) { const n = String(num).padStart(4, "0"); return spec.sections.filter((s) => (s.simds || []).includes(n)).map((s) => ({ id: s.id, title: s.title })); }

// ---- feature gate account decoding (Feature { activated_at: Option<u64> }, bincode) ----
export function decodeFeature(acc) {
  if (acc === null) return { state: "inactive" }; // no account: activation not yet scheduled on this cluster
  if (!acc || acc.owner !== FEATURE_OWNER) return { state: "unknown" };
  const d = Buffer.from(acc.data?.[0] || "", "base64");
  if (d.length >= 9 && d[0] === 1) return { state: "active", slot: Number(d.readBigUInt64LE(1)) };
  if (d.length >= 1 && d[0] === 0) return { state: "pending" }; // account created, activation at next epoch boundary
  return { state: "unknown" };
}

// Normative = SIMD status Activated (SIMD-0001: live on mainnet beta), unless the mainnet feature account contradicts it.
export const isLive = (status, mainnetGate) => status === "Activated" && !["inactive", "pending"].includes(mainnetGate);

export function makeSimd({ fetchImpl = fetch, now = Date.now, ttl = 15 * 60_000, token = process.env.GITHUB_TOKEN_SIMD || process.env.GITHUB_TOKEN || "", clusters = CLUSTERS, specDir } = {}) {
  const cache = new Map();
  const cached = async (key, fn, life = ttl) => { const c = cache.get(key); if (c && now() - c.at < life) return c.val;
    try { const val = await fn(); cache.set(key, { at: now(), val }); return val; } catch (e) { if (c) return c.val; throw e; } };
  const retry = async (fn, n = 3) => { for (let a = 1; ; a++) { try { return await fn(); } catch (e) { if (a >= n || /github 40[134]|raw 404/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 300 * a)); } } };
  const gh = (p) => retry(async () => { const r = await fetchImpl(`https://api.github.com${p}`, { headers: { accept: "application/vnd.github+json", "user-agent": "pinch-simd", ...(token ? { authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`github ${r.status}`); return r.json(); });
  const raw = (f) => retry(async () => { const r = await fetchImpl(`https://raw.githubusercontent.com/${REPO}/main/proposals/${encodeURIComponent(f)}`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`raw ${r.status}`); return r.text(); });
  const spec = () => cached("spec", async () => loadSpec(specDir), 60_000);

  const list = () => cached("list", async () => {
    let files, source = "github-api";
    try { files = (await gh(`/repos/${REPO}/contents/proposals`)).filter((f) => f.type === "file" && /^\d{4}-.*\.md$/.test(f.name)).map((f) => f.name); }
    catch (e) { // API rate-limited/unreachable: use the bundled file list, still fetch content from raw.githubusercontent.com
      try { files = JSON.parse(fs.readFileSync(path.join(specDir || SPEC_DIR, "simd-snapshot.json"), "utf8")).simds.map((x) => x.file); source = "snapshot-file-list"; } catch { throw e; } }
    const out = []; let k = 0;
    await Promise.all(Array.from({ length: 8 }, async () => { while (k < files.length) { const f = files[k++]; try { out.push(normalizeSimd(f, await raw(f))); } catch { out.push({ ...normalizeSimd(f, ""), status: "Unknown", fetchError: true }); } } }));
    out.sort((a, b) => a.num.localeCompare(b.num)); return { fetchedAt: new Date(now()).toISOString(), source, simds: out };
  });
  const openPrs = () => cached("prs", async () => (await gh(`/repos/${REPO}/pulls?state=open&per_page=100`)).map((p) => ({ number: p.number, title: p.title, url: p.html_url, updated: p.updated_at, files: null })));
  const prsFor = (num, prs) => { const n = String(Number(num)); const re = new RegExp(`(simd[-\\s#]*0*${n}\\b)|(\\b0*${n}-)`, "i"); return prs.filter((p) => re.test(p.title)); };

  const features = (keys) => cached("feat:" + [...keys].sort().join(","), async () => {
    const res = {};
    await Promise.all(Object.entries(clusters).map(async ([name, url]) => {
      res[name] = {};
      for (let j = 0; j < keys.length; j += 100) { const chunk = keys.slice(j, j + 100);
        try { const r = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [chunk, { encoding: "base64", commitment: "finalized" }] }), signal: AbortSignal.timeout(12000) });
          const j2 = await r.json(); if (!j2.result) throw new Error("rpc");
          chunk.forEach((k, idx) => { res[name][k] = decodeFeature(j2.result.value[idx]); });
        } catch { chunk.forEach((k) => { res[name][k] = { state: "unknown" }; }); } }
    })); return res;
  }, 5 * 60_000);
  const featureFor = (fs_, key) => key ? Object.fromEntries(Object.keys(clusters).map((c) => [c, fs_[c]?.[key] || { state: "unknown" }])) : null;
  const summary = ({ body, ...s }) => s;

  return async function handle(req, res, url, { json }) {
    const p = url.pathname; if (!p.startsWith("/api/simd")) return false;
    try {
      if (p === "/api/simd" || p === "/api/simd/list") {
        const [l, sp] = await Promise.all([list(), spec()]);
        const keys = [...new Set(l.simds.map((s) => s.feature).filter(Boolean))];
        const fs_ = url.searchParams.get("features") === "0" ? {} : await features(keys).catch(() => ({}));
        json(res, 200, { repo: REPO, fetchedAt: l.fetchedAt, source: l.source, disclaimer: DISCLAIMER, simds: l.simds.map((s) => ({ ...summary(s), sections: sectionsFor(s.num, sp), featureStatus: featureFor(fs_, s.feature) })) }); return true;
      }
      if (p === "/api/simd/spec") {
        const [sp, l] = await Promise.all([spec(), list().catch(() => { try { return { ...JSON.parse(fs.readFileSync(path.join(specDir || SPEC_DIR, "simd-snapshot.json"), "utf8")), snapshot: true }; } catch { return { simds: [] }; } })]); const by = Object.fromEntries(l.simds.map((s) => [s.num, s]));
        const fs_ = await features([...new Set(l.simds.map((s) => s.feature).filter(Boolean))]).catch(() => ({}));
        const gate = (s) => (s?.feature ? fs_.mainnet?.[s.feature]?.state || "unknown" : "none");
        json(res, 200, { disclaimer: DISCLAIMER, contact: CONTACT, statusSource: l.snapshot ? `snapshot ${l.takenAt}` : `live ${l.fetchedAt}`, intro: renderMarkdown(sp.intro || ""), sections: sp.sections.map((s) => ({ id: s.id, title: s.title,
          html: renderMarkdown(s.markdown), simds: (s.simds || []).map((n) => ({ num: n, title: by[n]?.title || null, status: by[n]?.status || "Unknown", mainnetGate: gate(by[n]), live: isLive(by[n]?.status, gate(by[n])), discrepancy: by[n]?.status === "Activated" && ["inactive", "pending"].includes(gate(by[n])) })) })) }); return true;
      }
      const m = /^\/api\/simd\/(\d{1,4})$/.exec(p);
      if (m) { const num = m[1].padStart(4, "0"); const [l, sp] = await Promise.all([list(), spec()]); const s = l.simds.find((x) => x.num === num);
        if (!s) { json(res, 404, { error: "SIMD not found" }); return true; }
        const prs = await openPrs().catch(() => null); const fs_ = s.feature ? await features([s.feature]).catch(() => ({})) : {};
        json(res, 200, { ...summary(s), html: renderMarkdown(s.body, { base: `https://github.com/${REPO}/blob/main/proposals/` }), sections: sectionsFor(num, sp), featureStatus: featureFor(fs_, s.feature),
          github: `https://github.com/${REPO}/blob/main/proposals/${s.file}`, prs: prs ? prsFor(num, prs) : null,
          prSearch: `https://github.com/${REPO}/pulls?q=${encodeURIComponent(`is:pr SIMD-${num}`)}`, disclaimer: DISCLAIMER }); return true; }
      json(res, 404, { error: "not found" }); return true;
    } catch (e) { json(res, 502, { error: "SIMD source unavailable", detail: String(e.message).slice(0, 80) }); return true; }
  };
}
