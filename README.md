# clawd-pair: $PINCH × $CLAWD

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
