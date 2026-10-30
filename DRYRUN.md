# Dry-run results

**Where it ran:** a local `solana-test-validator` cloned from devnet. It uses pump.fun's real devnet bytecode for `pump` (6EF8…F6P), `pump_amm` (pAMM…XEA) and `pump_fees` (pfee…VZ), plus the devnet `Global`, `FeeConfig`, `quote-control` and volume-accumulator accounts. I used a fork because the public devnet faucet and the Helius devnet airdrop were both rate-limited, and api.devnet.solana.com wasn't reachable from the build box. The signatures below only exist on that local fork. To repeat the run on public devnet, fund `devnet-test/owner.json` and `buyer.json` with about 3 SOL each and run `RPC=<devnet rpc> CLUSTER=devnet node scripts/dryrun.mjs && node scripts/dryrun-step4.mjs && node scripts/step5-snapshot-merkle.mjs`.

On devnet, `Global.initialVirtualSolReserves` is 0.3 SOL, so graduating a coin takes about 1 SOL. `maxCurveDepth` is 2.

**Mainnet read-only check:** CLAWD `8cHz…pump` has a pump bonding curve `HJYrK1vLqwQYjUJn3taqfaFX4yf7Yx6qCHAUGag9rAHj` with `complete=1`. Its canonical PumpSwap pool `GBzd5ooMFkYtYgzUMKfzyaEJpvzxvm5FK4FDJcpVJJcH` exists. That makes CLAWD eligible as a quote at depth 0, so a new coin paired with it would be depth 1.

| step | result | sig / data |
|---|---|---|
| 2a create_v2 A (SOL) | ✅ | `5CBytPzs5qRhGLKCCGpB…` |
| 2b buy_v3 A small (buyer) | ✅ | `4d75grTCaMyrXcTkxrkQ…` |
| 2c buy_v3 A to graduation (owner) | ✅ | `5c3xnpLtCUtKoXe2JLMQ…` |
| 2d migrate_v2 A | ✅ | `2hfB5wgCQ6ajt3bGhwPE…` |
| 3a create_v2 B (quote=A) | ✅ | `3Q3HwbYNM3ECQTNLNScG…` |
| 3b buy_v3 B with A (owner) | ✅ | `2QU3UhdhARGUjNyajapQ…` |
| 3c sell_v3 B half (owner) | ✅ | `3E6snmvAQFUcW1CTWqmH…` |
| 3d multi_hop_swap SOL->A->B (buyer) | ✅ | `3pbETwN4bj3ihnPjb8Uh…` |
| 4a create_fee_sharing_config B | ✅ | `2oPLE78EjnrhdxJCgxvX…` |
| 4b update_fee_shares_v2 50/40/10 | ❌ Program log: Instruction: DistributeCreatorFeesV2 / Program log: ProgramError occurred. Error Code: InvalidAccountData. Error Number: 171798 |  |
| 4c trade B to accrue fees (buyer multi-hop again) | ✅ | `5h9EP7237Wq2fFGsneuL…` |
| 4d sweep+distribute creator fees B | ✅ | `3RPzdB1NSQaQKP68kvzx…` |
| 4e fee split (A base units) | ✅ | w50=0, w40=0, w10=0 |
| 4b' sweep + ATAs + update_fee_shares_v2 50/40/10 | ❌ Transaction too large: 1241 > 1232 |  |
| 4c' multi_hop SOL->A->B 0.3 SOL (buyer) | ✅ | `521KyMoQUpCakbhn95Nr…` |
| 4d' sweep + distribute_creator_fees_v2 | ✅ | `32ti9e7NMijapYD8KsnN…` |
| 4e' fee split received (coin A base units) | ✅ | w50=0, w40=0, w10=0 |
| 4b0 create shareholder ATAs | ✅ | `5rpHyKph4cLgGTXvp69g…` |
| 4b' sweep + update_fee_shares_v2 50/40/10 | ✅ | `4qaBQm4GB3PsqPSXQ283…` |
| 4c' multi_hop SOL->A->B 0.3 SOL (buyer) | ✅ | `4AaFqoc6dn3MmRB9vTz4…` |
| 4d' sweep + distribute_creator_fees_v2 | ✅ | `5CfhiUfB45RdKkqjr2yb…` |
| 4e' fee split received (coin A base units) | ✅ | w50=23496195430, w40=18796956344, w10=4699239086 |
| 5 snapshot+merkle root+claim payout (owner-signed transfer w/ memo) | ✅ | `5y71yPbqtZmQWqn11zW9…` |

Mints on the fork: see `mints-local.json`. All signatures are in `dryrun-local.json`.

## Issues found
1. The first `update_fee_shares_v2` failed with `InvalidAccountData` inside the `distribute_creator_fees_v2` CPI. **Fix:** create the shareholders' Token-2022 ATAs for the quote mint first, in a separate transaction, because ATAs plus update don't fit in 1232 bytes. Also put `sweep_creator_fee` (creator = sharing-config PDA) before the update.
2. On a token-quoted coin, the creator fees you distribute are paid in the **quote coin** (CLAWD), not SOL. The 50/40/10 split matched exactly: 23,496,195,430 / 18,796,956,344 / 4,699,239,086 base units.
3. Step 5's claim was an owner-signed SPL transfer, not a trustless merkle-distributor claim. The Jupiter merkle-distributor Token-2022 patch in `clawd-pump-hybrid/vendor` is only a diff. The program source isn't on the box and it isn't deployed on devnet, so building and deploying it is the next task.
