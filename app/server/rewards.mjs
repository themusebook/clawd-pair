// Holder-rewards eligibility per AIRDROP-PLAN.md (plan steps 1 + 5). Read-only: no keys, no transactions, no amounts promised.
// Rules: config/rules.json, exclusions: config/exclude.json (synced into server/data by scripts-sync-config.sh).
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
export const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58decode(s) { let n = 0n; for (const ch of s) { const i = ALPHA.indexOf(ch); if (i < 0) throw new Error("bad b58"); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const ch of s) { if (ch === "1") out.unshift(0); else break; } return Buffer.from(out); }
export const isPubkey = (s) => { try { return B58.test(s) && b58decode(s).length === 32; } catch { return false; } };
// Same leaf as scripts/snapshot.ts + step5-snapshot-merkle.mjs (for when an epoch is published).
export const leafHash = (w, amt) => crypto.createHash("sha256").update(Buffer.concat([Buffer.from([0]), b58decode(w), Buffer.from(BigInt(amt).toString(16).padStart(16, "0"), "hex")])).digest("hex");

// Shares with a per-wallet cap (fraction of pool); excess is redistributed pro-rata among uncapped wallets.
export function cappedShares(scores, capFrac) {
  const share = new Map(); let open = scores.filter(([, s]) => s > 0), left = 1;
  while (open.length) {
    const tot = open.reduce((a, [, s]) => a + s, 0); const over = open.filter(([, s]) => (left * s) / tot > capFrac);
    if (!over.length || capFrac * open.length <= left) { if (!over.length) { open.forEach(([w, s]) => share.set(w, (left * s) / tot)); break; } }
    over.forEach(([w]) => share.set(w, capFrac)); left -= capFrac * over.length;
    const capped = new Set(over.map(([w]) => w)); open = open.filter(([w]) => !capped.has(w));
  }
  return share;
}

export function loadRewards(dir) {
  const rules = JSON.parse(fs.readFileSync(path.join(dir, "rules.json"), "utf8"));
  const ex = JSON.parse(fs.readFileSync(path.join(dir, "exclude.json"), "utf8"));
  const exclude = new Map(ex.exclude.map((e) => [e.wallet, e.reason])), flags = new Map((ex.flag || []).map((e) => [e.wallet, e.flag]));
  const rows = fs.readFileSync(path.join(dir, "airdrop-wallets.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","))
    .filter((c) => isPubkey(c[0])).map(([wallet, tokenAccount, q, p]) => ({ wallet, tokenAccount, quantity: Number(q), percentage: Number(p) }));
  // Per owner: sum every token account (AIRDROP-PLAN step 1).
  const by = new Map();
  for (const r of rows) { const e = by.get(r.wallet) || { wallet: r.wallet, tokenAccounts: [], quantity: 0, percentage: 0 }; e.tokenAccounts.push(r.tokenAccount); e.quantity += r.quantity; e.percentage += r.percentage; by.set(r.wallet, e); }
  const owners = [...by.values()].sort((a, b) => b.quantity - a.quantity); owners.forEach((o, i) => (o.rank = i + 1));
  for (const o of owners) { o.reason = exclude.get(o.wallet) || (o.quantity < rules.minBal ? `below MIN_BAL (${rules.minBal} CLAWD)` : null); o.flag = flags.get(o.wallet) || null; }
  const elig = owners.filter((o) => !o.reason);
  const shares = cappedShares(elig.map((o) => [o.wallet, o.quantity]), rules.capPctOfEpochPool / 100);
  elig.forEach((o) => { o.sharePct = 100 * (shares.get(o.wallet) || 0); o.capped = Math.abs(o.sharePct - rules.capPctOfEpochPool) < 1e-9; });
  const epochDir = path.join(dir, "epochs");
  const epochs = fs.existsSync(epochDir) ? fs.readdirSync(epochDir).filter((f) => /^epoch-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(epochDir, f), "utf8"))) : [];
  const pool = epochs.filter((e) => e.pool != null && e.root).sort((a, b) => b.epoch - a.epoch)[0] || null; // only a funded, published epoch
  const sum = (a) => a.reduce((s, o) => s + o.quantity, 0);
  const stats = { rulesVersion: rules.rulesVersion, snapshot: "owner holder export 2026-10-31 (top 1,000 rows; epoch 0 will use a full on-chain snapshot)", rows: rows.length, owners: owners.length, exportTotal: Math.round(sum(owners)),
    eligible: elig.length, eligibleHolding: Math.round(sum(elig)), eligiblePctOfExport: +(100 * sum(elig) / sum(owners)).toFixed(2),
    excluded: owners.filter((o) => exclude.has(o.wallet)).map((o) => ({ wallet: o.wallet, reason: o.reason, pct: o.percentage })), belowMinBal: owners.filter((o) => !exclude.has(o.wallet) && o.reason).length,
    capped: elig.filter((o) => o.capped).length, minBal: rules.minBal, capPctOfEpochPool: rules.capPctOfEpochPool, epochDays: rules.epochDays, unclaimed: rules.unclaimed,
    pool: pool ? { epoch: pool.epoch, amount: pool.pool, root: pool.root } : null, poolStatus: pool ? "published" : rules.funding.status };
  const check = (w) => {
    const o = by.get(w); const base = { wallet: w, rulesVersion: rules.rulesVersion, poolStatus: stats.poolStatus };
    if (!o) return { ...base, inSnapshot: false, eligible: false };
    const r = { ...base, inSnapshot: true, rank: o.rank, quantity: o.quantity, percentage: o.percentage, eligible: !o.reason, excludedReason: o.reason, flag: o.flag,
      estimatedSharePct: o.reason ? 0 : +o.sharePct.toFixed(6), capped: !!o.capped, note: "Estimate from the snapshot only; final share uses time-weighted hourly samples. No amount is promised until a funded epoch is published." };
    if (pool && !o.reason) { const amt = BigInt(Math.floor(Number(pool.pool) * o.sharePct / 100)); Object.assign(r, { epoch: pool.epoch, rewardAmount: amt.toString(), leaf: leafHash(w, amt) }); }
    return r;
  };
  return { stats, owners, check };
}
