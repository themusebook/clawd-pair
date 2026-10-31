// Holder-rewards eligibility per SNAPSHOTS.md (§3 scoring/exclusions, §4 leaf format). Read-only, no transactions.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
export const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58decode(s) { let n = 0n; for (const ch of s) { const i = ALPHA.indexOf(ch); if (i < 0) throw new Error("bad b58"); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const ch of s) { if (ch === "1") out.unshift(0); else break; } return Buffer.from(out); }
export const isPubkey = (s) => { try { return B58.test(s) && b58decode(s).length === 32; } catch { return false; } };
export const isOnCurve = (s) => { try { ed25519.ExtendedPoint.fromHex(b58decode(s)); return true; } catch { return false; } };
// Same leaf as scripts/snapshot.ts + step5-snapshot-merkle.mjs: sha256(0x00 || wallet(32) || amount u64 BE)
export const leafHash = (w, amt) => crypto.createHash("sha256").update(Buffer.concat([Buffer.from([0]), b58decode(w), Buffer.from(BigInt(amt).toString(16).padStart(16, "0"), "hex")])).digest("hex");

export function loadRewards(dir) {
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, "rewards-config.json"), "utf8"));
  const by = new Map();
  for (const l of fs.readFileSync(path.join(dir, "airdrop-wallets.csv"), "utf8").trim().split(/\r?\n/).slice(1)) {
    const [w, ta, q, p] = l.split(","); if (!isPubkey(w)) continue;
    const e = by.get(w) || { wallet: w, tokenAccounts: [], quantity: 0, percentage: 0 }; e.tokenAccounts.push(ta); e.quantity += Number(q); e.percentage += Number(p); by.set(w, e);
  }
  const rows = [...by.values()].sort((a, b) => b.quantity - a.quantity); rows.forEach((r, i) => (r.rank = i + 1));
  const supply = rows.reduce((s, r) => s + r.quantity, 0) / (rows.reduce((s, r) => s + r.percentage, 0) / 100); // snapshot's own % denominator
  const cap = cfg.capPctSupply ? (supply * cfg.capPctSupply) / 100 : Infinity;
  const excl = { ...cfg.exclude, ...cfg.cexHotWallets, ...cfg.creatorDevWallets };
  const uw = cfg.userWallet || {};
  for (const r of rows) {
    r.reason = excl[r.wallet] || (uw.wallet === r.wallet && uw.treatment === "exclude" ? "user-wallet(excluded: pending user decision)" : null)
      || (cfg.excludeOffCurve && !isOnCurve(r.wallet) ? "off-curve(PDA/program-owned)" : null) || (r.quantity < (cfg.minBal || 0) ? "below-MIN_BAL" : null);
    const c = uw.wallet === r.wallet && uw.treatment === "include" ? Infinity : cap;
    r.score = r.reason ? 0 : Math.min(r.quantity, c); r.capped = !r.reason && r.quantity > c;
    r.review = cfg.pendingReview?.[r.wallet] || null;
  }
  const sum = rows.reduce((s, r) => s + r.score, 0); rows.forEach((r) => (r.sharePct = sum ? (100 * r.score) / sum : 0));
  const epochDir = path.join(dir, "epochs");
  const epochs = fs.existsSync(epochDir) ? fs.readdirSync(epochDir).filter((f) => /^epoch-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(epochDir, f), "utf8"))).sort((a, b) => b.epoch - a.epoch) : [];
  const latest = epochs.find((e) => e.pool != null) || null; // {epoch, pool (CLAWD base units), root, ...}
  const wallets = new Map(rows.map((r) => [r.wallet, r]));
  const stats = { rulesVersion: cfg.rulesVersion, holders: rows.length, eligible: rows.filter((r) => r.score > 0).length, excluded: rows.filter((r) => r.reason).length, capped: rows.filter((r) => r.capped).length, capPctSupply: cfg.capPctSupply, minBal: cfg.minBal, userWalletTreatment: uw.treatment, supplyBasis: Math.round(supply), sumScore: sum, epochPublished: latest ? latest.epoch : null };
  const check = (w) => {
    const r = wallets.get(w); const base = { wallet: w, holders: rows.length, rulesVersion: cfg.rulesVersion };
    if (!r) return { ...base, inSnapshot: false, eligible: false, rewards: latest ? null : "no rewards distributed yet" };
    const out = { ...base, inSnapshot: true, rank: r.rank, quantity: r.quantity, percentage: r.percentage, eligible: r.score > 0, excludedReason: r.reason, capped: r.capped, score: r.score, sharePct: +r.sharePct.toFixed(6), review: r.review };
    if (!latest) return { ...out, rewards: "no rewards distributed yet" };
    const amt = BigInt(Math.floor(Number(latest.pool) * r.score / sum)); // reward = floor(pool * score / Σscore)
    return { ...out, epoch: latest.epoch, rewardAmount: amt.toString(), leaf: r.score > 0 ? leafHash(w, amt) : null };
  };
  return { stats, rows, check };
}
