# $CLAWD holder snapshots → Pinch-funded rewards (design)

Status: **design + read-only prototype**. Nothing here signs, sends, or holds keys. The merkle claim program does not exist yet.
Prototype: `bun scripts/snapshot.ts` → `snapshots/clawd-<slot>.json` + `.csv` + merkle root.

## 1. Goal
Pinch is a **creator-fee + holder-rewards coin**: creator fees fund the agent (Toly), and a share goes to holders via the snapshot merkle claims described here. The site's Earnings section reads distributed totals only from published `snapshots/epoch-N.json` files (none yet; the existing `clawd-463471526.json` is a raw-balance prototype with 0 distributed).
Pinch ($PINCH, paired with CLAWD on pump.fun) creator fees fund (a) CLAWD buybacks and (b) epoch rewards for holders of CLAWD (and later PINCH).
Rewards are distributed by a merkle-root claim distributor: one root per epoch, each wallet claims with a proof.
Snapshots have to be real-time (so there's nothing to game at a fixed slot), hard to flash-buy into, and verifiable by anyone.

Token facts: mint `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`, Token-2022, 6 dp, graduated.
PumpSwap pool `GBzd5ooMFkYtYgzUMKfzyaEJpvzxvm5FK4FDJcpVJJcH`, bonding curve `HJYrK1vLqwQYjUJn3taqfaFX4yf7Yx6qCHAUGag9rAHj`.

## 2. Realtime tracking (indexer)
- **Stream:** Helius/Triton **Yellowstone gRPC**. Subscribe to account updates for Token-2022 accounts filtered by `memcmp(offset 0 = CLAWD mint)`. Each update carries the new balance and slot, so balances can be recorded directly without decoding transactions. Cheaper fallback: a websocket `programSubscribe(Token-2022, memcmp mint)`, or `logsSubscribe(mentions: [mint])` with a `getTransaction` call to pull pre/post token balances.
- **Reconcile:** every hour (and on indexer restart), run a full `getProgramAccounts(Token-2022, memcmp mint)`. The prototype does exactly this. Overwrite any balances that drifted and log the diff. `getTokenLargestAccounts` is a cheap check on the top 20 accounts in between full runs.
- Keep balances **per owner**, summing every token account the wallet holds (ATA and non-ATA). Store data at `confirmed` commitment, and finalize an epoch only from `finalized` slots.

## 3. Scoring (anti flash-buy)
- **Hourly samples:** at each hour boundary H, record `bal[w,H] = balance at the first finalized slot ≥ H`. A randomized minute inside the hour (published afterwards with a commit-reveal of the seed) makes the sampling time harder to target.
- **Time-weighted balance:** `score[w] = Σ_H min(bal[w,H], CAP)` over the epoch, so a holder present for all 168 hourly samples outweighs someone who bought one hour ago.
- **Min hold:** a wallet counts only after holding ≥ `MIN_BAL` for ≥ 24 consecutive samples in the epoch. Optional extra rule: if a wallet sells more than X% mid-epoch, drop its earlier samples to the post-sell balance (no "hold then dump").
- **Exclusions (score = 0):** PumpSwap pool, bonding curve, any LP/vault PDA (prototype: all off-curve owners), the creator/dev wallets, burn address, known CEX hot wallets (maintained list in `config/exclude.json`), and the Pinch fee/treasury and distributor vaults.
- **User wallet (~34%) — USER DECISION:** (a) exclude it entirely (recommended; otherwise ~a third of rewards go back to the funder), (b) cap it at e.g. 2% of supply like every other wallet, or (c) include it uncapped. A per-wallet `CAP` (e.g. 1–2% of supply) also limits whales in general.
- **Pinch dual-holder boost (later):** `score = scoreCLAWD × (1 + k·[holds PINCH ≥ min for the epoch])`, or two separate pools. **User decision:** the split between buyback and rewards, and k.
- `reward[w] = floor(epochPool × score[w] / Σscore)`. Rounding dust carries over to the next epoch.

## 4. Epochs and merkle roots
- Epoch = 7 days (configurable), closes at a finalized slot. Build steps:
  1. Freeze the samples.
  2. Compute rewards.
  3. Sort leaves by wallet.
  4. leaf = `sha256(0x00 ‖ wallet(32) ‖ amount u64 BE)`, node = `sha256(0x01 ‖ sorted(a,b))`. Same format as `step5-snapshot-merkle.mjs` and the prototype. Add `epoch` to the leaf once the program exists, so a proof can't be replayed in another epoch.
- The claim program (to be built and audited) stores `{epoch, root, mint, vault, total}`, keeps a claimed bitmap or a `ClaimStatus` PDA per (epoch, wallet), and only pays out amounts covered by the proof. Funding the vault and posting a root are the only privileged actions; use a multisig (Squads), not a hot key.
- Unclaimed rewards roll over or are clawed back after N epochs (**user decision**).

## 5. Storage
- Postgres (Railway, next to the app): `balances(owner, amount, slot)`, `samples(epoch, hour, owner, amount)`, `epochs(id, start_slot, end_slot, root, pool, csv_sha256)`, `leaves(epoch, owner, amount, proof jsonb)`. Cloudflare D1 + R2 also works at this scale (the prototype found about 1.1k holders).
- Artifacts are immutable per epoch: `snapshots/epoch-N.csv`, `epoch-N.json` (rules version, exclusions, slots, root). They're also pinned to R2/Arweave.

## 6. Public verifiability
- A `/proof` page section lists each epoch's root, slot range, CSV link and sha256, rules hash, and the on-chain tx that posted the root.
- `scripts/snapshot.ts` (and a future `verify.ts`) rebuilds the root from the CSV, so anyone can check it with any RPC. A wallet lookup returns its leaf and proof.
- Exclusions are published with a reason for each.

## 7. Anti-sybil
- Splitting into many wallets gains nothing when rewards are pro-rata (the score is linear). It only helps get around `CAP`, so: cluster wallets that were funded by the same source or swept to the same destination (heuristics, reviewed by hand for large clusters), and set a `MIN_BAL` so dust wallets cost more in rent and fees than they earn.
- Time-weighting already makes flash loans and one-block buys worthless.
- Claim-time checks (optional): the wallet must still hold ≥ `MIN_BAL`.

## 8. Costs (rough)
- Yellowstone gRPC: Helius dedicated/LaserStream or Triton, roughly $200–1000+/mo. Websocket on a Helius Developer plan (~$49/mo) works at this volume.
- Hourly gPA: about 1.1k accounts, one call (~1–2 s on a public RPC). That's negligible, but public RPCs rate-limit and may drop gPA, so use a keyed RPC in production.
- Postgres on Railway: about $5–20/mo. Posting a root costs about 0.000005 SOL plus rent. Each claimer pays about 0.002 SOL rent for a ClaimStatus PDA (or use a bitmap to make it cheaper).
- No returns are implied. Rewards depend entirely on Pinch fee volume.

## 9. Prototype snapshot (read-only)
Slot 463471526 (2026-10-30), full gPA on a keyless RPC:
- 1093 owners with balance: 1043 eligible, 50 excluded (pool + off-curve/PDA owners).
- Eligible wallets hold ~74.4% of supply. Top wallet `6rEiHJ…DB4Z` ≈ 32.6% (likely the user's — confirm), #2 `GAVhJ6…FMF` ≈ 21.1% (identify: team/CEX/locker?), pool ≈ 20.7%.
- Root (raw balances, not time-weighted): `5834da357a734409b3cb47ebaa3e8cdd86dad711968bc0fa5514ffd39b337e5d`.

## 10. Decisions needed from the user
1. The user's ~34% wallet: exclude / cap / include.
2. Per-wallet CAP and MIN_BAL values. Epoch length.
3. Pinch fee split: buybacks vs. rewards. What to do with bought-back CLAWD (burn, rewards, treasury). Dual-holder boost k.
4. Unclaimed policy. Multisig signers for root posting.
5. Identify wallet #2 (21%), the large off-curve holders (`6xXJaE…ozVR` 3.4%, `GwawyuY…U4D` 0.9%), and any CEX wallets.
6. Build/audit the claim program (or adopt an audited merkle distributor, e.g. Jito's) before any mainnet funds.
