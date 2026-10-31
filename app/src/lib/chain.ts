import { Connection, Keypair, PublicKey, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { OnlinePumpSdk, PUMP_SDK, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { RPC_URL, WS_URL, CLAWD_MINT, COIN_MINT, NETWORK, MAINNET_ENABLED } from "./config";
export const conn = new Connection(RPC_URL, { commitment: "confirmed", wsEndpoint: WS_URL });
const sdk = () => new OnlinePumpSdk(conn);
export type Phantom = { publicKey: PublicKey | null; connect: () => Promise<{ publicKey: PublicKey }>; disconnect: () => Promise<void>; signAndSendTransaction: (tx: VersionedTransaction) => Promise<{ signature: string }>; signMessage?: (msg: Uint8Array, enc?: string) => Promise<{ signature: Uint8Array }> };
export const getPhantom = (): Phantom | null => (window as any).phantom?.solana?.isPhantom ? (window as any).phantom.solana : null;
export async function curveStats(mint: string) {
  if (!mint) return null;
  try {
    const bc = await sdk().fetchBondingCurve(mint);
    const vq = Number(bc.virtualQuoteReserves), vt = Number(bc.virtualTokenReserves);
    return { complete: bc.complete, price: vq / vt, realTokens: Number(bc.realTokenReserves) / 1e6, realQuote: Number(bc.realQuoteReserves), quoteMint: String(bc.quoteMint ?? ""), creator: bc.creator.toBase58(), creatorFeeUnclaimed: String((bc as any).creatorFee ?? "0") };
  } catch { return null; }
}
export async function sharingInfo(mint: string) {
  if (!mint) return null;
  const pda = feeSharingConfigPda(new PublicKey(mint));
  const ai = await conn.getAccountInfo(pda);
  if (!ai) return { pda: pda.toBase58(), shareholders: [] as { address: string; bps: number }[] };
  const cfg: any = PUMP_SDK.decodeSharingConfig(ai as any);
  return { pda: pda.toBase58(), shareholders: (cfg.shareholders || []).map((s: any) => ({ address: s.address.toBase58(), bps: s.shareBps })) };
}
/** Builds SOL -> CLAWD -> NEW multi_hop_swap; the USER signs in Phantom. No server key involved. */
export async function multiHopBuy(wallet: Phantom, sol: number, slippageBps = 1500) {
  if (NETWORK === "mainnet" && !MAINNET_ENABLED) throw new Error("Mainnet disabled");
  const user = wallet.publicKey!; const s = sdk();
  const hops = await s.resolveMultiHopRoute([NATIVE_MINT, new PublicKey(CLAWD_MINT), new PublicKey(COIN_MINT)], "buy");
  const amountIn = new BN(Math.floor(sol * LAMPORTS_PER_SOL));
  let minOut = new BN(1);
  try { const sim: any = await s.simulateMultiHopSwap({ user, hops, side: "buy", amountIn }); const o = new BN(String(sim.amountOut ?? sim)); minOut = o.muln(10000 - slippageBps).divn(10000); } catch { /* fall back to minOut=1 on devnet */ }
  const ixs = await PUMP_SDK.multiHopSwapInstructions({ user, hops, side: "buy", amountIn, minAmountOut: minOut });
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...ixs] }).compileToV0Message());
  const { signature } = await wallet.signAndSendTransaction(tx);
  await conn.confirmTransaction(signature, "confirmed");
  return signature;
}
export const TOKEN22 = TOKEN_2022_PROGRAM_ID;
/** Cumulative creator fees distributed to shareholders, summed from on-chain history of the fee-sharing config PDA:
 *  every tx whose logs contain DistributeCreatorFees, adding each shareholder's quote-mint token balance increase. */
export async function distributedFees(mint: string, quoteMint: string, shareholders: string[]) {
  const pda = feeSharingConfigPda(new PublicKey(mint));
  const sigs = await conn.getSignaturesForAddress(pda, { limit: 1000 });
  const per: Record<string, bigint> = Object.fromEntries(shareholders.map(s => [s, 0n]));
  const txs: { sig: string; amount: bigint; time: number | null }[] = [];
  for (const s of sigs.filter(s => !s.err).reverse()) {
    let tx = null as Awaited<ReturnType<typeof conn.getTransaction>>;
    for (let i = 0; i < 5 && !tx; i++) { try { tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }); } catch { await new Promise(r => setTimeout(r, 800 * (i + 1))); } }
    if (!tx?.meta || !(tx.meta.logMessages || []).some(l => /DistributeCreatorFees/.test(l))) continue;
    const pre = tx.meta.preTokenBalances || [], post = tx.meta.postTokenBalances || [];
    let sum = 0n;
    for (const p of post) {
      if (p.mint !== quoteMint || !p.owner || !(p.owner in per)) continue;
      const b = pre.find(x => x.accountIndex === p.accountIndex);
      const d = BigInt(p.uiTokenAmount.amount) - BigInt(b?.uiTokenAmount.amount || "0");
      if (d > 0n) { per[p.owner] += d; sum += d; }
    }
    if (sum > 0n) txs.push({ sig: s.signature, amount: sum, time: s.blockTime ?? null });
  }
  return { total: Object.values(per).reduce((a, b) => a + b, 0n), per, txs };
}

export type LaunchDraft = { name: string; symbol: string; description: string; image_url?: string; initial_buy_sol?: number };
/** Builds a pump.fun create_v2 coin quoted in CLAWD (same as scripts/dryrun.mjs). The mint keypair is generated in the browser
 *  and partially signs; the USER signs + sends in Phantom. Nothing is auto-signed. Respects the mainnet gate. */
export async function launchToken(wallet: Phantom, d: LaunchDraft) {
  if (NETWORK === "mainnet" && !MAINNET_ENABLED) throw new Error("Mainnet disabled");
  const user = wallet.publicKey!; const s = sdk(); const mint = Keypair.generate();
  const quoteMint = new PublicKey(CLAWD_MINT); const global = await s.fetchGlobal();
  const quoteTokenProgram = (await conn.getAccountInfo(quoteMint))?.owner ?? TOKEN_2022_PROGRAM_ID;
  const pq = await s.fetchPumpQuote(quoteMint, { global });
  const meta = btoa(unescape(encodeURIComponent(JSON.stringify({ name: d.name, symbol: d.symbol, description: d.description, image: d.image_url || "" })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const uri = `${window.location.origin}/api/token-metadata/${meta}`;
  const ix = await PUMP_SDK.createV2Instruction({ mint: mint.publicKey, name: d.name, symbol: d.symbol, uri, creator: user, user, mayhemMode: false, quoteMint, quoteTokenProgram, pumpQuote: pq?.accounts });
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ix] }).compileToV0Message());
  tx.sign([mint]); // mint keypair co-signs; Phantom adds the user's signature only after the user approves
  const { signature } = await wallet.signAndSendTransaction(tx);
  await conn.confirmTransaction(signature, "confirmed");
  return { signature, mint: mint.publicKey.toBase58() };
}
