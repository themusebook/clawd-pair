// Idempotent import of Privy user-export CSVs (tab-separated) into the users table.
// Usage: DB_PATH=/data/pinch.db node scripts/import-users.mjs file1.csv [file2.csv ...]
// Dedupe by Solana wallet; identifiers are merged (existing values kept), source = ';'-joined file names.
import fs from "node:fs"; import path from "node:path";
import { openDb, normId } from "../server/db.mjs";
import { isPubkey } from "../server/rewards.mjs";
const MAP = { email: ["Email account", "Google account"], x_handle: ["Twitter account"], github: ["Github account", "GitHub account"], discord: ["Discord account"], telegram: ["Telegram account"], farcaster: ["Farcaster account"], eth_wallet: ["External Ethereum accounts", "Embedded Ethereum accounts"] };
const WALLETS = ["External Solana accounts", "Embedded Solana accounts"];
function parse(t) { const d = t.split("\n")[0].includes("\t") ? "\t" : ","; const rows = []; let row = [], f = "", q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"' && f === "") q = true; else if (c === d) { row.push(f); f = ""; } else if (c === "\n") { row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; } else f += c; } if (f || row.length) { row.push(f); rows.push(row); } return rows; }
const first = (v) => String(v || "").split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x && !x.startsWith("placeholder:"));
const db = openDb(); const up = db.prepare(`INSERT INTO users(wallet, email, x_handle, github, discord, telegram, farcaster, eth_wallet, source) VALUES(?,?,?,?,?,?,?,?,?)
  ON CONFLICT(wallet) DO UPDATE SET email=COALESCE(email, excluded.email), x_handle=COALESCE(x_handle, excluded.x_handle), github=COALESCE(github, excluded.github), discord=COALESCE(discord, excluded.discord), telegram=COALESCE(telegram, excluded.telegram), farcaster=COALESCE(farcaster, excluded.farcaster), eth_wallet=COALESCE(eth_wallet, excluded.eth_wallet),
  source=CASE WHEN source IS NULL OR source='' THEN excluded.source WHEN instr(';'||source||';', ';'||excluded.source||';')>0 THEN source ELSE source||';'||excluded.source END, updated_at=datetime('now')`);
const all = new Set();
for (const file of process.argv.slice(2)) {
  const rows = parse(fs.readFileSync(file, "utf8")); const h = rows.shift().map((x) => x.trim()); const col = (r, n) => r[h.indexOf(n)];
  const src = path.basename(file); let n = 0, ws = new Set(), skipped = 0;
  db.exec("BEGIN");
  for (const r of rows) { if (r.length < 2) continue; n++;
    const wallets = WALLETS.flatMap((c) => first(col(r, c))).filter(isPubkey);
    if (!wallets.length) { skipped++; continue; }
    const ids = Object.fromEntries(Object.entries(MAP).map(([k, cs]) => [k, cs.map((c) => normId(k, first(col(r, c))[0] || "")).find(Boolean) || null]));
    for (const w of wallets) { ws.add(w); all.add(w); up.run(w, ids.email, ids.x_handle, ids.github, ids.discord, ids.telegram, ids.farcaster, ids.eth_wallet, src); }
  }
  db.exec("COMMIT");
  console.log(`${src}: rows=${n} wallets=${ws.size} no_solana_wallet=${skipped}`);
}
console.log(`unique wallets this run=${all.size} total users in db=${db.prepare("SELECT count(*) c FROM users").get().c}`);
