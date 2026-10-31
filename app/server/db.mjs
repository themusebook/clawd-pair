// Airdrop users DB: SQLite (node:sqlite, built into Node 22) at DB_PATH. On Railway, mount a volume and set DB_PATH=/data/pinch.db.
import { DatabaseSync } from "node:sqlite"; import fs from "node:fs"; import path from "node:path";
export const FLAGS = ["clawd_holder", "airdrop_submitted", "signed_in", "signed_and_chatted"];
// Identifier columns for /check lookups (exact match, normalized lower-case except wallet).
export const IDS = { wallet: "Solana wallet", email: "Google / email", x_handle: "X (Twitter) handle", github: "GitHub username", discord: "Discord", telegram: "Telegram", farcaster: "Farcaster", eth_wallet: "Ethereum wallet" };
export function openDb(p = process.env.DB_PATH || path.join(process.env.DATA_DIR || "./data", "pinch.db")) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const db = new DatabaseSync(p);
  db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS users (
    wallet TEXT PRIMARY KEY,
    email TEXT, x_handle TEXT, github TEXT, discord TEXT, telegram TEXT, farcaster TEXT, eth_wallet TEXT,
    source TEXT,
    clawd_holder INTEGER NOT NULL DEFAULT 0, clawd_holder_at TEXT,
    airdrop_submitted INTEGER NOT NULL DEFAULT 0, airdrop_submitted_at TEXT,
    signed_in INTEGER NOT NULL DEFAULT 0, signed_in_at TEXT,
    signed_and_chatted INTEGER NOT NULL DEFAULT 0, signed_and_chatted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS u_email ON users(email); CREATE INDEX IF NOT EXISTS u_x ON users(x_handle);
  CREATE INDEX IF NOT EXISTS u_gh ON users(github); CREATE INDEX IF NOT EXISTS u_dc ON users(discord);
  CREATE INDEX IF NOT EXISTS u_tg ON users(telegram); CREATE INDEX IF NOT EXISTS u_fc ON users(farcaster); CREATE INDEX IF NOT EXISTS u_eth ON users(eth_wallet);`);
  return db;
}
export const normId = (k, v) => { v = String(v || "").trim(); if (!v) return ""; if (k === "wallet") return v; v = v.toLowerCase(); if (["x_handle", "github", "telegram", "farcaster"].includes(k)) v = v.replace(/^@/, "").replace(/\s*\(.*\)$/, ""); return v; };
export function setFlag(db, wallet, flag) {
  if (!FLAGS.includes(flag)) throw new Error("bad flag");
  db.prepare(`INSERT INTO users(wallet, source) VALUES(?, 'site') ON CONFLICT(wallet) DO NOTHING`).run(wallet);
  db.prepare(`UPDATE users SET ${flag}=1, ${flag}_at=COALESCE(${flag}_at, datetime('now')), updated_at=datetime('now') WHERE wallet=?`).run(wallet);
}
export function lookup(db, method, value) {
  if (!IDS[method]) return null; const v = normId(method, value); if (!v || v.length > 200) return null;
  const rows = db.prepare(`SELECT source, ${FLAGS.join(",")} FROM users WHERE ${method}=? LIMIT 20`).all(v);
  if (!rows.length) return { onList: false };
  const groups = {}; for (const f of FLAGS) groups[f] = rows.some((r) => r[f] === 1);
  const lists = [...new Set(rows.flatMap((r) => String(r.source || "").split(";").filter(Boolean)))];
  return { onList: true, groups, lists };
}
export function exportCsv(db) {
  const cols = ["wallet", ...Object.keys(IDS).filter((k) => k !== "wallet"), "source", ...FLAGS.flatMap((f) => [f, f + "_at"]), "created_at", "updated_at"];
  const esc = (x) => x == null ? "" : /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x);
  return [cols.join(","), ...db.prepare(`SELECT ${cols.join(",")} FROM users ORDER BY created_at`).all().map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}
