import { useEffect, useMemo, useState } from "react";

const DISCLAIMER = "Unofficial community draft. Built on Solana. Not affiliated with or endorsed by the Solana Foundation.";
const CONTACT = "toly@mail.grokbot.com";
type FS = { state: "active" | "pending" | "inactive" | "unknown"; slot?: number };
type Simd = { num: string; title: string; authors: string[]; category: string; type: string; status: string; created: string; feature: string | null; featureRaw: string; file: string; sections: { id: string; title: string }[]; featureStatus: Record<string, FS> | null };
const STATUS_ORDER = ["Idea", "Draft", "Review", "Accepted", "Implemented", "Activated", "Living", "Stagnant", "Withdrawn"];
const tone: Record<string, string> = { Activated: "bg-emerald-500/20 text-emerald-300", Implemented: "bg-teal-500/20 text-teal-300", Accepted: "bg-sky-500/20 text-sky-300", Review: "bg-amber-500/20 text-amber-300", Draft: "bg-violet-500/20 text-violet-300", Idea: "bg-white/10 text-white/70", Living: "bg-pink-500/20 text-pink-300", Withdrawn: "bg-red-500/20 text-red-300", Stagnant: "bg-zinc-500/20 text-zinc-300" };
const go = (p: string) => { history.pushState(null, "", p); window.dispatchEvent(new PopStateEvent("popstate")); };
const Link = ({ to, children, className = "" }: any) => <a href={to} className={className} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go(to); }}>{children}</a>;
const Badge = ({ s }: { s: string }) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tone[s] || "bg-white/10"}`}>{s}</span>;
const featLabel = (f?: FS) => !f ? "—" : f.state === "active" ? `active @${f.slot}` : f.state === "pending" ? "pending activation" : f.state === "inactive" ? "not activated" : "unknown";
const featTone = (f?: FS) => f?.state === "active" ? "text-emerald-300" : f?.state === "pending" ? "text-amber-300" : f?.state === "inactive" ? "text-white/60" : "text-white/40";

function Shell({ children }: any) {
  return <div className="min-h-screen bg-[#0b0b10] text-white">
    <div className="bg-amber-500/15 border-b border-amber-400/30 text-amber-100 text-sm px-4 py-2 text-center" role="note">{DISCLAIMER} Contact: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></div>
    <header className="max-w-6xl mx-auto px-4 pt-6 flex flex-wrap items-center gap-4"><Link to="/simd" className="text-2xl font-black">SIMD Explorer</Link>
      <nav className="flex gap-4 text-sm text-white/70"><Link to="/simd">Proposals</Link><Link to="/simd/spec">Living spec</Link><a href="https://github.com/solana-foundation/solana-improvement-documents" target="_blank" rel="noopener noreferrer">Source repo ↗</a></nav></header>
    <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    <footer className="max-w-6xl mx-auto px-4 pb-10 text-xs text-white/50">{DISCLAIMER} Data from the public SIMD repository and public RPC (read-only). Contact <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</footer>
  </div>;
}
function useJson<T>(url: string) { const [d, setD] = useState<T | null>(null); const [err, setErr] = useState("");
  useEffect(() => { setD(null); setErr(""); fetch(url).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); setD(j); }).catch((e) => setErr(String(e.message || e))); }, [url]); return { d, err }; }

function Index() {
  const { d, err } = useJson<{ simds: Simd[]; fetchedAt: string }>("/api/simd");
  const qs = new URLSearchParams(location.search);
  const [q, setQ] = useState(qs.get("q") || ""); const [status, setStatus] = useState(qs.get("status") || ""); const [cat, setCat] = useState(""); const [type, setType] = useState(""); const [section, setSection] = useState(""); const [sort, setSort] = useState("num-desc");
  const all = d?.simds || [];
  const uniq = (k: keyof Simd) => [...new Set(all.map((s) => String(s[k] || "")).filter(Boolean))].sort();
  const statuses = [...new Set([...STATUS_ORDER.filter((s) => all.some((x) => x.status === s)), ...uniq("status")])];
  const sections = [...new Map(all.flatMap((s) => s.sections).map((s) => [s.id, s.title])).entries()];
  const rows = useMemo(() => { const t = q.trim().toLowerCase();
    const r = all.filter((s) => (!status || s.status === status) && (!cat || s.category === cat) && (!type || s.type === type) && (!section || s.sections.some((x) => x.id === section))
      && (!t || `${s.num} simd-${s.num} ${s.title} ${s.authors.join(" ")} ${s.feature || ""}`.toLowerCase().includes(t)));
    const [k, dir] = sort.split("-"); const m = dir === "asc" ? 1 : -1;
    return r.sort((a, b) => m * (k === "num" ? a.num.localeCompare(b.num) : k === "created" ? a.created.localeCompare(b.created) : k === "title" ? a.title.localeCompare(b.title) : STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))); }, [all, q, status, cat, type, section, sort]);
  const sel = "bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm";
  if (err) return <p className="text-red-300">Could not load SIMDs: {err}</p>;
  return <>
    <div className="flex flex-wrap gap-2 mb-4">
      <input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, title, author, feature id…" className={`${sel} flex-1 min-w-[220px]`} />
      <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
      <select aria-label="Category" className={sel} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{uniq("category").map((s) => <option key={s}>{s}</option>)}</select>
      <select aria-label="Type" className={sel} value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{uniq("type").map((s) => <option key={s}>{s}</option>)}</select>
      <select aria-label="Spec section" className={sel} value={section} onChange={(e) => setSection(e.target.value)}><option value="">All spec sections</option>{sections.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>
      <select aria-label="Sort" className={sel} value={sort} onChange={(e) => setSort(e.target.value)}><option value="num-desc">Newest number</option><option value="num-asc">Oldest number</option><option value="created-desc">Created (new)</option><option value="created-asc">Created (old)</option><option value="status-asc">Status</option><option value="title-asc">Title</option></select>
    </div>
    <p className="text-xs text-white/50 mb-3">{d ? `${rows.length} of ${all.length} SIMDs · fetched ${new Date(d.fetchedAt).toLocaleString()}` : "Loading SIMDs from GitHub…"}</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-white/50"><tr><th className="py-2 pr-3">#</th><th className="pr-3">Title</th><th className="pr-3">Status</th><th className="pr-3">Category / Type</th><th className="pr-3">Created</th><th className="pr-3">Mainnet gate</th><th>Spec sections</th></tr></thead>
      <tbody>{rows.map((s) => <tr key={s.num} className="border-t border-white/5 hover:bg-white/5 align-top">
        <td className="py-2 pr-3 font-mono"><Link to={`/simd/${s.num}`}>{s.num}</Link></td>
        <td className="pr-3"><Link to={`/simd/${s.num}`} className="font-medium hover:underline">{s.title}</Link><div className="text-xs text-white/40">{s.authors.slice(0, 3).join(", ")}{s.authors.length > 3 ? " …" : ""}</div></td>
        <td className="pr-3"><Badge s={s.status} /></td><td className="pr-3 text-white/70">{s.category}{s.type ? ` / ${s.type}` : ""}</td><td className="pr-3 font-mono text-white/60">{s.created}</td>
        <td className={`pr-3 text-xs ${featTone(s.featureStatus?.mainnet)}`}>{s.feature ? featLabel(s.featureStatus?.mainnet) : "no gate listed"}</td>
        <td className="text-xs">{s.sections.map((x) => <Link key={x.id} to={`/simd/spec#${x.id}`} className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-white/10">{x.title.split(" (")[0]}</Link>)}</td></tr>)}</tbody></table></div>
  </>;
}

