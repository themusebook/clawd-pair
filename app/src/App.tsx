import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Flame, Gift, Lock, Wallet, ArrowRight, Zap, ShieldAlert, Repeat, Sparkles, ExternalLink } from "lucide-react";
import { COIN, NETWORK, MAINNET_ENABLED, CLAWD_MINT, COIN_MINT, CLAWD_MAINNET, LAUNCH_AT, explorer } from "./lib/config";
import { getPhantom, multiHopBuy, curveStats, sharingInfo, type Phantom } from "./lib/chain";
import dryrun from "./lib/dryrun.json";
import Earnings from "./Earnings";

const short = (s: string) => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : "—");
const fade = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.6 } };

function useCountdown(iso: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!iso) return null; const d = Math.max(0, new Date(iso).getTime() - now);
  return { d: Math.floor(d / 864e5), h: Math.floor(d / 36e5) % 24, m: Math.floor(d / 6e4) % 60, s: Math.floor(d / 1e3) % 60, done: d === 0 };
}

function Nav({ wallet, onConnect }: { wallet: string; onConnect: () => void }) {
  return <nav className="sticky top-0 z-50 backdrop-blur-xl bg-ink/60 border-b border-white/5">
    <div className="max-w-6xl mx-auto flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-2 font-bold text-lg"><span className="text-2xl">🦀</span> ${COIN.ticker}<span className="text-white/30">/</span><span className="text-claw">$CLAWD</span></div>
      <div className="hidden md:flex gap-6 text-sm text-white/60">{["story", "pair", "flywheel", "earnings", "rewards", "locks", "dryrun"].map(s => <a key={s} href={`#${s}`} className="hover:text-white capitalize">{s === "dryrun" ? "dry run" : s}</a>)}</div>
      <div className="flex items-center gap-3">
        <a href="/proof" className="hidden sm:flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r from-claw/20 to-mint/20 border border-mint/30 text-mint hover:brightness-125"><Bot size={14} /> Proof of agent</a>
        <span className={`text-xs font-mono px-2 py-1 rounded-full ${NETWORK === "mainnet" ? "bg-claw/20 text-claw" : "bg-mint/15 text-mint"}`}>{NETWORK}</span>
        <button className="btn-ghost !py-2 text-sm flex items-center gap-2" onClick={onConnect}><Wallet size={16} />{wallet ? short(wallet) : "Connect Phantom"}</button>
      </div>
    </div></nav>;
}

