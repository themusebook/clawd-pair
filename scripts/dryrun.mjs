// Devnet (or local devnet-fork) dry run: SOL -> A -> B with fee sharing. Throwaway keys only.
import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, NATIVE_MINT, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { OnlinePumpSdk, PUMP_SDK, bondingCurvePda, feeSharingConfigPda, canonicalPumpPoolPda } from "@pump-fun/pump-sdk";
import BN from "bn.js"; import fs from "fs";
const RPC = process.env.RPC || fs.readFileSync(new URL("../devnet-test/rpc.url", import.meta.url), "utf8").trim();
if (/mainnet/.test(RPC)) throw new Error("refusing mainnet");
const CLUSTER = process.env.CLUSTER || "devnet";
const c = new Connection(RPC, "confirmed"); const sdk = new OnlinePumpSdk(c);
const kp = n => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(new URL(`../devnet-test/${n}.json`, import.meta.url)))));
const owner = kp("owner"), buyer = kp("buyer"), w50 = kp("w50"), w40 = kp("w40"), w10 = kp("w10");
const log = []; const out = new URL(`../dryrun-${CLUSTER}.json`, import.meta.url);
const rec = (step, sig, extra = {}) => { const e = { step, sig, url: `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER === "local" ? "custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899" : "devnet"}`, ...extra }; log.push(e); console.log("OK", step, sig); fs.writeFileSync(out, JSON.stringify(log, null, 2)); };
const fail = (step, e) => { const m = (e.logs || e.transactionLogs || []).slice(-6).join(" | ") || e.message; log.push({ step, error: m }); console.log("FAIL", step, m); fs.writeFileSync(out, JSON.stringify(log, null, 2)); };
async function send(step, ixs, signers, extra) {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 }), ...ixs);
  const sig = await sendAndConfirmTransaction(c, tx, signers, { commitment: "confirmed" }); rec(step, sig, extra); return sig;
}
async function sendV0(step, ixs, signers) {
  const { blockhash } = await c.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: signers[0].publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...ixs] }).compileToV0Message();
  const tx = new VersionedTransaction(msg); tx.sign(signers); const sig = await c.sendTransaction(tx); await c.confirmTransaction(sig, "confirmed");
  const st = await c.getTransaction(sig, { maxSupportedTransactionVersion: 0 }); if (st?.meta?.err) throw Object.assign(new Error(JSON.stringify(st.meta.err)), { logs: st.meta.logMessages });
  rec(step, sig); return sig;
}
const global = await sdk.fetchGlobal();
async function buy(step, mint, user, lamportsOrQuote, quoteMint) {
  const st = await sdk.fetchBuyState(mint, user.publicKey, TOKEN_2022_PROGRAM_ID, quoteMint);
  const ixs = await PUMP_SDK.buyExactQuoteInV3Instructions({ bondingCurve: st.bondingCurve, associatedUserAccountInfo: st.associatedUserAccountInfo, mint, user: user.publicKey, amount: new BN(1), quoteAmount: new BN(lamportsOrQuote), slippage: 50, tokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: st.quoteTokenProgram });
  return send(step, ixs, [user]);
}
async function createCoin(step, name, quoteMint, quoteTokenProgram) {
  const m = Keypair.generate(); let pumpQuote;
  if (quoteMint) { const pq = await sdk.fetchPumpQuote(quoteMint, { global }); pumpQuote = pq?.accounts; }
  const ix = await PUMP_SDK.createV2Instruction({ mint: m.publicKey, name, symbol: name, uri: "https://example.com/clawd-pair-test.json", creator: owner.publicKey, user: owner.publicKey, mayhemMode: false, quoteMint, quoteTokenProgram, pumpQuote });
  await send(step, [ix], [owner, m], { mint: m.publicKey.toBase58() }); return m.publicKey;
}
const step = async (name, fn) => { try { return await fn(); } catch (e) { fail(name, e); return null; } };
const t = s => new Promise(r => setTimeout(r, s));
console.log("owner SOL", (await c.getBalance(owner.publicKey)) / LAMPORTS_PER_SOL);
// 2) coin A (SOL quote), buy to graduation, migrate
const A = await step("2a create_v2 A (SOL)", () => createCoin("2a create_v2 A (SOL)", "CPTA"));
await step("2b buy_v3 A small (buyer)", () => buy("2b buy_v3 A small (buyer)", A, buyer, 0.05 * LAMPORTS_PER_SOL));
await step("2c buy_v3 A to graduation (owner)", () => buy("2c buy_v3 A to graduation (owner)", A, owner, 1.2 * LAMPORTS_PER_SOL));
await step("2d migrate_v2 A", async () => { const ix = await PUMP_SDK.migrateV2Instruction({ withdrawAuthority: global.withdrawAuthority, mint: A, user: owner.publicKey, baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID }); return send("2d migrate_v2 A", [ix], [owner]); });
// 3) coin B quoted in A
const B = await step("3a create_v2 B (quote=A)", () => createCoin("3a create_v2 B (quote=A)", "CPTB", A, TOKEN_2022_PROGRAM_ID));
const aBal = async u => { try { return (await getAccount(c, getAssociatedTokenAddressSync(A, u, false, TOKEN_2022_PROGRAM_ID), "confirmed", TOKEN_2022_PROGRAM_ID)).amount; } catch { return 0n; } };
console.log("owner A bal", (await aBal(owner.publicKey)).toString());
await step("3b buy_v3 B with A (owner)", async () => buy("3b buy_v3 B with A (owner)", B, owner, (await aBal(owner.publicKey)) / 20n, A));
await step("3c sell_v3 B half (owner)", async () => {
  const st = await sdk.fetchSellState(B, owner.publicKey, TOKEN_2022_PROGRAM_ID, A);
  const bal = (await getAccount(c, getAssociatedTokenAddressSync(B, owner.publicKey, false, TOKEN_2022_PROGRAM_ID), "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
  const ixs = await PUMP_SDK.sellV3Instructions({ bondingCurve: st.bondingCurve, mint: B, user: owner.publicKey, amount: new BN((bal / 2n).toString()), quoteAmount: new BN(0), slippage: 50, tokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_2022_PROGRAM_ID });
  return send("3c sell_v3 B half (owner)", ixs, [owner]);
});
await step("3d multi_hop_swap SOL->A->B (buyer)", async () => {
  const hops = await sdk.resolveMultiHopRoute([NATIVE_MINT, A, B], "buy");
  const ixs = await PUMP_SDK.multiHopSwapInstructions({ user: buyer.publicKey, hops, side: "buy", amountIn: new BN(0.05 * LAMPORTS_PER_SOL), minAmountOut: new BN(1) });
  return sendV0("3d multi_hop_swap SOL->A->B (buyer)", ixs, [buyer]);
});
// 4) fee sharing on B 50/40/10
await step("4a create_fee_sharing_config B", async () => {
  const pre = await PUMP_SDK.sweepCreatorFeeInstruction?.({ mint: B, creator: owner.publicKey, quoteMint: A, quoteTokenProgram: TOKEN_2022_PROGRAM_ID, payer: owner.publicKey }).catch(() => null);
  const ix = await PUMP_SDK.createFeeSharingConfig({ creator: owner.publicKey, mint: B, pool: null });
  return send("4a create_fee_sharing_config B", [...(pre ? [pre] : []), ix], [owner]);
});
await step("4b update_fee_shares_v2 50/40/10", async () => {
  const ix = await PUMP_SDK.updateFeeSharesV2({ authority: owner.publicKey, mint: B, currentShareholders: [owner.publicKey], newShareholders: [{ address: w50.publicKey, shareBps: 5000 }, { address: w40.publicKey, shareBps: 4000 }, { address: w10.publicKey, shareBps: 1000 }], quoteMint: A, quoteTokenProgram: TOKEN_2022_PROGRAM_ID });
  return send("4b update_fee_shares_v2 50/40/10", [ix], [owner]);
});
await step("4c trade B to accrue fees (buyer multi-hop again)", async () => {
  const hops = await sdk.resolveMultiHopRoute([NATIVE_MINT, A, B], "buy");
  const ixs = await PUMP_SDK.multiHopSwapInstructions({ user: buyer.publicKey, hops, side: "buy", amountIn: new BN(0.1 * LAMPORTS_PER_SOL), minAmountOut: new BN(1) });
  return sendV0("4c trade B to accrue fees (buyer multi-hop again)", ixs, [buyer]);
});
const before = await Promise.all([w50, w40, w10].map(w => aBal(w.publicKey)));
await step("4d sweep+distribute creator fees B", async () => {
  const r = await sdk.buildDistributeCreatorFeesInstructions(B, { quoteMint: A, quoteTokenProgram: TOKEN_2022_PROGRAM_ID, payer: owner.publicKey });
  return send("4d sweep+distribute creator fees B", r.instructions, [owner]);
});
const after = await Promise.all([w50, w40, w10].map(w => aBal(w.publicKey)));
const d = after.map((x, i) => x - before[i]); log.push({ step: "4e fee split (A base units)", w50: d[0].toString(), w40: d[1].toString(), w10: d[2].toString() }); console.log("split", d.map(String));
fs.writeFileSync(out, JSON.stringify(log, null, 2)); fs.writeFileSync(new URL(`../mints-${CLUSTER}.json`, import.meta.url), JSON.stringify({ A: A?.toBase58(), B: B?.toBase58() }));
