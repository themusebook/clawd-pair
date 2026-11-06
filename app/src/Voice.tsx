import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Rocket, ShieldAlert } from "lucide-react";
import { NETWORK, MAINNET_ENABLED, explorer } from "./lib/config";
import { launchToken, type LaunchDraft, type Phantom } from "./lib/chain";

const RATE = 24000;
const b64 = (buf: ArrayBuffer) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const empty: LaunchDraft = { name: "", symbol: "", description: "", image_url: "" };

export default function VoiceLaunch({ wallet, onConnect }: { wallet: Phantom | null; onConnect: () => void }) {
  const [live, setLive] = useState(false); const [status, setStatus] = useState("");
  const [lines, setLines] = useState<{ who: "you" | "toly"; t: string }[]>([]);
  const [draft, setDraft] = useState<LaunchDraft>(empty); const [fromVoice, setFromVoice] = useState(false);
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ ok: boolean; t: string; sig?: string; mint?: string } | null>(null);
  const ws = useRef<WebSocket | null>(null); const ctx = useRef<AudioContext | null>(null); const stream = useRef<MediaStream | null>(null); const playAt = useRef(0);
  const say = (who: "you" | "toly", t: string, append = false) => setLines(l => append && l.length && l[l.length - 1].who === who ? [...l.slice(0, -1), { who, t: l[l.length - 1].t + t }] : [...l, { who, t }].slice(-30));

  const stop = () => { ws.current?.close(); ws.current = null; stream.current?.getTracks().forEach(t => t.stop()); ctx.current?.close().catch(() => {}); ctx.current = null; setLive(false); };
  useEffect(() => stop, []);

  const play = (data: string) => { const c = ctx.current; if (!c) return; const bin = atob(data); const pcm = new Int16Array(bin.length / 2);
    for (let i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
    const buf = c.createBuffer(1, pcm.length, RATE); const ch = buf.getChannelData(0); for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination); playAt.current = Math.max(playAt.current, c.currentTime); src.start(playAt.current); playAt.current += buf.duration; };

  const onTool = (e: any) => { let a: any = {}; try { a = JSON.parse(e.arguments || "{}"); } catch {}
    setDraft({ name: String(a.name || "").slice(0, 32), symbol: String(a.symbol || "").replace(/^\$/, "").toUpperCase().slice(0, 10), description: String(a.description || "").slice(0, 500), image_url: a.image_url || "", initial_buy_sol: typeof a.initial_buy_sol === "number" ? a.initial_buy_sol : undefined });
    setFromVoice(true); setRes(null); document.getElementById("launch-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    ws.current?.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: e.call_id, output: JSON.stringify({ status: "form_filled", note: "The form is filled on the page. Nothing was signed or sent. The user must review it and click Launch, then approve in Phantom." }) } }));
    setTimeout(() => ws.current?.send(JSON.stringify({ type: "response.create" })), Math.max(0, (playAt.current - (ctx.current?.currentTime ?? 0)) * 1000)); };

  const start = async (text?: string) => {
    if (ws.current) { if (text) send(text); return; }
    setStatus("connecting…"); setLines([]);
    const c = new AudioContext({ sampleRate: RATE }); ctx.current = c; playAt.current = 0;
    const s = new WebSocket(`${location.origin.replace(/^http/, "ws")}/voice`, ["pinch-owner", sessionStorage.getItem("pinch-owner") || ""]); ws.current = s;
    s.onclose = () => { setStatus(st => st.startsWith("error") || st.startsWith("limit") ? st : "ended"); stop(); };
    s.onerror = () => setStatus("error: refused (owner token wrong, voice off, or rate limited)");
    s.onmessage = (m) => { const e = JSON.parse(m.data);
      if (e.type === "pinch.ready") { setStatus(`live · ${Math.round(e.maxSeconds / 60)} min max`); setLive(true); if (text) send(text); }
      else if (e.type === "pinch.error") setStatus("error: " + e.error);
      else if (e.type === "pinch.session_limit") setStatus("limit: session time cap reached");
      else if (e.type === "response.output_audio.delta") play(e.delta);
      else if (e.type === "response.output_audio_transcript.delta") say("toly", e.delta, true);
      else if (e.type === "response.output_audio_transcript.done") setLines(l => [...l.filter(x => x.t), { who: "toly" as const, t: "" }]);
      else if (e.type === "conversation.item.input_audio_transcription.completed" && e.transcript) say("you", e.transcript);
      else if (e.type === "input_audio_buffer.speech_started") { playAt.current = 0; }
      else if (e.type === "response.function_call_arguments.done" && e.name === "prepare_token_launch") onTool(e); };
    if (!text) try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }); stream.current = st;
      const src = c.createMediaStreamSource(st); const proc = c.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (ev) => { if (ws.current?.readyState !== 1) return; const f = ev.inputBuffer.getChannelData(0); const p = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); p[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
        ws.current.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64(p.buffer) })); };
      src.connect(proc); proc.connect(c.destination);
    } catch { setStatus("error: microphone blocked. Type below instead."); }
  };
  const send = (t: string) => { say("you", t); ws.current?.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: t }] } })); ws.current?.send(JSON.stringify({ type: "response.create" })); };
  const [typed, setTyped] = useState("");

  const valid = draft.name.trim() && draft.symbol.trim() && draft.description.trim();
  const launch = async () => { if (!wallet?.publicKey) return onConnect(); setBusy(true); setRes(null);
    try { const r = await launchToken(wallet, draft); setRes({ ok: true, t: `Launched on ${NETWORK}`, sig: r.signature, mint: r.mint }); } catch (e: any) { setRes({ ok: false, t: String(e?.message || e).slice(0, 220) }); } finally { setBusy(false); } };
  const inp = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-pinch";

  return <section id="voice" className="max-w-6xl mx-auto px-5 py-8"><div className="card grid md:grid-cols-2 gap-8">
    <div><h2 className="text-3xl font-bold flex items-center gap-3"><Mic className="text-pinch" /> Launch a token by voice</h2>
      <p className="text-white/60 text-sm mt-2">Talk to tolybot. Say something like "launch a token called Test Crab, symbol TCRAB". tolybot fills the form; you review it and sign in Phantom. Nothing is signed for you.</p>
      <div className="mt-4 flex gap-2 items-center"><button className={live ? "btn-ghost flex items-center gap-2" : "btn-hot flex items-center gap-2"} onClick={() => live ? stop() : start()}>{live ? <><MicOff size={18} /> Stop</> : <><Mic size={18} /> Talk to tolybot</>}</button><span className="text-xs text-white/50">{status}</span></div>
      <div className="mt-3 flex gap-2"><input className={inp} value={typed} onChange={e => setTyped(e.target.value)} placeholder="…or type to tolybot" onKeyDown={e => { if (e.key === "Enter" && typed.trim()) { start(typed.trim()); setTyped(""); } }} /></div>
      <div className="mt-3 h-48 overflow-y-auto rounded-2xl bg-black/30 p-3 text-sm space-y-1">{lines.filter(l => l.t).map((l, i) => <div key={i}><b className={l.who === "toly" ? "text-mint" : "text-pinch"}>{l.who}:</b> {l.t}</div>)}{!lines.length && <div className="text-white/30">transcript appears here</div>}</div>
    </div>
    <div id="launch-form"><div className="label mb-2 flex items-center gap-2"><Rocket size={14} /> launch form · {NETWORK}{NETWORK !== "mainnet" && " (test tokens)"}</div>
      <div className="space-y-2">
        <input className={inp} placeholder="Name" maxLength={32} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <input className={inp} placeholder="SYMBOL" maxLength={10} value={draft.symbol} onChange={e => setDraft({ ...draft, symbol: e.target.value.toUpperCase().replace(/^\$/, "") })} />
        <textarea className={inp} placeholder="Description" maxLength={500} rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
        <input className={inp} placeholder="Image URL (https, optional)" value={draft.image_url || ""} onChange={e => setDraft({ ...draft, image_url: e.target.value })} />
      </div>
      {valid && <div className="mt-4 rounded-2xl border border-pinch/40 bg-pinch/10 p-4 text-sm">
        <div className="font-semibold">{fromVoice ? "tolybot filled this in. Please check it." : "Review"}</div>
        <div className="mt-1 font-mono">{draft.name} · ${draft.symbol}</div>
        <div className="text-white/60 mt-1">Quoted in CLAWD (create_v2) on <b>{NETWORK}</b>. You pay the network fee and sign in Phantom.</div>
        {draft.initial_buy_sol != null && <div className="text-white/60 mt-1">Initial buy requested: {draft.initial_buy_sol} SOL. It's <b>not</b> included in this transaction. Buy separately after launch if you still want it.</div>}
        {NETWORK === "mainnet" && !MAINNET_ENABLED && <div className="text-claw mt-1 flex items-center gap-1"><ShieldAlert size={14} /> Mainnet is off.</div>}
        <button className="btn-hot w-full mt-3" disabled={busy} onClick={launch}>{!wallet?.publicKey ? "Connect Phantom to launch" : busy ? "Waiting for Phantom…" : `Launch $${draft.symbol} (sign in Phantom)`}</button>
      </div>}
      {res && <div className={`mt-3 text-sm ${res.ok ? "text-mint" : "text-claw"}`}>{res.t}{res.sig && <> · <a className="underline" href={explorer("tx", res.sig)} target="_blank" rel="noreferrer">tx</a></>}{res.mint && <> · mint <span className="font-mono">{res.mint.slice(0, 6)}…</span></>}</div>}
    </div>
  </div></section>;
}
