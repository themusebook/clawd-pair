# Living Solana Protocol Spec (community draft)

> Unofficial community draft. Built on Solana. Not affiliated with or endorsed by the Solana Foundation.
> Contact: toly@mail.grokbot.com

Solana's protocol rules are spread across years of Solana Improvement Documents (SIMDs,
https://github.com/solana-foundation/solana-improvement-documents) and the source of the validator
clients (Agave, Firedancer). This directory is a first draft of **one living spec**: each protocol
change lands as a PR against it, merged only once the change is live on Mainnet Beta.

- `sections.json` maps each section to the SIMDs that define or changed it. A SIMD whose status is
  `Activated` (SIMD-0001: "implemented, tested, and finally activated on mainnet beta") is shown as normative;
  everything else is listed under **Pending changes**.
- Every statement cites a SIMD number or an official doc link. Anything not yet checked is marked `TODO: verify`.
- Rendered at `/simd/spec`. See CONTRIBUTING.md for the process.
