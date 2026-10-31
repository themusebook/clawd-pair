# CLAWD airdrop claim — distribution plan (draft, 2026-10-31)

Goal: distribute CLAWD rewards to CLAWD holders through a snapshot → merkle → claim
system on pinch.musebook.trade, per the design in SNAPSHOTS.md. Nothing in this plan
signs or sends. Mainnet moves only on the owner's explicit approval, owner signs.

## How it works (the pipeline)

1. **Snapshot** — hourly balance samples per owner (all token accounts summed),
   finalized slots only. At ~1.1k holders a keyed-RPC `getProgramAccounts` reconcile
   is enough for v1; skip Yellowstone gRPC until volume justifies $200–1000/mo.
2. **Score** — time-weighted balance over the epoch (7 days = 168 hourly samples),
   per-wallet CAP, MIN_BAL held ≥24 consecutive samples. Kills flash-buy gaming.
3. **Merkle root** — leaf format already fixed by the devnet dry run:
   `sha256(0x00 ‖ wallet ‖ amount u64 BE)`, nodes `sha256(0x01 ‖ sorted pair)`,
   epoch added to the leaf once the program exists (anti-replay).
4. **Distributor** — on-chain program holds `{epoch, root, mint, vault, total}`.
   Owner funds the vault and posts the root (only privileged actions). Each holder
   claims with their proof; a ClaimStatus PDA (or bitmap) prevents double claims.
   Unclaimed funds claw back / roll over after the window.
5. **Claim UX** — pinch.musebook.trade: the app already ships an eligibility
   checker, Earnings and /proof pages. The user connects Phantom, sees their
   amount + proof, signs the claim. The server never holds keys and never signs.
6. **Verify** — every epoch publishes `snapshots/epoch-N.csv` + `.json` (rules,
   exclusions with reasons, slot range, root, sha256). Anyone can rebuild the root
   from the CSV with any RPC.

## Distributor program — recommendation

**Adopt the Jupiter merkle-distributor (Jito lineage, audited design) with the
Token-2022 patch.** A patch diff already sits in `clawd-pump-hybrid/vendor`;
the program source is not on this box and nothing is deployed yet — building and
deploying it is the main engineering task. CLAWD is Token-2022, so the patch is
load-bearing: verify it covers transfer-fee-free claims for this mint.

Alternatives considered:
- *Streamflow Airdrops* — hosted, no program to build, but fees, their claim page,
  less control over epochs/clawback. Fallback if the build slips.
- *Direct batched sends (no claim)* — cheapest today (eligible wallets already
  hold CLAWD, so ATAs exist; ~674 sends ≈ a few cents of fees in batches), but no
  claim UX, no clawback, dust lands in dead wallets, and it is not the "claim"
  product the site promises. Useful only as a one-off, not the system.

## Epoch 0 — from the owner's holder export (2026-10-31)

Export: top 1,000 holders, 773,954,806 CLAWD total. (The on-chain prototype
counted 1,093 owners at slot 463471526 — epoch 0 must run the full gPA snapshot,
not the truncated CSV.)

- PumpSwap pool `GBzd5ooM…JJcH` — 20.66% — exclude (protocol account).
- Owner stash `6rEiHJ4J…DB4Z` — 32.89% — **decision 1** (exclude recommended).
- `GAVhJ6sG…rFMF` — 21.06% (163,000,000 even) — **unidentified**. An even 163M
  smells like a locker/vesting/CEX account; if so it should be excluded too.
  **Decision 4: who is this?**
- Sketch eligibility (exclude pool + stash, MIN_BAL 100 CLAWD):
  **674 wallets holding 359,457,877 CLAWD (46.4% of the export).**
  At MIN_BAL 1,000: 578 wallets. At 10,000: 335.

Funding: PINCH has not launched, so there is no fee pool yet. Epoch 0 is either
seeded by the owner (amount + source wallet = **decision 2**) or waits until
PINCH fees accrue. Rewards must never be promised before the pool exists.

## Build sequence

1. Owner decisions (below) → freeze `config/rules.json` (versioned, published).
2. Snapshot job: hourly gPA samples → Postgres on the pinch Railway project
   (alongside pinch-web), exclusions from `config/exclude.json`.
3. Distributor: fetch Jupiter distributor source, apply Token-2022 patch,
   LiteSVM tests (claim, double-claim blocked, wrong-proof blocked, clawback).
4. Devnet dress rehearsal: test mint, epoch 0 dry root, fund, claim from two
   wallets, clawback — all on devnet, receipts recorded like DRYRUN.md.
5. Claim UI: wire the existing eligibility checker to epoch files + a claim
   transaction builder (Phantom signs client-side).
6. Publish epoch-0 artifacts on /proof before claims open.
7. Mainnet: owner funds vault + posts root from his own wallet (Squads multisig
   recommended from epoch 1). Explicit owner go required — same gate as launch.

## Decisions needed from the owner

1. Stash (32.89%): **DECIDED 2026-10-31 — exclude entirely.** The stash
   `6rEiHJ4J…DB4Z` goes in `config/exclude.json` with reason "owner stash".
2. Epoch 0 funding: **DECIDED 2026-10-31 — wait for PINCH fees.** No seeding.
   Epoch 0 opens only after PINCH launches and its creator fees (paid in CLAWD,
   split per the fee-sharing config) accrue a real pool. Nothing is promised
   before the pool exists.
3. MIN_BAL and CAP: **DECIDED 2026-10-31 — recommended defaults adopted.**
   MIN_BAL = 100 CLAWD; per-wallet CAP = 2% of the epoch pool.
4. Identify `GAVhJ6sG…rFMF` (21.06%) and the other large off-curve holders.
   **Still open** — until identified it stays eligible by default.
5. Unclaimed policy: **DECIDED 2026-10-31 — roll into the next epoch,**
   clawback only after 4 epochs unclaimed.
6. Epoch length: **DECIDED 2026-10-31 — 7 days.**
