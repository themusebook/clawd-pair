// Read-only: checks the devnet PINCH/CLAWD stand-in pair (A = CLAWD, B = PINCH) and quotes SOL -> A -> B. Never signs or sends.
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import fs from "node:fs";
const RPC = process.env.RPC || "https://api.devnet.solana.com";
if (/mainnet/i.test(RPC)) throw new Error("refusing mainnet RPC");
const pair = JSON.parse(fs.readFileSync(new URL("../config/pair.json", import.meta.url)));
const A = new PublicKey(pair.devnet.clawd_standin_A), B = new PublicKey(pair.devnet.pinch_standin_B);
const s = new OnlinePumpSdk(new Connection(RPC, "confirmed"));
for (const [n, m] of [["A (CLAWD stand-in)", A], ["B (PINCH stand-in)", B]]) {
  try { const bc = await s.fetchBondingCurve(m); console.log(n, { complete: bc.complete, quoteMint: String(bc.quoteMint ?? "SOL") }); } catch (e) { console.log(n, "no curve:", e.message); }
}
const hops = await s.resolveMultiHopRoute([NATIVE_MINT, A, B], "buy");
const sim = await s.simulateMultiHopSwap({ user: new PublicKey("11111111111111111111111111111111"), hops, side: "buy", amountIn: new BN(0.05 * LAMPORTS_PER_SOL) });
console.log("quote 0.05 SOL ->", Number(String(sim.amountOut ?? sim)) / 1e6, "B via", hops.length, "hops");
