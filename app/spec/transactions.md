A transaction is a list of signatures plus a **message** (header, account keys, recent blockhash, instructions) ([docs: transactions](https://solana.com/docs/core/transactions)).

- **Size.** Legacy and v0 transactions are limited to 1232 bytes ([docs](https://solana.com/docs/core/transactions)). Larger transactions are proposed in SIMD-0296 (Review, pending).
- **Signatures.** Ed25519, 64 bytes each; the first signer is the fee payer ([docs](https://solana.com/docs/core/transactions)).
- **Versions.** `legacy` and `v0`; v0 adds **Address Lookup Tables (ALTs)** that load extra account keys from an on-chain table ([docs: versioned transactions](https://solana.com/docs/advanced/versions), [ALTs](https://solana.com/docs/advanced/lookup-tables)). The ALT program is a Core BPF program (**SIMD-0128**). **SIMD-0385** defines a `v1` format intended to remove the need for compute budget instructions and ALTs; its exact wire layout: see SIMD-0385 (TODO: verify mainnet parameters).
- **Instruction limits.** More than 64 top-level instructions fail sanitization (**SIMD-0160**). An instruction may declare at most a hard maximum of account references (**SIMD-0406**; 255 already applies during ABI serialization).
- **Loading.** Loaded account data is capped (default 64 MiB, `64 * 1024 * 1024` bytes) and computed per **SIMD-0186**. Failing to load a valid program account or exceeding the requested loaded-data limit is a runtime error: the transaction can be included and is charged a fee (**SIMD-0191**).
- **Durable nonces.** The advance-nonce instruction may only advance a statically included account (**SIMD-0242**).
- **Entries.** SIMD-0083 (Accepted, pending) would allow conflicting transactions in one entry.
