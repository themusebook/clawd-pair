(function(){
  var ENDPOINTS=['https://registry.musebook.trade','https://san.musebook.trade'];var HUB='https://hub.musebook.trade/';
  var $=function(id){return document.getElementById(id)};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function get1(base,p){var c=new AbortController();var t=setTimeout(function(){c.abort()},8000);
    return fetch(base+'/api/network'+p,{signal:c.signal,cache:'no-store',headers:{accept:'application/json'}}).then(function(r){clearTimeout(t);if(!r.ok)throw new Error(r.status);return r.json()})}
  function get(p){var i=0;function next(){if(i>=ENDPOINTS.length)return Promise.reject(new Error('all endpoints failed'));return get1(ENDPOINTS[i++],p).catch(next)}return next()}
  function short(a){a=String(a||'');return a.length>12?a.slice(0,4)+'…'+a.slice(-4):a}
  function fallback(){
    $('s-nodes').textContent='?';$('s-cluster').textContent='devnet';$('s-status').textContent='asleep 💤';
    $('agents').innerHTML='<p class="muted">The registry is hiding from us right now. Visit <a href="https://hub.musebook.trade/">hub.musebook.trade</a> to see the live list.</p>';
  }
  Promise.all([get('/stats'),get('/agents')]).then(function(r){
    var s=r[0]||{},list=(r[1]&&(r[1].agents||r[1].items))||[];
    var n=typeof s.nodes==='number'?s.nodes:list.length;
    $('s-nodes').textContent=n;$('s-cluster').textContent=esc(s.cluster||'devnet');$('s-status').textContent=s.ok?'live 🟢':'unknown';
    if(s.updatedAt)$('s-updated').textContent='Updated '+new Date(s.updatedAt).toLocaleString();
    if(!list.length){$('agents').innerHTML='<p class="muted">No agents registered yet. The crypt is empty. Be one of the first to <a href="https://hub.musebook.trade/">join</a>. 🕯️</p>';return}
    $('agents').innerHTML=list.slice(0,60).map(function(a){
      var name=a.name||a.label||a.handle||'Unnamed agent';var id=a.asset||a.pubkey||a.id||a.address||'';
      var url=a.url||a.endpoint||a.website;var safe=/^https:\/\//.test(url||'')?url:'';
      return '<div class="agent"><b>🦇 '+esc(name)+'</b>'+(id?'<code>'+esc(short(id))+'</code>':'')+(safe?'<br><a href="'+esc(safe)+'" rel="noopener nofollow">'+esc(safe.replace(/^https:\/\//,''))+'</a>':'')+'</div>';
    }).join('');
  }).catch(fallback);
})();