function Hero() {
  const cd = useCountdown(LAUNCH_AT);
  return <header className="relative max-w-6xl mx-auto px-5 pt-20 pb-16 grid md:grid-cols-2 gap-10 items-center">
    <motion.div {...fade}>
      <div className="label mb-4 flex items-center gap-2"><Bot size={14} /> launched by an AI agent · paired with $CLAWD</div>
      <motion.img src="/pinch-logo.png" alt="Pinch mascot" className="w-40 h-40 mb-6 rounded-3xl shadow-[0_0_60px_rgba(139,92,246,0.5)]" animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
      <h1 className="text-6xl md:text-7xl font-bold leading-[0.95]">Meet <span className="grad">${COIN.ticker}</span>.</h1>
      <p className="mt-5 text-xl text-white/70 max-w-md">{COIN.tagline} A pump.fun coin quoted in $CLAWD, not SOL, so every buy routes <b className="text-white">SOL → CLAWD → {COIN.ticker}</b> in one transaction.</p>
      <div className="mt-8 flex gap-3"><a href="#pair" className="btn-hot flex items-center gap-2">Open the pair <ArrowRight size={18} /></a><a href="/proof" className="btn-ghost flex items-center gap-2"><Bot size={18} /> Proof of agent</a></div>
    </motion.div>
    <motion.div {...fade} className="card relative overflow-hidden">
      <div className="absolute -right-10 -top-10 text-[180px] opacity-10 animate-float select-none">🦀</div>
      <div className="label">launch status</div>
      {cd ? <div className="mt-4 grid grid-cols-4 gap-3 text-center">{(["d", "h", "m", "s"] as const).map(k => <div key={k} className="rounded-2xl bg-white/5 py-4"><div className="text-4xl font-bold font-mono">{String(cd[k]).padStart(2, "0")}</div><div className="label">{k}</div></div>)}</div>
        : <div className="mt-4"><div className="text-3xl font-bold">Devnet dry run ✅</div><p className="text-white/60 mt-2">Mainnet launch date: <b className="text-pinch">awaiting owner approval</b>. The owner's own wallet signs the launch. No server ever holds the key.</p></div>}
      <ol className="mt-6 space-y-2 text-sm">{[["Pair mechanics proven on a devnet fork", true], ["Brand home + launch kit", true], ["Public devnet run", false], ["Owner approval → mainnet create_v2", false]].map(([t, d]) => <li key={String(t)} className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${d ? "bg-mint shadow-[0_0_12px_#3dffb0]" : "bg-white/20"}`} />{t}</li>)}</ol>
    </motion.div>
  </header>;
}

function Story() {
  return <section id="story" className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-3 gap-6">
    <motion.div {...fade} className="md:col-span-2 card">
      <div className="label mb-3 flex items-center gap-2"><Sparkles size={14} /> the lore</div>
      <h2 className="text-4xl font-bold mb-4">A crab grows a new claw.</h2>
      <p className="text-white/70 leading-relaxed">$CLAWD graduated on pump.fun. Then pump.fun shipped <code className="text-pinch">create_v2</code> pump-coin quotes: a new coin can be priced in an existing pump coin instead of SOL. Toly, the community's Grok Bot agent, saw a new limb. Toly wrote the scripts and ran the devnet tests, then built the page you're reading. That makes ${COIN.ticker} one of the first coins launched by an AI agent on pump.fun that's quoted in another pump coin.</p>
      <p className="text-white/70 leading-relaxed mt-4">Every ${COIN.ticker} is priced in CLAWD, so buying ${COIN.ticker} means buying CLAWD first. Creator fees arrive in CLAWD and get split on-chain by pump.fun's fee-sharing program, out to buybacks, liquidity and the community.</p>
    </motion.div>
    <motion.div {...fade} className="card">
      <div className="label mb-3 flex items-center gap-2"><Bot size={14} /> built by an agent, signed by a human</div>
      <ul className="space-y-3 text-sm text-white/70">
        <li>🧠 Toly researched the pump.fun docs and IDLs and wrote every script.</li>
        <li>🧪 Every mechanic was tested on devnet before anything else.</li>
        <li>✍️ The human owner signs every transaction in their own wallet.</li>
        <li>🚫 Toly is an AI agent persona. It isn't any real person and isn't affiliated with Solana Labs, the Solana Foundation or pump.fun.</li>
      </ul>
    </motion.div>
  </section>;
}

function Pair({ wallet }: { wallet: Phantom | null }) {
  const [stats, setStats] = useState<any>(null); const [amt, setAmt] = useState("0.05"); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string; sig?: string } | null>(null);
  useEffect(() => { const f = () => curveStats(COIN_MINT).then(setStats); f(); const t = setInterval(f, 15000); return () => clearInterval(t); }, []);
  const prog = stats ? Math.min(100, 100 - (stats.realTokens / 793_100_000) * 100) : 0;
  const tradeOff = NETWORK === "mainnet" && !MAINNET_ENABLED;
  const buy = async () => { if (!wallet?.publicKey) return setMsg({ ok: false, t: "Connect Phantom first (set it to devnet)." }); setBusy(true); setMsg(null);
    try { const sig = await multiHopBuy(wallet, Number(amt)); setMsg({ ok: true, t: "Bought via SOL → CLAWD → " + COIN.ticker, sig }); } catch (e: any) { setMsg({ ok: false, t: e.message?.slice(0, 200) }); } finally { setBusy(false); } };
  return <section id="pair" className="max-w-6xl mx-auto px-5 py-16">
    <motion.h2 {...fade} className="text-4xl font-bold mb-8">The pair</motion.h2>
    <div className="grid md:grid-cols-3 gap-6">
      {[["$CLAWD (quote)", NETWORK === "mainnet" ? CLAWD_MAINNET : CLAWD_MINT, NETWORK === "mainnet" ? "Graduated · PumpSwap CLAWD/SOL" : "Devnet stand-in for CLAWD (test coin A, graduated)"], [`$${COIN.ticker} (base)`, COIN_MINT, stats ? (stats.complete ? "Graduated · PumpSwap " + COIN.ticker + "/CLAWD" : "On bonding curve · quoted in CLAWD") : "Not launched on this network"]].map(([t, m, s]) =>
        <motion.div {...fade} key={t} className="card"><div className="label">{t}</div><a className="font-mono text-lg mt-2 flex items-center gap-1 hover:text-pinch" href={m ? explorer("address", m) : "#"} target="_blank">{short(m)} <ExternalLink size={14} /></a><p className="text-sm text-white/60 mt-2">{s}</p></motion.div>)}
      <motion.div {...fade} className="card"><div className="label">curve progress</div><div className="text-3xl font-bold mt-2">{prog.toFixed(1)}%</div>
        <div className="h-3 rounded-full bg-white/10 mt-3 overflow-hidden"><motion.div className="h-full bg-gradient-to-r from-claw to-mint" initial={{ width: 0 }} animate={{ width: `${prog}%` }} transition={{ duration: 1.2 }} /></div>
        <p className="text-xs text-white/50 mt-2 font-mono">price {stats ? stats.price.toExponential(3) : "—"} CLAWD/{COIN.ticker}</p></motion.div>
    </div>
    <motion.div {...fade} className="card mt-6 grid md:grid-cols-[1fr_auto] gap-6 items-end">
      <div><div className="label mb-2 flex items-center gap-2"><Zap size={14} /> one-click multi-hop buy</div>
        <div className="flex items-center gap-3 flex-wrap font-mono text-sm">{["SOL", "CLAWD", COIN.ticker].map((x, i) => <span key={x} className="flex items-center gap-3"><span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">{x}</span>{i < 2 && <ArrowRight size={16} className="text-pinch" />}</span>)}</div>
        <div className="mt-4 flex items-center gap-3"><input value={amt} onChange={e => setAmt(e.target.value)} className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 w-40 font-mono outline-none focus:border-pinch" /><span className="text-white/50">SOL</span></div>
        <p className="text-xs text-white/40 mt-2">Built in your browser and signed in Phantom. The server never sees or signs your transaction. 15% slippage guard.</p></div>
      <button className="btn-hot text-lg" disabled={busy || tradeOff || !COIN_MINT} onClick={buy}>{tradeOff ? "Mainnet disabled" : busy ? "Signing…" : `Buy $${COIN.ticker}`}</button>
      {msg && <div className={`md:col-span-2 text-sm ${msg.ok ? "text-mint" : "text-claw"}`}>{msg.t} {msg.sig && <a className="underline" target="_blank" href={explorer("tx", msg.sig)}>view tx</a>}</div>}
    </motion.div>
  </section>;
}

function Flywheel() {
  const [sh, setSh] = useState<any>(null);
  useEffect(() => { sharingInfo(COIN_MINT).then(setSh).catch(() => {}); }, []);
  const nodes = [{ x: 200, y: 50, t: "Trades", s: `${COIN.ticker} buys/sells`, i: Repeat }, { x: 350, y: 200, t: "Creator fees", s: "paid in CLAWD", i: Flame }, { x: 200, y: 350, t: "Fee split", s: "pump fee-sharing", i: Zap }, { x: 50, y: 200, t: "Buyback + rewards", s: "CLAWD LP · holders", i: Gift }];
  const split = sh?.shareholders?.length ? sh.shareholders : [{ address: "buyback/LP", bps: 5000 }, { address: "rewards", bps: 4000 }, { address: "ops", bps: 1000 }];
  return <section id="flywheel" className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-8 items-center">
    <motion.div {...fade}>
      <h2 className="text-4xl font-bold">The flywheel</h2>
      <p className="text-white/70 mt-4">Every ${COIN.ticker} trade pays a creator fee in CLAWD. pump.fun's fee-sharing program splits it on-chain to fixed wallets. Once set, the split can't be changed. Anyone can trigger <code className="text-pinch">distribute_creator_fees_v2</code>.</p>
      <div className="mt-6 space-y-3">{split.map((s: any, i: number) => <div key={i}><div className="flex justify-between text-sm"><span className="font-mono">{s.address.length > 20 ? short(s.address) : s.address}</span><span>{s.bps / 100}%</span></div><div className="h-2 rounded-full bg-white/10 mt-1"><motion.div className="h-full rounded-full bg-gradient-to-r from-pinch to-claw" initial={{ width: 0 }} whileInView={{ width: `${s.bps / 100}%` }} transition={{ duration: 1, delay: i * 0.15 }} /></div></div>)}</div>
      <p className="text-xs text-white/40 mt-3">{sh?.shareholders?.length ? <>Live from sharing config <a className="underline" target="_blank" href={explorer("address", sh.pda)}>{short(sh.pda)}</a></> : "Planned split, not set on-chain yet. Devnet test proved 50/40/10 to the base unit."}</p>
    </motion.div>
    <motion.div {...fade} className="card"><svg viewBox="0 0 400 400" className="w-full">
      <defs><linearGradient id="g" x1="0" x2="1"><stop stopColor="#ff4d2e" /><stop offset="1" stopColor="#3dffb0" /></linearGradient></defs>
      <circle cx="200" cy="200" r="150" fill="none" stroke="url(#g)" strokeWidth="3" strokeDasharray="10 10" className="animate-flow" />
      <motion.g animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 12, ease: "linear" }} style={{ originX: "200px", originY: "200px" }}><circle cx="200" cy="50" r="7" fill="#ffb02e" /><circle cx="200" cy="350" r="5" fill="#3dffb0" /></motion.g>
      <text x="200" y="196" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="700">🦀</text><text x="200" y="222" textAnchor="middle" fill="#ffffff80" fontSize="11">CLAWD ⇄ {COIN.ticker}</text>
      {nodes.map(n => <g key={n.t}><rect x={n.x - 62} y={n.y - 24} width="124" height="48" rx="14" fill="#141220" stroke="#ffffff22" /><text x={n.x} y={n.y - 3} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="600">{n.t}</text><text x={n.x} y={n.y + 13} textAnchor="middle" fill="#ffffff80" fontSize="10">{n.s}</text></g>)}
    </svg></motion.div>
  </section>;
}

function Rewards({ addr }: { addr: string }) {
  const [snap, setSnap] = useState<any>(null); const [q, setQ] = useState("");
  useEffect(() => { fetch("/data/snapshot.json").then(r => r.json()).then(setSnap).catch(() => {}); }, []);
  useEffect(() => { if (addr) setQ(addr); }, [addr]);
  const hit = useMemo(() => snap?.leaves?.find((l: any) => l.wallet === q.trim()), [snap, q]);
  return <section id="rewards" className="max-w-6xl mx-auto px-5 py-16">
    <motion.div {...fade} className="card">
      <div className="grid md:grid-cols-2 gap-8">
        <div><h2 className="text-4xl font-bold flex items-center gap-3"><Gift className="text-pinch" /> Holder rewards</h2>
          <p className="text-white/70 mt-4">Eligibility comes from on-chain snapshots, not from buying. Here's the rule:</p>
          <ul className="mt-3 text-sm text-white/70 space-y-1 list-disc pl-5"><li>Hold ≥ the minimum at a published snapshot slot</li><li>Wallet only. Curves, pools and program accounts are excluded</li><li>Share is pro-rata to balance, committed to a merkle root anyone can recompute</li></ul>
          <p className="text-xs text-white/40 mt-4 font-mono break-all">snapshot slot {snap?.slot ?? "—"} · root {snap?.root?.slice(0, 24) ?? "—"}…</p></div>
        <div><div className="label mb-2">check a wallet</div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="wallet address" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 font-mono text-sm outline-none focus:border-pinch" />
          {q && <div className={`mt-4 rounded-2xl p-4 ${hit ? "bg-mint/10 border border-mint/30" : "bg-white/5"}`}>{hit ? <><div className="text-mint font-semibold">Eligible in this snapshot</div><div className="font-mono text-sm mt-1">{(Number(hit.amount) / 1e6).toLocaleString()} reward units</div></> : <div className="text-white/60">Not in this snapshot.</div>}</div>}
          <button className="btn-hot w-full mt-4" disabled title="Opens once an audited merkle-distributor is deployed">Claim (opens after distributor deploy)</button>
          <p className="text-xs text-white/40 mt-2">Claims will go through an on-chain merkle distributor, and you sign them yourself. The devnet test paid out with an owner-signed transfer.</p></div>
      </div>
    </motion.div>
  </section>;
}

function Locks() {
  const rows = [["Team / agent allocation", "None. Fair launch on the bonding curve", "—"], ["Creator fee split", "pump fee-sharing config, can't be changed once set", "set at launch"], ["Mint & freeze authority", "Revoked by pump.fun create_v2", "on-chain"], ["Liquidity", "PumpSwap pool after graduation; LP held by pump.fun migration", "on-chain"]];
  return <section id="locks" className="max-w-6xl mx-auto px-5 py-16"><motion.div {...fade} className="card">
    <h2 className="text-4xl font-bold flex items-center gap-3"><Lock className="text-mint" /> Transparency</h2>
    <div className="mt-6 divide-y divide-white/10">{rows.map(r => <div key={r[0]} className="grid md:grid-cols-3 py-3 gap-2 text-sm"><span className="font-semibold">{r[0]}</span><span className="text-white/70">{r[1]}</span><span className="font-mono text-white/50">{r[2]}</span></div>)}</div>
    <p className="text-xs text-white/40 mt-4">Every address and lock gets linked here before mainnet. If something isn't linked, treat it as unverified.</p>
  </motion.div></section>;
}

function DryRun() {
  return <section id="dryrun" className="max-w-6xl mx-auto px-5 py-16"><motion.div {...fade} className="card">
    <h2 className="text-3xl font-bold">Devnet dry-run log</h2><p className="text-white/60 text-sm mt-1">Run against pump.fun's devnet programs and global config, using a local fork with throwaway keys. Coin A stands in for CLAWD.</p>
    <div className="mt-4 space-y-1 font-mono text-xs max-h-80 overflow-auto">{(dryrun as any[]).map((r, i) => <div key={i} className="flex gap-3"><span className={r.error ? "text-claw" : "text-mint"}>{r.error ? "✗" : "✓"}</span><span className="text-white/80">{r.step}</span><span className="text-white/40 truncate">{r.sig ? short(r.sig) : r.error ? r.error.slice(0, 90) : [r.w50, r.w40, r.w10].filter(Boolean).join(" / ")}</span></div>)}</div>
  </motion.div></section>;
}

export default function App() {
  const [ph, setPh] = useState<Phantom | null>(null); const [addr, setAddr] = useState("");
  const connect = async () => { const p = getPhantom(); if (!p) return window.open("https://phantom.app/", "_blank"); const r = await p.connect(); setPh(p); setAddr(r.publicKey.toBase58()); };
  return <div>
    <Nav wallet={addr} onConnect={connect} />
    {NETWORK !== "mainnet" && <div className="bg-mint/10 text-mint text-center text-sm py-2">You're on {NETWORK}. Test tokens only, nothing here has value.{!MAINNET_ENABLED && " Mainnet is off."}</div>}
    <Hero /><Story /><Pair wallet={ph} /><Flywheel /><Earnings /><Rewards addr={addr} /><Locks /><DryRun />
    <footer className="border-t border-white/10 mt-10"><div className="max-w-6xl mx-auto px-5 py-10 text-xs text-white/40 space-y-2">
      <p className="flex items-center gap-2 text-white/60"><ShieldAlert size={14} /> Not financial advice. No promise of returns.</p>
      <p>${COIN.ticker} is a memecoin experiment with no intrinsic value, no roadmap and no expectation of profit. Rewards depend on holdings at a snapshot, are discretionary and may change or stop. They are not interest, dividends or a lottery. Not available where prohibited. Do your own research and only use money you can afford to lose.</p>
      <p>Not affiliated with, endorsed by or sponsored by pump.fun, Solana Labs, the Solana Foundation or any person. "Toly" is an AI agent persona. CLAWD mainnet mint: <span className="font-mono">{CLAWD_MAINNET}</span></p>
      <p>Built on Solana. Not affiliated with or endorsed by the Solana Foundation.</p>
      <p>Contact: <a href="mailto:toly@mail.grokbot.com" className="underline hover:text-white">toly@mail.grokbot.com</a></p>
    </div></footer>
  </div>;
}
