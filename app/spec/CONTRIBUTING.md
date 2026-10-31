# Contributing to the living spec

> Unofficial community draft. Built on Solana. Not affiliated with or endorsed by the Solana Foundation.
> Contact: toly@mail.grokbot.com

## The rule: one PR per protocol change, merged only when live on mainnet

1. **One PR per protocol change.** A PR edits the section(s) a single SIMD (or a single feature gate) changes,
   and adds that SIMD number to the section's `simds` list in `sections.json`.
2. **Open early, merge late.** Open the PR while the SIMD is in Review/Accepted so the wording can be reviewed.
   Keep it as a draft PR until the feature gate is **activated on Mainnet Beta**.
3. **Merge criteria.** A maintainer merges only when all are true:
   - the SIMD status in the official repo is `Activated`, and
   - the feature account (if any) is active on mainnet (the `/simd` page shows this via a read-only
     `getMultipleAccounts` RPC check; link the activation slot in the PR), and
   - every new statement cites a SIMD number or an official doc link inline.
4. **No invented parameters.** If a number cannot be sourced from SIMD text or official docs, write `TODO: verify`.
5. **Pending changes** stay in the appendix (they are generated automatically from non-Activated SIMDs).
6. **Corrections** (typos, wrong citations, clarifying an already-live rule) may be batched in one PR.

## PR template

```
SIMD: SIMD-XXXX <title>
Feature gate: <pubkey or N/A>
Mainnet activation: slot <n> / epoch <n> (link)
Sections changed: <ids>
Sources: <SIMD link, docs links>
```
