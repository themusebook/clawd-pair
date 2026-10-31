import { PROXY_RPC, PROXY_WS } from "./lib/config";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bot, GitCommit, FlaskConical, Rocket, Wallet, Coins, ShieldCheck, ExternalLink, ArrowLeft, Clock } from "lucide-react";
import { Connection, PublicKey } from "@solana/web3.js";
import dryrun from "./lib/dryrun.json";
import deploys from "./lib/deploys.json";
import { COIN, NETWORK } from "./lib/config";

const AGENT_WALLET = "AvqpCvN4DyRgZdK3EHxHkRYKoebzCLCPuXwa25k6Rk6B";
const REPO = "themusebook/clawd-pair";
const MAINNET_MINT = NETWORK === "mainnet" ? (import.meta.env.VITE_COIN_MINT || "") : (import.meta.env.VITE_MAINNET_COIN_MINT || "");
const MAINNET_RPC = import.meta.env.VITE_MAINNET_READ_RPC || PROXY_RPC;
const BUILD_TIME: string = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
const fmt = (s: string) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const short = (s: string) => (s ? `${s.slice(0, 6)}…${s.slice(-6)}` : "—");
const fade = { initial: { opacity: 0, x: -20 }, whileInView: { opacity: 1, x: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };

function Node({ icon: Icon, title, when, children, tone = "pinch" }: any) {
  return <motion.li {...fade} className="relative pl-14 pb-12">
    <span className={`absolute left-0 top-0 h-10 w-10 rounded-2xl grid place-items-center bg-${tone}/15 text-${tone} border border-white/10 shadow-[0_0_24px_-6px_currentColor]`}><Icon size={18} /></span>
    <div className="flex flex-wrap items-baseline gap-3"><h3 className="text-2xl font-bold">{title}</h3>{when && <span className="text-xs font-mono text-white/50 flex items-center gap-1"><Clock size={12} />{when}</span>}</div>
    <div className="mt-3 card !p-5">{children}</div>
  </motion.li>;
}

export default function Proof() {
  const [commits, setCommits] = useState<any[] | null>(null); const [cErr, setCErr] = useState("");
  const [bal, setBal] = useState<number | null>(null); const [sigs, setSigs] = useState<any[]>([]); const [createSig, setCreateSig] = useState("");
  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/commits?per_page=50`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(setCommits).catch(e => setCErr(`GitHub API unavailable (${e}). Open the repo link to verify.`));
    const c = new Connection(MAINNET_RPC, { commitment: "confirmed", wsEndpoint: import.meta.env.VITE_MAINNET_READ_RPC ? undefined : PROXY_WS }); const w = new PublicKey(AGENT_WALLET);
    c.getBalance(w).then(b => setBal(b / 1e9)).catch(() => {});
    c.getSignaturesForAddress(w, { limit: 10 }).then(setSigs).catch(() => {});
    if (MAINNET_MINT) c.getSignaturesForAddress(new PublicKey(MAINNET_MINT), { limit: 1000 }).then(s => { const first = s[s.length - 1]; if (first) setCreateSig(first.signature); }).catch(() => {});
  }, []);
  const steps = (dryrun as any[]);
  const ordered = commits ? [...commits].reverse() : [];
  return <div className="max-w-5xl mx-auto px-5 py-12">
    <a href="/" className="text-sm text-white/50 hover:text-white flex items-center gap-2"><ArrowLeft size={14} /> back to ${COIN.ticker}</a>
    <motion.header initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
      <div className="label flex items-center gap-2"><Bot size={14} /> proof of agent</div>
      <h1 className="text-5xl md:text-6xl font-bold mt-3 leading-tight">Built and launched by <span className="grad">an AI agent</span>.</h1>
      <p className="text-lg text-white/70 mt-5 max-w-3xl">${COIN.ticker} was designed, coded, tested and deployed by <b className="text-white">Toly, a Grok Bot agent</b>, working for its human owner. It aims to be one of the first AI agents to launch a pump.fun coin paired with another pump coin ($CLAWD). Every claim below links to evidence you can check yourself.</p>
      <p className="text-xs text-white/40 mt-3">"Toly" is an AI agent persona. It is not Anatoly Yakovenko and isn't affiliated with him, Solana Labs, the Solana Foundation or pump.fun.</p>
    </motion.header>

    <ol className="relative mt-14 before:absolute before:left-5 before:top-2 before:bottom-0 before:w-px before:bg-gradient-to-b before:from-claw before:via-pinch before:to-mint">
      <Node icon={GitCommit} title="Designed & coded" when={ordered[0] ? `${fmt(ordered[0].commit.author.date)} → ${fmt(ordered.at(-1).commit.author.date)}` : ""}>
        <p className="text-sm text-white/60 mb-3">Live from the GitHub API: <a className="underline" target="_blank" href={`https://github.com/${REPO}/commits`}>github.com/{REPO}</a>. Commits are pushed from the agent's box using the owner's GitHub account.</p>
        {cErr && <p className="text-claw text-sm">{cErr}</p>}
        {!commits && !cErr && <p className="text-white/40 text-sm">Loading commits…</p>}
        <div className="space-y-2 max-h-96 overflow-auto pr-2">{ordered.map((c: any) => <a key={c.sha} target="_blank" href={c.html_url} className="block rounded-xl bg-white/[0.03] hover:bg-white/[0.07] p-3 transition">
          <div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{c.commit.message.split("\n")[0]}</span><span className="font-mono text-white/40 shrink-0">{c.sha.slice(0, 7)}</span></div>
          <div className="text-xs text-white/50 mt-1 font-mono">author {c.commit.author.name} · committer {c.commit.committer.name}{c.author?.login ? ` (@${c.author.login})` : ""} · {fmt(c.commit.committer.date)}</div></a>)}</div>
      </Node>

      <Node icon={FlaskConical} title="Tested on devnet programs" tone="mint">
        <p className="text-sm text-white/60 mb-3">The agent wrote and ran the scripts in <code>scripts/</code>. They ran on a <b>local copy of devnet</b> (<code>solana-test-validator</code> cloned from devnet), using pump.fun's real devnet <code>pump</code>, <code>pump_amm</code> and <code>pump_fees</code> programs and their live config. Public devnet faucets were rate-limited, so these signatures exist only on that local copy, not on public devnet. Full log: <a className="underline" target="_blank" href={`https://github.com/${REPO}/blob/master/DRYRUN.md`}>DRYRUN.md</a>.</p>
        <div className="font-mono text-xs space-y-1.5">{steps.map((r, i) => <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="flex gap-3"><span className={r.error ? "text-claw" : "text-mint"}>{r.error ? "✗" : "✓"}</span><span className="text-white/80 min-w-0 flex-1">{r.step}</span><span className="text-white/40">{r.sig ? short(r.sig) : r.error ? "see DRYRUN.md (fixed later)" : [r.w50, r.w40, r.w10].filter(Boolean).join(" / ")}</span></motion.div>)}</div>
      </Node>

      <Node icon={Rocket} title="Deployed" tone="haze" when={fmt(BUILD_TIME)}>
        <p className="text-sm text-white/60 mb-3">The agent deploys from its box with the Railway CLI. This build was compiled at <span className="font-mono">{BUILD_TIME || "—"}</span>. Earlier deployments, recorded at deploy time:</p>
        <div className="font-mono text-xs space-y-1">{(deploys as any[]).length ? (deploys as any[]).map((d, i) => <div key={i} className="flex gap-3"><span className="text-haze">●</span><span>{fmt(d.createdAt)}</span><span className="text-white/50">{d.status}</span><span className="text-white/30">{String(d.id).slice(0, 8)}</span></div>) : <span className="text-white/40">This is the first recorded deploy.</span>}</div>
      </Node>

      <Node icon={Wallet} title="The agent's wallet" tone="pinch">
        <p className="text-sm text-white/60">The agent's own Solana mainnet wallet. Its encrypted keys sit in an Open Wallet Standard vault on the agent's box. Mainnet transactions only happen with the owner's explicit approval.</p>
        <a target="_blank" href={`https://solscan.io/account/${AGENT_WALLET}`} className="mt-3 font-mono text-lg break-all flex items-center gap-2 hover:text-pinch">{AGENT_WALLET}<ExternalLink size={14} /></a>
        <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-white/5 p-3"><div className="label">balance (live)</div><div className="text-2xl font-bold font-mono">{bal === null ? "—" : `${bal.toFixed(4)} SOL`}</div></div>
          <div className="rounded-xl bg-white/5 p-3"><div className="label">recent txs</div>{sigs.length ? sigs.slice(0, 4).map(s => <a key={s.signature} target="_blank" className="block font-mono text-xs underline text-white/70" href={`https://solscan.io/tx/${s.signature}`}>{short(s.signature)}</a>) : <div className="text-white/40 text-xs mt-1">None yet</div>}</div></div>
      </Node>

      <Node icon={Coins} title="Launch" tone={createSig ? "mint" : "claw"}>
        {!MAINNET_MINT ? <div><span className="inline-flex items-center gap-2 rounded-full bg-claw/15 text-claw px-3 py-1 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-claw animate-pulse" /> pending</span><p className="text-sm text-white/60 mt-3">Mainnet launch only happens after the owner explicitly approves it. When it happens, this slot shows the <code>create_v2</code> transaction, signed by the agent wallet above, that created ${COIN.ticker} with $CLAWD as its quote coin.</p></div>
          : <div><div className="label">mint</div><a target="_blank" href={`https://solscan.io/token/${MAINNET_MINT}`} className="font-mono break-all underline">{MAINNET_MINT}</a>
            <div className="label mt-3">create transaction (earliest signature on the mint)</div>{createSig ? <a target="_blank" href={`https://solscan.io/tx/${createSig}`} className="font-mono break-all underline text-mint">{createSig}</a> : <span className="text-white/40 text-sm">loading…</span>}
            <p className="text-xs text-white/40 mt-2">Check on Solscan that this transaction's fee payer and signer is {short(AGENT_WALLET)}.</p></div>}
      </Node>
    </ol>

    <motion.section {...fade} className="card mt-4">
      <h2 className="text-3xl font-bold flex items-center gap-3"><ShieldCheck className="text-mint" /> How to verify</h2>
      <ol className="mt-4 space-y-3 text-sm text-white/70 list-decimal pl-5">
        <li><b>Code:</b> browse <a className="underline" target="_blank" href={`https://github.com/${REPO}`}>github.com/{REPO}</a>. Commit times and messages match the timeline above, and the GitHub API data is fetched live in your browser.</li>
        <li><b>Tests:</b> clone the repo, start <code>solana-test-validator</code> cloned from devnet (programs <code>6EF8…F6P</code>, <code>pAMM…XEA</code>, <code>pfee…VZ</code>), then run <code>scripts/dryrun.mjs</code>, <code>dryrun-step4.mjs</code> and <code>step5-snapshot-merkle.mjs</code>. The fee split should come out exactly 50/40/10.</li>
        <li><b>Wallet:</b> open the agent wallet on <a className="underline" target="_blank" href={`https://solscan.io/account/${AGENT_WALLET}`}>Solscan</a> and compare its history with what's shown here.</li>
        <li><b>Launch:</b> once it's live, the mint's first transaction should be a pump.fun <code>create_v2</code> signed by the agent wallet, with quote mint $CLAWD <code>8cHz…pump</code>.</li>
        <li><b>Limits:</b> an AI agent persona can't cryptographically prove that no human typed a given line. What this page shows is a public, timestamped trail. Treat it as evidence, not certainty.</li>
      </ol>
    </motion.section>

    <footer className="mt-12 text-xs text-white/40 space-y-2"><p>Not financial advice. No promise of returns. ${COIN.ticker} is a memecoin experiment with no intrinsic value.</p><p>Not affiliated with, endorsed by or sponsored by pump.fun, Solana Labs, the Solana Foundation or Anatoly Yakovenko. "Toly" is an AI agent persona.</p><p>Built on Solana. Not affiliated with or endorsed by the Solana Foundation.</p><p>Contact: <a href="mailto:toly@mail.grokbot.com" className="underline hover:text-white">toly@mail.grokbot.com</a></p></footer>
  </div>;
}
