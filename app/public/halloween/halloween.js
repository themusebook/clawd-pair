// Halloween 2026 for pinch.musebook.trade. Self-contained and reversible:
// - Auto-on through Nov 1, 2026 (local time); ?halloween=1 forces on, ?halloween=0 forces off.
// - To remove: delete app/public/halloween/ and the <script src="/halloween/halloween.js"> tags.
(function () {
  var q = new URLSearchParams(location.search).get("halloween");
  var on = q === "1" || (q !== "0" && Date.now() < new Date(2026, 10, 2).getTime());
  if (!on) return;
  var d = document, H = "/halloween/";
  d.documentElement.classList.add("halloween");
  var l = d.createElement("link"); l.rel = "stylesheet"; l.href = H + "halloween.css"; d.head.appendChild(l);
  function el(t, a, h) { var e = d.createElement(t); for (var k in a) e.setAttribute(k, a[k]); if (h) e.innerHTML = h; return e; }
  function init() {
    if (sessionStorage.getItem("hw-x") !== "1") {
      var b = el("div", { class: "hw-banner", role: "note" }, '<span>Happy Halloween 🎃 tolybot and Clawd dressed up for the night.</span><button aria-label="Dismiss Halloween banner">×</button>');
      b.querySelector("button").onclick = function () { b.remove(); sessionStorage.setItem("hw-x", "1"); };
      d.body.insertBefore(b, d.body.firstChild);
    }
    d.body.appendChild(el("div", { class: "hw-fx", "aria-hidden": "true" }, '<span class="hw-bat">🦇</span><span class="hw-bat">🦇</span><span class="hw-bat">🦇</span><span class="hw-ghost">👻</span>'));
    d.body.appendChild(el("div", { class: "hw-web", "aria-hidden": "true" }));
    if (/\/check(\.html)?$/.test(location.pathname)) {
      var h1 = d.querySelector("h1");
      if (h1) h1.insertAdjacentElement("afterend", el("div", { class: "hw-art", style: "margin:1rem 0;padding:0" }, '<figure><img src="' + H + 'list-halloween.webp" alt="A friendly ghost checking a glowing list with a magnifying glass, next to a jack-o\'-lantern" width="1100" height="619" loading="lazy"></figure>'));
    }
    var tries = 0, t = setInterval(function () {
      tries++;
      var hero = d.querySelector('img[src="/tolybot-hero-800.jpg"]');
      if (hero && !hero.dataset.hw) {
        hero.dataset.hw = "1"; var pic = hero.parentElement;
        if (pic && pic.tagName === "PICTURE") pic.querySelectorAll("source").forEach(function (s) { s.remove(); });
        hero.src = H + "tolybot-halloween.webp"; hero.alt = "tolybot in a lobster suit and vampire cape holding a jack-o'-lantern";
        var ring = hero.closest(".tb-ring"); if (ring) ring.classList.add("hw-glow");
      }
      var simd = d.getElementById("simd");
      if (simd && !d.getElementById("hw-simd")) {
        simd.insertAdjacentElement("beforebegin", el("section", { id: "hw-simd", class: "hw-art" },
          '<figure class="hw-split"><img src="' + H + 'simd-halloween.webp" alt="Ghosts carrying protocol proposal scrolls over a glowing circuit landscape lined with jack-o\'-lanterns" width="1100" height="619" loading="lazy">' +
          '<div><div class="hw-pair"><img src="' + H + 'tolybot-halloween.webp" alt="tolybot dressed up for Halloween" loading="lazy"><img src="' + H + 'clawd-halloween.webp" alt="Clawd in a vampire cape next to a jack-o\'-lantern" loading="lazy"></div>' +
          '<figcaption><b>Spooky season on Pinch.</b> tolybot and Clawd are in costume tonight. Read the haunted <a href="/simd">SIMD reference</a> or check if you\'re <a href="/check.html">on the airdrop list</a>.</figcaption></div></figure>'));
      }
      if ((hero && simd) || tries > 40 || /\/check|tolybot|contact|launch/.test(location.pathname)) clearInterval(t);
    }, 250);
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init); else init();
})();
