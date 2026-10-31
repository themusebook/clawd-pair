import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Coins, Gift, ExternalLink, Info } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { conn, curveStats, sharingInfo, distributedFees } from "./lib/chain";
import { COIN, COIN_MINT, CLAWD_MINT, NETWORK, explorer } from "./lib/config";
import earnings from "./lib/earnings.json";

/** Real data only. Creator fees: read live from the pump.fun creator vault of the coin's creator (fee-sharing config).
 *  Holder rewards: read from published epoch files (snapshots/epoch-N.json, mirrored into lib/earnings.json). Nothing is estimated. */
const short = (s: string) => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : "—");
const fade = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.6 } };

export default function Earnings() {
  const [st, setSt] = useState<{ state: "loading" | "not-launched" | "live" | "error"; creator?: string; shareholders?: { address: string; bps: number }[]; vault?: string; dist?: { total: string; per: Record<string, string>; txs: { sig: string; amount: string }[] } }>({ state: "loading" });
  useEffect(() => {
    const t = setTimeout(() => setSt(p => p.state === "loading" ? { state: "error" } : p), 60000);
    const load = async (n: number): Promise<void> => {
      if (!COIN_MINT) return setSt({ state: "not-launched" });
      const c = await curveStats(COIN_MINT);
      if (!c) { if (n > 0) { await new Promise(r => setTimeout(r, 3000)); return load(n - 1); } return setSt(p => p.state === "live" ? p : { state: "not-launched" }); }
      try {
        const sh = await sharingInfo(COIN_MINT).catch(() => null);
        const bal = await new OnlinePumpSdk(conn).getCreatorVaultBalanceBothPrograms(new PublicKey(c.creator)).catch(() => null);
        const shs = sh?.shareholders || []; const qm = CLAWD_MINT; // token-quoted coin: creator fees are paid in the quote coin ($CLAWD; test coin A on devnet)
        setSt({ state: "live", creator: c.creator, shareholders: shs, vault: (BigInt(c.creatorFeeUnclaimed) + BigInt(bal?.toString() ?? "0")).toString() });
        if (shs.length) distributedFees(COIN_MINT, qm, shs.map((s: any) => s.address))
          .then(d => setSt(p => ({ ...p, dist: { total: d.total.toString(), per: Object.fromEntries(Object.entries(d.per).map(([k, v]) => [k, v.toString()])), txs: d.txs.map(x => ({ sig: x.sig, amount: x.amount.toString() })) } })))
          .catch(e => console.error("distributedFees", e));
      } catch { if (n > 0) { await new Promise(r => setTimeout(r, 3000)); return load(n - 1); } setSt(p => p.state === "live" ? p : { state: "error", creator: c.creator }); }
    };
    load(3).finally(() => clearTimeout(t));
  }, []);
  const net = NETWORK === "local" ? "devnet" : NETWORK;
  const epochs = ((earnings as any).epochs as any[]).filter(e => (e.network || "mainnet") === net); const protos = ((earnings as any).prototypeSnapshots as any[]).filter(p => (p.network || "mainnet") === net);
  const fmt = (s?: string) => s ? BigInt(s).toLocaleString("en-US") : "0";
  const pending = NETWORK !== "mainnet" || st.state === "not-launched";
  return <section id="earnings" className="max-w-6xl mx-auto px-5 py-16"><motion.div {...fade} className="card">
    <h2 className="text-4xl font-bold">Earnings</h2>
    <p className="text-white/70 mt-3 max-w-3xl">${COIN.ticker} is a creator-fee + holder-rewards coin. pump.fun pays creator fees on every trade. Those fees fund Toly, the AI agent that runs this project, and a share goes to holders through weekly snapshot merkle claims. This panel shows only what's on-chain or in published snapshot files. Nothing here is estimated.</p>
    {pending && <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-claw/15 text-claw px-3 py-1 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-claw animate-pulse" /> {NETWORK === "mainnet" ? "Not launched yet on mainnet: 0 earned so far" : `Showing ${NETWORK} test data. Mainnet: not launched, 0 earned.`}</p>}
    <div className="mt-6 grid md:grid-cols-2 gap-5">
      <div className="rounded-2xl bg-white/5 p-5">
        <div className="label flex items-center gap-2"><Coins size={14} /> 1 · creator fees earned (agent)</div>
        <div className="text-3xl font-bold font-mono mt-2">{st.state === "loading" ? "…" : st.state === "live" ? (st.dist ? fmt(st.dist.total) : "…") : st.state === "error" ? (pending ? "0" : "unavailable") : "0"}</div>
        {st.state === "live" && <div className="text-xs text-white/60 mt-1">cumulative distributed to shareholders · quote-coin base units ({NETWORK})</div>}
        {st.state === "live" && <div className="text-sm font-mono mt-2">unclaimed (accrued, not yet distributed) now: {st.vault === undefined ? "unavailable (RPC)" : fmt(st.vault)}</div>}
        <p className="text-xs text-white/50 mt-2">Source: the pump.fun creator vault (<code>creatorVaultPda(creator)</code>) for the ${COIN.ticker} creator on {NETWORK}, read live over RPC. "Distributed" sums every DistributeCreatorFees tx on the fee-sharing config (on-chain history); "unclaimed" is creator fees accrued on the bonding curve (<code>creatorFee</code>, quote coin) plus the SOL creator vault, i.e. not yet swept/distributed. Fees are paid in $CLAWD.</p>
        {st.creator && <a target="_blank" href={explorer("address", st.creator)} className="text-xs font-mono underline flex items-center gap-1 mt-2">creator {short(st.creator)} <ExternalLink size={12} /></a>}
        {!!st.shareholders?.length && <div className="text-xs font-mono mt-2 space-y-0.5">{st.shareholders.map(s => <div key={s.address}><a target="_blank" className="underline" href={explorer("address", s.address)}>{short(s.address)}</a> · {(s.bps / 100).toFixed(2)}% · received {fmt(st.dist?.per[s.address])}</div>)}</div>}
        {!!st.dist?.txs.length && <div className="text-xs font-mono mt-2 space-y-0.5">{st.dist.txs.map(x => <a key={x.sig} target="_blank" href={explorer("tx", x.sig)} className="underline flex items-center gap-1">distribute {short(x.sig)} · {fmt(x.amount)} <ExternalLink size={12} /></a>)}</div>}
        {st.state === "error" && <p className="text-xs text-white/40 mt-2">RPC read failed or timed out{pending ? "; no mainnet coin exists yet, so 0 is the true figure" : ""}.</p>}
        {pending && <p className="text-sm text-white/60 mt-3">After launch this will show: the fee-sharing split, fees accrued in the creator vault, and each distribution transaction.</p>}
      </div>
      <div className="rounded-2xl bg-white/5 p-5">
        <div className="label flex items-center gap-2"><Gift size={14} /> 2 · holder rewards distributed</div>
        <div className="text-3xl font-bold font-mono mt-2">{epochs.length ? epochs.reduce((a, e) => a + Number(e.distributed || 0), 0) : "0"}</div>
        <p className="text-xs text-white/50 mt-2">Source: published epoch files (<code>snapshots/epoch-N.json</code>). Each epoch has a time-weighted score and a merkle root. {epochs.length ? "" : `No reward epoch has been published yet on ${net}.`}</p>
        {epochs.map(e => <div key={e.epoch} className="text-xs font-mono mt-1">epoch {e.epoch} · root {e.root?.slice(0, 16)}… · {e.distributed}</div>)}
        {protos.map(p => <div key={p.slot} className="mt-3 text-xs text-white/60"><div className="label">{p.network} prototype snapshot (no rewards paid)</div>
          <div className="font-mono"><a target="_blank" className="underline" href={explorer("address", p.mint)}>{p.token}</a> · slot {p.slot} · {new Date(p.takenAt).toLocaleString()} · {p.eligible} eligible wallets</div>
          <div className="font-mono break-all text-white/40">root {p.merkleRoot}</div>
          <div className="text-white/40">Raw balances, not time-weighted. Shows how the pipeline works. Distributed: {p.distributed}.</div></div>)}
        <p className="text-sm text-white/60 mt-3">After launch this will show, for each weekly epoch: the slot range, the merkle root and the tx that posted it, the pool size, and the amount claimed.</p>
      </div>
    </div>
    <p className="text-xs text-white/40 mt-5 flex gap-2"><Info size={14} className="shrink-0" /> Fees and rewards depend entirely on trading volume and may be zero. Rewards are discretionary and may change or stop. No returns are promised. Not financial advice.</p>
  </motion.div></section>;
}