function Detail({ num }: { num: string }) {
  const { d, err } = useJson<any>(`/api/simd/${num}`);
  if (err) return <p className="text-red-300">SIMD-{num}: {err}</p>; if (!d) return <p className="text-white/50">Loading SIMD-{num}…</p>;
  return <article>
    <Link to="/simd" className="text-sm text-white/50">← all SIMDs</Link>
    <h1 className="text-3xl font-black mt-2">SIMD-{d.num}: {d.title}</h1>
    <div className="flex flex-wrap gap-3 items-center mt-3 text-sm"><Badge s={d.status} /><span>{d.category} / {d.type}</span><span className="text-white/50">created {d.created}</span><span className="text-white/50">by {d.authors.join(", ")}</span></div>
    <div className="grid md:grid-cols-2 gap-4 mt-5">
      <div className="rounded-xl border border-white/10 p-4"><h2 className="font-bold mb-2">Feature gate</h2>
        {d.feature ? <><code className="text-xs break-all">{d.feature}</code><ul className="mt-2 text-sm">{["mainnet", "devnet", "testnet"].map((c) => <li key={c} className="flex justify-between"><span>{c}</span><span className={featTone(d.featureStatus?.[c])}>{featLabel(d.featureStatus?.[c])}</span></li>)}</ul><p className="text-xs text-white/40 mt-2">Read-only getMultipleAccounts on public RPC; "unknown" if the RPC failed.</p></>
          : <p className="text-sm text-white/60">No feature id in frontmatter{d.featureRaw ? <> (“{d.featureRaw}”)</> : null}.</p>}</div>
      <div className="rounded-xl border border-white/10 p-4"><h2 className="font-bold mb-2">Links</h2><ul className="text-sm space-y-1">
        <li><a className="underline" href={d.github} target="_blank" rel="noopener noreferrer">View on GitHub ↗</a></li>
        <li><a className="underline" href={d.prSearch} target="_blank" rel="noopener noreferrer">PRs and discussion ↗</a></li>
        {d.prs === null ? <li className="text-white/40">Open PR lookup unavailable</li> : d.prs.length ? d.prs.map((p: any) => <li key={p.number}><a className="underline" href={p.url} target="_blank" rel="noopener noreferrer">#{p.number} {p.title}</a> <span className="text-white/40 text-xs">(open)</span></li>) : <li className="text-white/40">No open PRs mention this SIMD</li>}
      </ul>
        <h2 className="font-bold mt-3 mb-1">Spec sections</h2>{d.sections.length ? d.sections.map((x: any) => <Link key={x.id} to={`/simd/spec#${x.id}`} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded bg-white/10 text-sm">{x.title}</Link>) : <p className="text-sm text-white/40">Not yet mapped in the living spec.</p>}</div>
    </div>
    {/* html is produced server-side by renderMarkdown, which escapes all source HTML */}
    <div className="simd-md mt-6" dangerouslySetInnerHTML={{ __html: d.html }} />
  </article>;
}

function Spec() {
  const { d, err } = useJson<any>("/api/simd/spec");
  useEffect(() => { if (d && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView(); }, [d]);
  if (err) return <p className="text-red-300">{err}</p>; if (!d) return <p className="text-white/50">Loading spec…</p>;
  const pending = d.sections.flatMap((s: any) => s.simds.filter((x: any) => !x.live).map((x: any) => ({ ...x, section: s })));
  return <article className="simd-md">
    <h1>Living Solana Protocol Spec — first draft</h1>
    <div dangerouslySetInnerHTML={{ __html: d.intro }} />
    <p className="text-xs text-white/50">SIMD statuses: {d.statusSource}</p>
    <h2>Contents</h2><ol>{d.sections.map((s: any, i: number) => <li key={s.id}><a href={`#${s.id}`}>{i + 1}. {s.title}</a></li>)}<li><a href="#pending">Appendix: Pending changes</a></li></ol>
    {d.sections.map((s: any, i: number) => <section key={s.id} id={s.id} className="scroll-mt-6">
      <h2>{i + 1}. {s.title}</h2>
      <div dangerouslySetInnerHTML={{ __html: s.html }} />
      <h4>Normative SIMDs (Activated on mainnet)</h4>
      <ul>{s.simds.filter((x: any) => x.live).map((x: any) => <li key={x.num}><Link to={`/simd/${x.num}`}>SIMD-{x.num}</Link> {x.title} <Badge s={x.status} /></li>)}</ul>
      {s.simds.some((x: any) => !x.live) && <p className="text-xs text-white/50">{s.simds.filter((x: any) => !x.live).length} pending SIMD(s) touch this section — see the appendix. Statements citing them are not normative.</p>}
    </section>)}
    <section id="pending"><h2>Appendix: Pending changes</h2><p>Not live on Mainnet Beta (SIMD status not Activated, or its mainnet feature account is not active); not normative.</p>
      <table><thead><tr><th>SIMD</th><th>Title</th><th>Status</th><th>Section</th></tr></thead><tbody>{pending.map((x: any) => <tr key={x.num + x.section.id}><td><Link to={`/simd/${x.num}`}>SIMD-{x.num}</Link></td><td>{x.title || "—"}</td><td><Badge s={x.status} />{x.discrepancy && <span className="ml-1 text-xs text-amber-300" title="SIMD repo says Activated but the mainnet feature account was not found active">⚠ repo says Activated, mainnet gate {x.mainnetGate}</span>}</td><td><a href={`#${x.section.id}`}>{x.section.title}</a></td></tr>)}</tbody></table></section>
    <p className="text-xs text-white/50 mt-6">Source: <code>app/spec/</code> in this repo. Contribute: one PR per protocol change, merged only once live on mainnet (CONTRIBUTING.md).</p>
  </article>;
}

export default function SimdApp({ path: initial }: { path: string }) {
  const [path, setPath] = useState(initial);
  useEffect(() => { const f = () => setPath(location.pathname.replace(/\/+$/, "")); addEventListener("popstate", f); return () => removeEventListener("popstate", f); }, []);
  useEffect(() => { document.title = path === "/simd/spec" ? "Living Solana Spec (draft)" : "SIMD Explorer"; window.scrollTo(0, 0); }, [path]);
  const m = /^\/simd\/(\d{1,4})$/.exec(path);
  return <Shell>{path === "/simd/spec" ? <Spec /> : m ? <Detail num={m[1].padStart(4, "0")} /> : <Index />}</Shell>;
}
