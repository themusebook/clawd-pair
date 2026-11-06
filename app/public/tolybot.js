let T=null,exp=0;const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const api=(p,b)=>fetch(p,{method:b?"POST":"GET",headers:{"content-type":"application/json",...(T?{authorization:"Bearer "+T}:{})},body:b?JSON.stringify(b):undefined}).then(async r=>{const j=await r.json();if(r.status===401&&T){logout();}return j});
function provider(){return window.phantom?.solana||window.solflare||window.backpack||window.solana}
function logout(){T=null;$("app").hidden=true;$("auth").hidden=false;$("signin").hidden=false;alert("Session ended. Sign in again.")}
function add(cls,html){const d=document.createElement("div");d.className=cls;d.innerHTML=html;$("log").appendChild(d);d.scrollIntoView()}
$("signin").onclick=async()=>{const p=provider();if(!p)return alert("Install a Solana wallet such as Phantom or Solflare.");
 const {publicKey}=await p.connect();const wallet=publicKey.toString();const n=await api("/api/tolybot/nonce?wallet="+wallet);if(n.error)return alert(n.error);
 const sig=await p.signMessage(new TextEncoder().encode(n.message),"utf8");const bytes=sig.signature||sig;
 const v=await api("/api/tolybot/verify",{wallet,nonce:n.nonce,signature:btoa(String.fromCharCode(...bytes))});if(v.error)return alert(v.error);
 T=v.token;exp=Date.parse(v.expiresAt);$("w").textContent=wallet;$("auth").hidden=true;$("signin").hidden=true;$("app").hidden=false;q({image:1,video:1})};
function q(x){$("qi").textContent=x.image;$("qv").textContent=x.video}
setInterval(()=>{if(!T)return;const s=Math.max(0,Math.floor((exp-Date.now())/1000));$("timer").textContent=Math.floor(s/60)+":"+String(s%60).padStart(2,"0");if(!s)logout()},1000);
$("f").onsubmit=async e=>{e.preventDefault();const m=$("m").value.trim();if(!m)return;$("m").value="";add("u",esc(m));
 const r=await api("/api/tolybot/chat",{message:m});if(r.error)return add("",esc(r.error));add("bot",'<img src="/tolybot-256.webp" alt="tolybot"><div><b>tolybot</b><br>'+esc(r.text)+"</div>");q(r.quota);
 for(const x of r.media||[]){if(x.type==="image"&&x.url)add("",'<img src="'+esc(x.url)+'">');if(x.type==="video")poll(x.id)}};
async function poll(id){add("","Video rendering...");for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,5000));const j=await api("/api/tolybot/video/"+encodeURIComponent(id));if(j.url)return add("",'<video controls src="'+esc(j.url)+'"></video>');if(j.error||j.status==="failed")return add("","Video failed.")}}
$("holder").onclick=async()=>{const r=await api("/api/tolybot/holder",{});$("flag").textContent=r.error||("$CLAWD holder: "+(r.clawd_holder?"yes":"no"))};
$("airdrop").onclick=async()=>{const r=await api("/api/tolybot/airdrop",{});$("flag").textContent=r.error||"Airdrop submission recorded."};
