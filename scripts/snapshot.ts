// READ-ONLY one-shot holder snapshot for $CLAWD (Token-2022). No keys, no signing, no transactions.
// Usage: bun scripts/snapshot.ts   (optional env RPC=<keyless mainnet RPC>)
// Output: snapshots/clawd-<slot>.json (+ .csv) with holders, exclusions, merkle root.
// Leaf / tree format matches scripts/step5-snapshot-merkle.mjs (sha256, 0x00 leaf / 0x01 node prefix, sorted pairs).
import { Connection, PublicKey } from "@solana/web3.js";
import crypto from "crypto"; import fs from "fs";

const MINT = new PublicKey("8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump");
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const SPL = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const EXCLUDE_OWNERS: Record<string, string> = {
  GBzd5ooMFkYtYgzUMKfzyaEJpvzxvm5FK4FDJcpVJJcH: "pumpswap-pool",
  HJYrK1vLqwQYjUJn3taqfaFX4yf7Yx6qCHAUGag9rAHj: "bonding-curve",
  // TODO: known CEX hot wallets, creator wallet, user's ~34% wallet (user decision)
};
const RPCS = (process.env.RPC ? [process.env.RPC] : []).concat([
  "https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com", "https://solana.drpc.org",
]);
const H = (b: Buffer) => crypto.createHash("sha256").update(b).digest();
const leafHash = (w: string, amt: bigint) => H(Buffer.concat([Buffer.from([0]), new PublicKey(w).toBuffer(), Buffer.from(amt.toString(16).padStart(16, "0"), "hex")]));
const pair = (x: Buffer, y: Buffer) => H(Buffer.concat([Buffer.from([1]), ...(Buffer.compare(x, y) <= 0 ? [x, y] : [y, x])]));
const merkleRoot = (ls: Buffer[]) => { let l = ls; if (!l.length) return Buffer.alloc(32); while (l.length > 1) { const n: Buffer[] = []; for (let i = 0; i < l.length; i += 2) n.push(i + 1 < l.length ? pair(l[i], l[i + 1]) : l[i]); l = n; } return l[0]; };

async function run(rpc: string) {
  const c = new Connection(rpc, { commitment: "confirmed" });
  const slot = await c.getSlot();
  const mintInfo = await c.getParsedAccountInfo(MINT);
  const owner = mintInfo.value?.owner.toBase58();
  const prog = owner === SPL.toBase58() ? SPL : T22;
  const supplyRes = await c.getTokenSupply(MINT); const supply = BigInt(supplyRes.value.amount); const dec = supplyRes.value.decimals;
  let mode = "getProgramAccounts(full)";
  let accts: { owner: string; amount: bigint }[] = [];
  try {
    const r = await c.getParsedProgramAccounts(prog, { filters: [{ memcmp: { offset: 0, bytes: MINT.toBase58() } }] });
    accts = r.map(x => (x.account.data as any).parsed.info).map((i: any) => ({ owner: i.owner, amount: BigInt(i.tokenAmount.amount) }));
  } catch (e: any) {
    mode = `getTokenLargestAccounts(top20 only; gPA failed: ${String(e.message).slice(0, 80)})`;
    const top = await c.getTokenLargestAccounts(MINT);
    const infos = await c.getMultipleParsedAccounts(top.value.map(t => t.address));
    accts = infos.value.map((a: any, k) => ({ owner: a?.data?.parsed?.info?.owner ?? top.value[k].address.toBase58(), amount: BigInt(top.value[k].amount) }));
  }
  const byOwner = new Map<string, bigint>();
  for (const a of accts) if (a.amount > 0n) byOwner.set(a.owner, (byOwner.get(a.owner) ?? 0n) + a.amount);
  const all = [...byOwner].map(([w, amt]) => {
    const reason = EXCLUDE_OWNERS[w] ?? (PublicKey.isOnCurve(new PublicKey(w).toBytes()) ? null : "off-curve(PDA/program-owned)");
    return { wallet: w, amount: amt, reason };
  }).sort((a, b) => (b.amount > a.amount ? 1 : -1));
  const elig = all.filter(h => !h.reason).sort((a, b) => a.wallet.localeCompare(b.wallet));
  const root = merkleRoot(elig.map(h => leafHash(h.wallet, h.amount)));
  const pct = (x: bigint) => Number((x * 1_000_000n) / (supply || 1n)) / 10_000;
  const top10 = all.slice(0, 10).map(h => ({ wallet: h.wallet, ui: Number(h.amount) / 10 ** dec, pctSupply: pct(h.amount), excluded: h.reason }));
  const eligTotal = elig.reduce((s, h) => s + h.amount, 0n);
  const out = {
    note: "READ-ONLY single snapshot (raw balance at slot, NOT time-weighted). Leaf amount = raw balance; prototype only.",
    rpc, slot, takenAt: new Date().toISOString(), mint: MINT.toBase58(), tokenProgram: prog.toBase58(), decimals: dec, supply: supply.toString(), mode,
    stats: { ownersWithBalance: all.length, eligible: elig.length, excluded: all.length - elig.length, eligiblePctSupply: pct(eligTotal), top10 },
    merkleRoot: root.toString("hex"),
    leaves: elig.map(h => ({ wallet: h.wallet, amount: h.amount.toString() })),
    excluded: all.filter(h => h.reason).map(h => ({ wallet: h.wallet, amount: h.amount.toString(), reason: h.reason })),
  };
  fs.mkdirSync("snapshots", { recursive: true });
  fs.writeFileSync(`snapshots/clawd-${slot}.json`, JSON.stringify(out, null, 2));
  fs.writeFileSync(`snapshots/clawd-${slot}.csv`, "wallet,amount\n" + out.leaves.map(l => `${l.wallet},${l.amount}`).join("\n") + "\n");
  console.log(JSON.stringify({ slot, mode, ...out.stats, merkleRoot: out.merkleRoot, file: `snapshots/clawd-${slot}.json` }, null, 2));
}
for (const r of RPCS) { try { await run(r); process.exit(0); } catch (e: any) { console.error("RPC failed", r, String(e.message).slice(0, 120)); } }
process.exit(1);
