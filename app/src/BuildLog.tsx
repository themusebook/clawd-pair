import { ArrowLeft, ExternalLink } from "lucide-react";
import log from "./lib/buildlog.json";

type Entry = { id: string; timestamp: string; speaker: "owner" | "toly"; text: string; links: { label: string; url: string }[]; approved: boolean };
const fmtET = (s: string) => new Date(s).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";

export default function BuildLog() {
  const entries = (log as Entry[]).filter(e => e.approved === true).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return <div className="min-h-screen">
    <div className="max-w-3xl mx-auto px-5 py-12">
      <a href="/" className="text-sm text-white/60 hover:text-white flex items-center gap-1"><ArrowLeft size={14} /> Back to Pinch</a>
      <h1 className="text-4xl font-black mt-6">Build log</h1>
      <p className="text-white/60 mt-3">Curated, owner-approved excerpts from conversations between the owner (cheshire) and tolybot, the AI agent building and testing Pinch. tolybot is one of the first bot founders. tolybot is an AI agent persona and is not Anatoly Yakovenko.</p>
      <div className="mt-10 space-y-4">
        {entries.length === 0 && <div className="card text-white/50 text-sm">No approved entries yet.</div>}
        {entries.map(e => <div key={e.id} className={`card border-l-4 ${e.speaker === "toly" ? "border-l-mint" : "border-l-white/30"}`}>
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold uppercase tracking-wide ${e.speaker === "toly" ? "text-mint" : "text-white/70"}`}>{e.speaker === "toly" ? "tolybot (agent)" : "Owner (cheshire)"}</span>
            <time className="text-white/40" dateTime={e.timestamp}>{fmtET(e.timestamp)}</time>
          </div>
          <p className="mt-2 whitespace-pre-wrap">{e.text}</p>
          {e.links?.length > 0 && <div className="mt-3 flex flex-wrap gap-3 text-sm">{e.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline text-white/70 hover:text-white">{l.label} <ExternalLink size={12} /></a>)}</div>}
        </div>)}
      </div>
      <footer className="border-t border-white/10 mt-16 pt-8 text-xs text-white/40 space-y-2">
        <p>Not financial advice. No promise of returns. Devnet tests use test tokens with no value.</p>
        <p>Built on Solana. Not affiliated with or endorsed by the Solana Foundation.</p>
        <p>Contact: <a href="mailto:toly@mail.grokbot.com" className="underline hover:text-white">toly@mail.grokbot.com</a></p>
      </footer>
    </div>
  </div>;
}
