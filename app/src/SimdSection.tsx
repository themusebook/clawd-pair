import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Search, AlertTriangle, ArrowRight, Layers } from "lucide-react";

// Home-page SIMD section. Reads /api/simd and /api/simd/spec (server-cached); renders skeletons while slow, never blocks the page.
const SOL_P = "#9945FF", SOL_G = "#14F195"; // Solana brand purple / green (colors only, no logo)
const DISCLAIMER = "Unofficial community draft. Built on Solana. Not affiliated with or endorsed by the Solana Foundation.";
const ORDER = ["Activated", "Implemented", "Accepted", "Review", "Draft", "Idea", "Living", "Stagnant", "Withdrawn"];
type FS = { state: string; slot?: number };
type S = { num: string; title: string; status: string; created: string; feature: string | null; featureStatus: Record<string, FS> | null };
const fade = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.6 } };

function useApi<T>(url: string, ms = 25000) {
  const [d, setD] = useState<T | null>(null); const [err, setErr] = useState(""); const [slow, setSlow] = useState(false);
  useEffect(() => { const ac = new AbortController(); const s = setTimeout(() => setSlow(true), 4000); const t = setTimeout(() => ac.abort(), ms);
    fetch(url, { signal: ac.signal }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || String(r.status)); setD(j); })
      .catch((e) => setErr(e.name === "AbortError" ? "timed out" : String(e.message || e))).finally(() => { clearTimeout(s); clearTimeout(t); });
    return () => { ac.abort(); clearTimeout(s); clearTimeout(t); }; }, [url, ms]);
  return { d, err, slow };
}
const Skel = ({ h = "h-20" }: { h?: string }) => <div className={`${h} rounded-2xl bg-white/5 animate-pulse`} />;
const Card = ({ children, className = "" }: any) => <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>{children}</div>;

