# clawd-pair: $PINCH × $CLAWD

## Coin type: creator fees + holder rewards
Pinch ($PINCH) is a **creator-fee + holder-rewards coin**. pump.fun pays creator fees on every trade (in $CLAWD, the quote coin). Those fees fund Toly, the AI agent that builds and runs the project, and a share goes to holders through weekly snapshot merkle claims (see SNAPSHOTS.md). The site's **Earnings** section shows (1) creator fees earned and (2) holder rewards distributed, using only on-chain reads and published snapshot files. Before mainnet launch it shows "not launched yet / 0 so far". Fees and rewards depend on trading volume and may be zero; no returns are promised. Pinch aims to be one of the first pump.fun coins launched by an AI agent and paired with another pump coin.


This is the brand home and tooling for a pump.fun coin quoted in **$CLAWD** (`8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`). It uses `create_v2` pump-coin quotes (pump-sdk 4.1.0).

- `app/`: Vite + React + Tailwind + Framer Motion site. It includes the pair dashboard, a Phantom multi-hop buy (SOL → CLAWD → NEW, built and signed client-side), a live fee flywheel, a rewards eligibility checker, the transparency section and the dry-run log. It defaults to **devnet**, and mainnet is hard-disabled unless `VITE_MAINNET_ENABLED=true`.
- `scripts/`: devnet dry run (`dryrun.mjs`, `dryrun-step4.mjs`, `step5-snapshot-merkle.mjs`) and a read-only mainnet eligibility check (`01-mainnet-check.mjs`). The scripts refuse any RPC URL containing "mainnet".
- `DRYRUN.md`: results and the issues found. `LAUNCH.md`: names, metadata, launch sequence and draft posts.

## Security model
- The server never holds keys and never signs. Users sign in Phantom, and the owner signs launch and admin transactions in their own wallet.
- `devnet-test/` (throwaway keypairs) is gitignored. No secrets are in this repo.

## Run
```bash
cd app && bun install && bun run dev            # devnet
VITE_NETWORK=local bun run dev                   # against a local devnet fork
```

## Deploy (Railway)
`app/Dockerfile` + `app/railway.json`. Set the service root directory to `app`, and set the build args/variables listed in `.env.example`. Railway needs a project token or `railway login`, which we didn't have, so nothing has been deployed.

## Disclaimer
Memecoin experiment. No promise of returns. Not affiliated with pump.fun, Solana Labs or the Solana Foundation. "Toly" is an AI agent persona.

## Contact

[toly@mail.grokbot.com](mailto:toly@mail.grokbot.com)

## Build log (/log)

The public Build log page shows curated excerpts between the owner (cheshire) and Toly. Data: `app/src/lib/buildlog.json`, entries `{ id, timestamp (ISO with ET offset), speaker: "owner" | "toly", text, links: [{ label, url }], approved }`. Only `approved: true` entries render.

- Add: append an entry with a unique `id` and `"approved": false`. Use devnet explorer links for test txs.
- Approve: `bun scripts/approve-log.ts <id>` (revoke with `--revoke`). Only the owner approves.

Redaction rule: never include private keys, seed phrases, API keys or auth tokens, emails other than toly@mail.grokbot.com, or private file paths. Copy rules: say "one of the first bot founders", never "the first"; no promises of returns; Toly is an AI agent persona, not Anatoly Yakovenko.
