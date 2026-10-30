import { Connection, PublicKey, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { OnlinePumpSdk, PUMP_SDK, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { RPC_URL, CLAWD_MINT, COIN_MINT, NETWORK, MAINNET_ENABLED } from "./config";
export const conn = new Connection(RPC_URL, "confirmed");
const sdk = () => new OnlinePumpSdk(conn);
export type Phantom = { publicKey: PublicKey | null; connect: () => Promise<{ publicKey: PublicKey }>; disconnect: () => Promise<void>; signAndSendTransaction: (tx: VersionedTransaction) => Promise<{ signature: string }> };
export const getPhantom = (): Phantom | null => (window as any).phantom?.solana?.isPhantom ? (window as any).phantom.solana : null;
export async function curveStats(mint: string) {
  if (!mint) return null;
  try {
    const bc = await sdk().fetchBondingCurve(mint);
    const vq = Number(bc.virtualQuoteReserves), vt = Number(bc.virtualTokenReserves);
    return { complete: bc.complete, price: vq / vt, realTokens: Number(bc.realTokenReserves) / 1e6, realQuote: Number(bc.realQuoteReserves), quoteMint: String(bc.quoteMint ?? ""), creator: bc.creator.toBase58() };
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
