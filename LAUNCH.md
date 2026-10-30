# Launch kit: $PINCH × $CLAWD

> Drafts only. Nothing in this file has been posted or launched. **Mainnet launch happens only after the owner explicitly approves it, and the owner signs with their own wallet.**

## Name options
| # | Name | Ticker | Angle |
|---|---|---|---|
| **1 (default)** | **Pinch** | **$PINCH** | "The first claw the CLAWD grew." Short and on-theme. A pinch is what a claw does. |
| 2 | Molt | $MOLT | Crabs molt to grow. A new shell on top of CLAWD. |
| 3 | Clawlet | $CLAWLET | CLAWD's little sibling. Obvious lineage, but less punchy. |

**Persona note:** "Toly" is the community's AI agent persona. It is not, and must never claim to be, any real person. Don't use Anatoly Yakovenko's name, photo or likeness, and don't use "Solana" in the coin's name or ticker. The disclaimer in the app says this. **Risk:** "toly" is also a well-known nickname, so consider renaming the agent persona before mainnet, for example "Clawdbot" or "Tolly the crab".

## create_v2 metadata (upload to IPFS, pass as `uri`)
```json
{
  "name": "Pinch",
  "symbol": "PINCH",
  "description": "The first claw the CLAWD grew. A pump.fun coin quoted in $CLAWD (not SOL), launched by an AI agent. Every buy routes SOL → CLAWD → PINCH. Memecoin experiment: no intrinsic value, no promise of returns. Not affiliated with pump.fun or the Solana Foundation.",
  "image": "ipfs://<IMAGE_CID_TBD>",
  "showName": true,
  "createdOn": "https://pump.fun",
  "twitter": "https://x.com/<X_HANDLE_TBD>",
  "telegram": "<TG_TBD>",
  "website": "https://<RAILWAY_OR_CUSTOM_DOMAIN_TBD>"
}
```

## create_v2 arguments (mainnet, after approval)
- `quoteMint` = `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` (Token-2022), with `quoteTokenProgram` = `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`
- `pumpQuote` from `OnlinePumpSdk.fetchPumpQuote(CLAWD)`. It includes the CLAWD curve `HJYr…rAHj`, pool `GBzd…JJcH` and the pool's vaults.
- `mayhemMode: false` (required for a token-paired coin). Leave `holderReward` unset, because fee sharing is used instead.
- `creator` and `user` = the **owner's wallet**. The transaction is built client-side and signed in Phantom.

## Launch-day sequence (owner signs each step)
1. Upload the metadata and get its URI. Confirm the X handle.
2. `create_v2` (+ an optional small initial buy) with CLAWD as quote.
3. Create Token-2022 CLAWD ATAs for the shareholder wallets (buyback/LP, rewards, ops).
4. Sweep, then `create_fee_sharing_config`, then `update_fee_shares_v2` (for example 50/40/10). **This can't be changed afterwards.**
5. Set `VITE_COIN_MINT` and `VITE_NETWORK=mainnet`. Set `VITE_MAINNET_ENABLED=true` **only with approval**, then redeploy the app.
6. Publish the snapshot rule and the first root before any rewards go out.

## 10 draft X posts (not posted)
1. A crab grew a new claw. 🦀 $PINCH is quoted in $CLAWD, not SOL. Every buy routes SOL → CLAWD → PINCH in one tx. Built and tested by an AI agent, signed by a human. Not financial advice.
2. pump.fun shipped pump-coin quotes for create_v2, so a coin can be priced in another pump coin. We tried it on devnet first, end to end: curve → graduation → paired coin → multi-hop → fee split. Receipts: <link>
3. How $PINCH works: you pay SOL → the route buys $CLAWD → $CLAWD buys $PINCH. One signature in your wallet. Our server never touches your keys.
4. Creator fees on $PINCH are paid in $CLAWD and split on-chain by pump.fun's fee-sharing program. Once the split is set, it can't be changed. Anyone can trigger the distribution. Details: <link>
5. The devnet test split creator fees 50/40/10 to the base unit, with signatures in the repo. We'd rather show the work than make promises.
6. Rewards are snapshot-based, not buy-based. Hold at the snapshot slot and you're in the merkle root anyone can recompute. Discretionary, may change, never guaranteed.
7. Built by Toly, our Grok Bot AI agent: research, scripts, devnet tests, the site. Every transaction is signed by the human owner. Toly is a bot persona, not a real person.
8. Launch status: devnet ✅. Mainnet: waiting on owner approval. No presale, no team allocation, no whitelist. Fair launch on the bonding curve.
9. PSA: the only $PINCH contract is the one posted from this account and the site. Quoted in $CLAWD 8cHz…pump. Don't trust DMs.
10. $PINCH is a memecoin experiment. No roadmap, no intrinsic value, no expectation of profit. Not affiliated with pump.fun or the Solana Foundation. If you play, only use what you can lose. 🦀

> Logo: upload `app/public/pinch-512.png` and put its CID in `image`.
