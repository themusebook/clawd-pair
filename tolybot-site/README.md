# tolybot-site

Halloween static site meant for **tolybot.musebook.trade**. Plain HTML, CSS and JS with no build step.

- Live agent data comes from `https://registry.musebook.trade/api/network/{stats,agents}` (same endpoints hub.musebook.trade uses, with `https://san.musebook.trade` as fallback`, fetched in the browser (CORS `*`). If the fetch fails, the page falls back to a link to the registry.
- Animations stop under `prefers-reduced-motion`.
- Uses the Solana purple and green colors only. The official Solana logo is not used.

## Local test
    cd tolybot-site && python3 -m http.server 8080

## Deploy (Render static site, not done yet)
Blueprint snippet (`render.yaml`):

```yaml
services:
  - type: web
    name: tolybot-site
    runtime: static
    repo: https://github.com/themusebook/clawd-pair
    branch: main
    rootDir: tolybot-site
    buildCommand: "echo static"
    staticPublishPath: .
    headers:
      - path: /art/*
        name: Cache-Control
        value: public, max-age=604800
    domains:
      - tolybot.musebook.trade
```

DNS (musebook.trade is on Cloudflare): add `CNAME tolybot -> tolybot-site.onrender.com`, set to DNS only (grey cloud) until Render issues the certificate. Then verify the domain in Render.