export default function SimdSection() {
  const list = useApi<{ simds: S[]; fetchedAt: string }>("/api/simd");
  const spec = useApi<{ sections: { id: string; title: string; simds: { num: string; title: string | null; status: string; live: boolean; discrepancy: boolean; mainnetGate: string }[] }[] }>("/api/simd/spec");
  const [q, setQ] = useState("");
  const simds = list.d?.simds || [];
  const counts = ORDER.map((s) => [s, simds.filter((x) => x.status === s).length] as const).filter(([, n]) => n);
  const gated = simds.filter((x) => x.feature);
  const gate = (c: string) => { const r = { active: 0, inactive: 0, unknown: 0 }; for (const x of gated) { const st = x.featureStatus?.[c]?.state; if (st === "active") r.active++; else if (st === "inactive" || st === "pending") r.inactive++; else r.unknown++; } return r; };
  const newest = [...simds].sort((a, b) => b.created.localeCompare(a.created) || b.num.localeCompare(a.num)).slice(0, 8);
  const disc = new Map<string, { num: string; title: string | null; mainnetGate: string }>();
  spec.d?.sections.forEach((s) => s.simds.forEach((x) => x.discrepancy && disc.set(x.num, x)));
  const err = (e: string) => <p className="text-sm text-white/50">Couldn't load right now ({e}). <a className="underline" href="/simd">Open the SIMD explorer</a></p>;
  const slowNote = (list.slow && !list.d && !list.err) || (spec.slow && !spec.d && !spec.err) ? <p className="text-xs text-white/40">Fetching from GitHub and public RPC, this can take a few seconds…</p> : null;

  return <section id="simd" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-20">
    <motion.div {...fade} className="rounded-3xl p-[1px]" style={{ background: `linear-gradient(135deg, ${SOL_P}, ${SOL_G})` }}>
      <div className="rounded-3xl bg-ink p-5 sm:p-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div><p className="text-xs font-mono uppercase tracking-widest" style={{ color: SOL_G }}>Solana Improvement Documents</p>
            <h2 className="text-3xl sm:text-4xl font-black mt-1"><span style={{ backgroundImage: `linear-gradient(90deg, ${SOL_P}, ${SOL_G})` }} className="bg-clip-text text-transparent">SIMD tracker</span> + living spec</h2>
            <p className="text-white/60 mt-2 max-w-2xl text-sm sm:text-base">Every SIMD from the official repo, live feature-gate checks on mainnet, testnet and devnet, and a community draft of one living protocol spec.</p></div>
          <form className="flex w-full md:w-auto" onSubmit={(e) => { e.preventDefault(); location.href = `/simd${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`; }}>
            <label className="sr-only" htmlFor="simd-q">Search SIMDs</label>
            <input id="simd-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SIMDs, e.g. 0096 or rent" className="flex-1 md:w-64 min-w-0 bg-white/5 border border-white/15 rounded-l-xl px-3 py-2 text-sm outline-none focus:border-white/40" />
            <button className="rounded-r-xl px-3 text-ink font-bold flex items-center gap-1" style={{ background: SOL_G }} aria-label="Search"><Search size={16} /></button>
          </form>
        </div>
        {slowNote}

        <div><h3 className="font-bold mb-3">Status</h3>
          {list.err ? err(list.err) : !list.d ? <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">{Array.from({ length: 5 }, (_, i) => <Skel key={i} />)}</div> :
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">{counts.map(([s, n]) => <a key={s} href={`/simd?status=${s}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:border-white/30">
            <div className="text-2xl font-black" style={{ color: s === "Activated" ? SOL_G : s === "Review" || s === "Accepted" ? SOL_P : undefined }}>{n}</div><div className="text-xs text-white/60">{s}</div></a>)}
            <div className="rounded-2xl border border-white/10 p-3"><div className="text-2xl font-black">{simds.length}</div><div className="text-xs text-white/60">Total</div></div></div>}
        </div>

        <div><h3 className="font-bold mb-3">Feature-gate activation <span className="text-xs font-normal text-white/40">({gated.length || "…"} SIMDs list a feature id; read-only RPC)</span></h3>
          {list.err ? err(list.err) : !list.d ? <div className="grid sm:grid-cols-3 gap-3"><Skel /><Skel /><Skel /></div> :
          <div className="grid sm:grid-cols-3 gap-3">{["mainnet", "testnet", "devnet"].map((c) => { const g = gate(c), tot = gated.length || 1; return <Card key={c}>
            <div className="flex justify-between items-baseline"><span className="font-bold capitalize">{c}</span><span className="text-xs text-white/40">{g.active}/{gated.length} active</span></div>
            <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden flex" role="img" aria-label={`${c}: ${g.active} active, ${g.inactive} not activated, ${g.unknown} unknown`}>
              <div style={{ width: `${(100 * g.active) / tot}%`, background: SOL_G }} /><div style={{ width: `${(100 * g.inactive) / tot}%`, background: SOL_P }} /><div style={{ width: `${(100 * g.unknown) / tot}%` }} className="bg-white/25" /></div>
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs"><span style={{ color: SOL_G }}>● active {g.active}</span><span style={{ color: SOL_P }}>● not activated {g.inactive}</span><span className="text-white/50">● unknown {g.unknown}</span></div>
            {g.unknown === gated.length && gated.length > 0 && <p className="text-xs text-white/40 mt-1">RPC unreachable right now, shown as unknown.</p>}
          </Card>; })}</div>}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div><h3 className="font-bold mb-3">Newest SIMDs</h3>
            {list.err ? err(list.err) : !list.d ? <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skel key={i} h="h-10" />)}</div> :
            <ul className="divide-y divide-white/5 rounded-2xl border border-white/10">{newest.map((s) => <li key={s.num}><a href={`/simd/${s.num}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5">
              <span className="font-mono text-xs text-white/50 shrink-0">{s.num}</span><span className="flex-1 min-w-0 truncate text-sm">{s.title}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 shrink-0">{s.status}</span><span className="hidden sm:inline text-xs text-white/40 font-mono shrink-0">{s.created}</span></a></li>)}</ul>}
            <a href="/simd" className="inline-flex items-center gap-1 text-sm mt-3" style={{ color: SOL_G }}>All {simds.length || ""} SIMDs <ArrowRight size={14} /></a>
          </div>
          <div><h3 className="font-bold mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-pinch" /> Status vs mainnet mismatches</h3>
            {spec.err ? err(spec.err) : !spec.d ? <Skel h="h-40" /> : disc.size === 0 ? <Card><p className="text-sm text-white/60">No mismatches right now (or mainnet RPC was unreachable).</p></Card> :
            <Card><p className="text-sm text-white/60 mb-2">Marked <b>Activated</b> in the official repo, but the listed feature account was not found active on mainnet. Kept out of the normative spec.</p>
              <ul className="space-y-1.5">{[...disc.values()].map((x) => <li key={x.num}><a href={`/simd/${x.num}`} className="flex flex-wrap sm:flex-nowrap gap-x-2 text-sm hover:underline"><span className="font-mono text-pinch shrink-0">SIMD-{x.num}</span><span className="truncate min-w-0 flex-1">{x.title}</span><span className="w-full sm:w-auto sm:ml-auto text-xs text-white/40 shrink-0">gate: {x.mainnetGate === "inactive" ? "not activated" : x.mainnetGate}</span></a></li>)}</ul></Card>}
          </div>
        </div>

        <div><h3 className="font-bold mb-3 flex items-center gap-2"><Layers size={16} /> Living spec: {spec.d?.sections.length || 13} sections</h3>
          {spec.err ? err(spec.err) : !spec.d ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{Array.from({ length: 6 }, (_, i) => <Skel key={i} h="h-16" />)}</div> :
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{spec.d.sections.map((s, i) => { const live = s.simds.filter((x) => x.live).length, pend = s.simds.length - live; return <a key={s.id} href={`/simd/spec#${s.id}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:border-white/30">
            <div className="text-sm font-semibold">{i + 1}. {s.title}</div>
            <div className="mt-1 flex gap-3 text-xs"><span style={{ color: SOL_G }}>{live} normative</span><span style={{ color: SOL_P }}>{pend} pending</span></div></a>; })}</div>}
          <a href="/simd/spec" className="inline-flex items-center gap-1 text-sm mt-3" style={{ color: SOL_G }}><BookOpen size={14} /> Read the living spec <ArrowRight size={14} /></a>
        </div>

        <p className="text-xs text-white/50 border-t border-white/10 pt-4">{DISCLAIMER} Data: public SIMD repo + public RPC (read-only). Contact <a className="underline" href="mailto:toly@mail.grokbot.com">toly@mail.grokbot.com</a></p>
      </div>
    </motion.div>
  </section>;
}
