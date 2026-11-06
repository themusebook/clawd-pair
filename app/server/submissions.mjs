// Airdrop consideration submissions. Pending review only: never changes eligibility or rules.
// Storage: Convex (CONVEX_URL + SUBMIT_SECRET) when set, else JSONL file under DATA_DIR (needs a Railway volume to persist).
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { b58decode } from "./rewards.mjs";

export const MAX_NOTE = 280;
export const signMessageText = (wallet, ts) => `Pinch airdrop consideration\nI own this wallet: ${wallet}\nTimestamp: ${ts}`;
export function verifyOwner(wallet, ts, sigB64) {
  if (!sigB64 || !ts) return false; if (Math.abs(Date.now() - Number(ts)) > 10 * 60_000) return false;
  try { return ed25519.verify(Buffer.from(sigB64, "base64"), Buffer.from(signMessageText(wallet, ts)), b58decode(wallet)); } catch { return false; }
}
// No PII: strip emails/phones/urls-ish, collapse whitespace, cap length.
export const cleanNote = (s) => String(s || "").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[removed]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[removed]").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, MAX_NOTE);
export const ipHash = (ip) => crypto.createHash("sha256").update(`${process.env.IP_SALT || "pinch"}:${ip}`).digest("hex").slice(0, 24);

export async function makeStore() {
  const url = process.env.CONVEX_URL, secret = process.env.SUBMIT_SECRET;
  if (url && secret) {
    const { ConvexHttpClient } = await import("convex/browser"); const c = new ConvexHttpClient(url);
    return { kind: "convex",
      submit: (r) => c.mutation("submissions:submit", { secret, ...r }),
      get: (wallet) => c.query("submissions:get", { secret, wallet }),
      list: (status) => c.query("submissions:list", { secret, ...(status ? { status } : {}) }) };
  }
  const dir = process.env.DATA_DIR || "./data"; fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, "airdrop-submissions.jsonl");
  const rows = new Map(); if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); rows.set(r.wallet, { ...rows.get(r.wallet), ...r }); }
  return { kind: `file:${f}`,
    async submit(r) { const ex = rows.get(r.wallet); if (ex) { if (r.verified && !ex.verified) { ex.verified = true; fs.appendFileSync(f, JSON.stringify({ wallet: r.wallet, verified: true }) + "\n"); } return { duplicate: true, status: ex.status, verified: ex.verified, createdAt: ex.createdAt }; }
      const row = { ...r, status: "pending", createdAt: Date.now() }; rows.set(r.wallet, row); fs.appendFileSync(f, JSON.stringify(row) + "\n"); return { duplicate: false, status: "pending", verified: r.verified, createdAt: row.createdAt }; },
    async get(w) { const r = rows.get(w); return r ? { wallet: r.wallet, status: r.status, verified: r.verified, createdAt: r.createdAt } : null; },
    async list(status) { return [...rows.values()].filter((r) => !status || r.status === status).sort((a, b) => b.createdAt - a.createdAt); } };
}
