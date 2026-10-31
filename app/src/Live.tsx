import { useEffect, useState } from "react";
import { Activity, Gift, Rocket, Timer, ExternalLink } from "lucide-react";
import { LAUNCH_AT } from "./lib/config";

const short = (s: string) => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : "—");
const usd = (n?: number | null, d = 0) => (n == null || !isFinite(n) ? "—" : "$" + n.toLocaleString(undefined, { maximumFractionDigits: d }));
const ago = (t: string, now: number) => { const s = Math.max(0, Math.floor((now - new Date(t).getTime()) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
function useNow(ms = 1000) { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]); return n; }

export function CountdownBanner() {
  const now = useNow(); const target = new Date(LAUNCH_AT).getTime(); if (!isFinite(target)) return null;
  const d = Math.max(0, target - now); const done = d === 0;
  const parts = [["days", Math.floor(d / 864e5)], ["hrs", Math.floor(d / 36e5) % 24], ["min", Math.floor(d / 6e4) % 60], ["sec", Math.floor(d / 1e3) % 60]] as const;
  const when = new Date(target).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";
  return <section id="countdown" className="max-w-6xl mx-auto px-5 pt-8"><div className="card text-center border border-pinch/30">
    <div className="label flex items-center justify-center gap-2"><Timer size={14} /> {done ? "launch time reached" : "launch countdown"} · {when}</div>
    {done ? <div className="mt-3 text-5xl md:text-6xl font-bold grad">🦀 It's 4:20. Pinch time.</div>
      : <div className="mt-4 flex justify-center gap-3 md:gap-6">{parts.map(([k, v]) => <div key={k} className="rounded-2xl bg-white/5 px-4 md:px-7 py-4 min-w-[80px]"><div className="text-5xl md:text-7xl font-bold font-mono tabular-nums">{String(v).padStart(2, "0")}</div><div className="label mt-1">{k}</div></div>)}</div>}
  </div></section>;
}

export function ClawdLive() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => { const f = () => fetch("/api/clawd").then(r => r.ok ? r.json() : Promise.reject(r.status)).then(x => { setD(x); setErr(""); }).catch(e => setErr(String(e))); f(); const t = setInterval(f, 10000); return () => clearInterval(t); }, []);
  const ch = d?.change || {}; const pct = (v?: number) => v == null ? "—" : <span className={v >= 0 ? "text-mint" : "text-claw"}>{v >= 0 ? "+" : ""}{v}%</span>;
  const stats: [string, any][] = [["price", d ? "$" + d.priceUsd.toPrecision(4) : "—"], ["market cap", usd(d?.marketCap)], ["24h volume", usd(d?.volume24h)], ["liquidity", usd(d?.liquidityUsd)], ["holders", d?.holders ?? "n/a"], ["1h / 24h", <>{pct(ch.h1)} / {pct(ch.h24)}</>]];
  return <section id="clawd" className="max-w-6xl mx-auto px-5 py-8"><div className="card">
    <div className="flex items-center justify-between"><h2 className="text-3xl font-bold flex items-center gap-3"><Activity className="text-mint" /> $CLAWD live</h2>
      <span className="text-xs text-white/40">{err ? `error: ${err}` : d ? `DexScreener · ${new Date(d.updatedAt).toLocaleTimeString()}` : "loading…"}</span></div>
    <div className="mt-5 grid grid-cols-2 md:grid-cols-6 gap-3">{stats.map(([k, v]) => <div key={k} className="rounded-2xl bg-white/5 p-4"><div className="label">{k}</div><div className="text-xl font-bold font-mono mt-1">{v}</div></div>)}</div>
    {d?.pairUrl && <a href={d.pairUrl} target="_blank" rel="noreferrer" className="text-xs text-white/50 underline mt-3 inline-flex items-center gap-1">chart <ExternalLink size={12} /></a>}
  </div></section>;
}

export function LaunchFeed() {
  const [d, setD] = useState<any>(null); const now = useNow();
  useEffect(() => { const es = new EventSource("/api/launches/stream"); es.onmessage = e => { try { setD(JSON.parse(e.data)); } catch {} }; return () => es.close(); }, []);
  return <section id="launches" className="max-w-6xl mx-auto px-5 py-8"><div className="card">
    <div className="flex items-center justify-between"><h2 className="text-3xl font-bold flex items-center gap-3"><Rocket className="text-pinch" /> Live pump.fun launches</h2>
      <span className="text-xs text-white/40 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-mint animate-pulse" />{d ? `${d.launches.length} · via pumpai` : "connecting…"}</span></div>
    <div className="mt-5 grid md:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-1">{d?.launches?.map((l: any) => <a key={l.mint} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-white/5 hover:bg-white/10 p-3">
      {l.image ? <img src={l.image} alt="" loading="lazy" className="w-10 h-10 rounded-xl object-cover bg-white/10" onError={e => (e.currentTarget.style.visibility = "hidden")} /> : <div className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center">🪙</div>}
      <div className="min-w-0 flex-1"><div className="font-semibold truncate">{l.name} <span className="text-pinch font-mono text-sm">${l.symbol}</span></div><div className="text-xs text-white/40 font-mono">{short(l.mint)}{l.marketCapSol != null && ` · ${Number(l.marketCapSol).toFixed(1)} SOL mcap`}</div></div>
      <div className="text-xs text-white/50 font-mono">{ago(l.time, now)}</div></a>)}</div>
  </div></section>;
}
